import { keccak256, zeroAddress, type Address } from "viem";
import { ABIS, ADDRESSES, publicClient, sameAddress, type ContractName } from "./config";
import { poolIdOf, readValue, stateViewAbi } from "./read";
import hashes from "./runtime-hashes.json";
import infrastructure from "./infrastructure-hashes.json";
import type { Snapshot } from "./types";
const names = { token: "PrismRiotToken", vault: "StakingVault", hook: "TreasuryFeeHook", treasury: "FeeTreasury", arena: "Arena", adapter: "OracleAdapter" } as const;
export interface VerifiedRead { blockNumber: bigint; timestamp: number; observedAt: number; verified: boolean; verificationErrors: string[]; }
export interface FinancialAccount { address: Address; eth: bigint; prio: bigint; }
export interface StakingRead extends VerifiedRead { vault: Snapshot["vault"]; account?: FinancialAccount & { staked: bigint; earned: bigint; vaultAllowance: bigint }; }
export interface SwapRead extends VerifiedRead { hook: Snapshot["hook"]; pool: Snapshot["pool"]; account?: FinancialAccount & { tokenAllowance: bigint; routerAllowance: bigint; routerExpiration: number }; }
export async function freshBlock() {
  const [block, chain] = await Promise.all([publicClient.getBlock(), publicClient.getChainId()]);
  if (chain !== 1) throw new Error("RPC returned the wrong network. Ethereum mainnet is required; retry the fallback RPC.");
  if (Math.abs(Date.now() / 1000 - Number(block.timestamp)) > 300) throw new Error("RPC returned stale Ethereum data. Refresh or retry the fallback RPC.");
  return block;
}
export async function verifyTargets(targets: (ContractName | keyof typeof infrastructure)[], blockNumber: bigint) {
  const errors: string[] = [];
  await Promise.all(targets.map(async name => {
    const code = await publicClient.getCode({ address: ADDRESSES[name], blockNumber });
    const expected = name in names ? hashes[names[name as ContractName]] : infrastructure[name as keyof typeof infrastructure];
    if (!code || code === "0x" || keccak256(code) !== expected) errors.push(`${name}: deployed code does not match the verified contract. Stop and review the target.`);
  }));
  return errors;
}
async function accountRead(address: Address, n: bigint): Promise<FinancialAccount> {
  const [eth, prio] = await Promise.all([publicClient.getBalance({ address, blockNumber: n }), readValue<bigint>("token", "balanceOf", [address], n)]);
  return { address, eth, prio };
}
// Only the vault and token are needed: oracle, treasury and game RPC failures cannot block principal.
export async function readStaking(account?: Address): Promise<StakingRead> {
  const block = await freshBlock(), n = block.number;
  const fields = ["prio", "rewardFunder", "totalStaked", "rewardReserve", "rewardsOwed", "rewardRate", "rewardsDuration", "periodFinish"];
  const [values, verificationErrors] = await Promise.all([
    publicClient.multicall({ contracts: fields.map(functionName => ({ address: ADDRESSES.vault, abi: ABIS.vault, functionName })), blockNumber: n, allowFailure: false }),
    verifyTargets(["token", "vault"], n),
  ]);
  const vault = Object.fromEntries(fields.map((f, i) => [f, values[i]])) as unknown as Snapshot["vault"];
  if (!sameAddress(vault.prio, ADDRESSES.token)) verificationErrors.push("The vault PRIO binding differs. Stop and review the target.");
  let user: StakingRead["account"];
  if (account) {
    const [balances, staked, earned, vaultAllowance] = await Promise.all([accountRead(account, n), readValue<bigint>("vault", "staked", [account], n), readValue<bigint>("vault", "earned", [account], n), readValue<bigint>("token", "allowance", [account, ADDRESSES.vault], n)]);
    user = { ...balances, staked, earned, vaultAllowance };
  }
  return { blockNumber: n, timestamp: Number(block.timestamp), observedAt: Date.now(), verified: !verificationErrors.length, verificationErrors, vault, account: user };
}
// No dependency on IMD, Arena, OracleAdapter or the separately hosted operator.
export async function readSwap(account?: Address): Promise<SwapRead> {
  const block = await freshBlock(), n = block.number;
  const fields = ["treasury", "initialized", "FEE_BPS", "poolId", "poolKey", "token", "poolManager"];
  const [values, verificationErrors, owner] = await Promise.all([
    publicClient.multicall({ contracts: fields.map(functionName => ({ address: ADDRESSES.hook, abi: ABIS.hook, functionName })), blockNumber: n, allowFailure: false }),
    verifyTargets(["token", "hook", "poolManager", "router", "quoter", "stateView", "permit2"], n),
    readValue<Address>("hook", "owner", [], n),
  ]);
  const raw = Object.fromEntries(fields.map((f, i) => [f, values[i]]));
  const hook = { ...raw, feeBps: raw.FEE_BPS } as unknown as Snapshot["hook"];
  const key = hook.poolKey;
  if (!sameAddress(owner, ADDRESSES.owner)) verificationErrors.push("Hook owner differs from the verified project owner.");
  if (!sameAddress(hook.treasury, ADDRESSES.treasury)) verificationErrors.push("The hook treasury differs from the verified fee recipient.");
  if (!sameAddress(hook.token, ADDRESSES.token) || !sameAddress(hook.poolManager, ADDRESSES.poolManager)) verificationErrors.push("The hook token or PoolManager binding differs.");
  if (!hook.initialized || key.currency0 !== zeroAddress || !sameAddress(key.currency1, ADDRESSES.token) || !sameAddress(key.hooks, ADDRESSES.hook) || key.fee !== 12500 || key.tickSpacing !== 60 || poolIdOf(key) !== hook.poolId || hook.feeBps !== 50n) verificationErrors.push("ETH/PRIO pool or immutable 0.5% hook fee verification failed.");
  const [slot, liquidity] = await Promise.all([
    publicClient.readContract({ address: ADDRESSES.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [hook.poolId], blockNumber: n }),
    publicClient.readContract({ address: ADDRESSES.stateView, abi: stateViewAbi, functionName: "getLiquidity", args: [hook.poolId], blockNumber: n }),
  ]);
  let user: SwapRead["account"];
  if (account) {
    const { permit2Abi } = await import("./swap");
    const [balances, tokenAllowance, allowance] = await Promise.all([
      accountRead(account, n), readValue<bigint>("token", "allowance", [account, ADDRESSES.permit2], n),
      publicClient.readContract({ address: ADDRESSES.permit2, abi: permit2Abi, functionName: "allowance", args: [account, ADDRESSES.token, ADDRESSES.router], blockNumber: n }),
    ]);
    user = { ...balances, tokenAllowance, routerAllowance: allowance[0], routerExpiration: allowance[1] };
  }
  return { blockNumber: n, timestamp: Number(block.timestamp), observedAt: Date.now(), verified: !verificationErrors.length, verificationErrors, hook, pool: { sqrtPriceX96: slot[0], tick: slot[1], protocolFee: slot[2], lpFee: slot[3], liquidity }, account: user };
}
