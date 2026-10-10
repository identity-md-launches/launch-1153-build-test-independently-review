import {
  isAddress,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { ABIS, ADDRESSES, publicClient, sameAddress } from "./config";
import { poolIdOf, readSnapshot, stateViewAbi } from "./read";
import { quoterAbi } from "./swap";
import { executeCall } from "./write";
import type { PoolKey, StatusListener } from "./types";

// Protocol identity from the accepted commit's docs/DEPLOYMENT.md and ConfigPlan, not an operator wallet.
export const VERIFIED_INTAKE: Address =
  "0x1397434cd35e8a9c8ac312a61d3a285eb31dea56";
export const ORACLE_ACTION = stringToHex("oracle.request@oracle-1", {
  size: 32,
});
const intakeAbi = parseAbi([
  "function priceOf(bytes32 action,address asset) view returns(uint256)",
]);
export interface PhaseBProtocol {
  blockNumber: bigint;
  intake: Address;
  intakeCodeHash: Hex;
  action: Hex;
  imd: Address;
  price: bigint;
  poolKey: PoolKey;
  poolId: Hex;
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
  liquidity: bigint;
  quoteInputEth: bigint;
  quoteOutputImd?: bigint;
  quoteError?: string;
  poolSource:
    | "configured treasury pool"
    | "owner-supplied pool"
    | "accepted deployment document candidate; requires owner review";
}
export async function readPhaseBProtocol(
  poolInput?: { fee: number; tickSpacing: number; hooks: Address },
  intake: Address = VERIFIED_INTAKE,
): Promise<PhaseBProtocol> {
  const s = await readSnapshot();
  if (!s.verified) throw new Error(s.verificationErrors.join("; "));
  if (!isAddress(intake) || intake === zeroAddress)
    throw new Error("Supply a valid deployed Intake address");
  const code = await publicClient.getCode({
    address: intake,
    blockNumber: s.blockNumber,
  });
  if (!code || code === "0x")
    throw new Error("The supplied Intake has no deployed code");
  const price = await publicClient.readContract({
    address: intake,
    abi: intakeAbi,
    functionName: "priceOf",
    args: [ORACLE_ACTION, ADDRESSES.imd],
    blockNumber: s.blockNumber,
  });
  const candidate =
    poolInput ||
    (s.treasury.imdPoolSet
      ? s.treasury.imdPoolKey
      : { fee: 10000, tickSpacing: 200, hooks: zeroAddress });
  if (
    !Number.isInteger(candidate.fee) ||
    candidate.fee < 0 ||
    candidate.fee > 1_000_000 ||
    !Number.isInteger(candidate.tickSpacing) ||
    candidate.tickSpacing < 1 ||
    candidate.tickSpacing > 32767 ||
    !isAddress(candidate.hooks)
  )
    throw new Error("Invalid static ETH/IMD pool parameters");
  const poolKey: PoolKey = {
    currency0: zeroAddress,
    currency1: ADDRESSES.imd,
    fee: candidate.fee,
    tickSpacing: candidate.tickSpacing,
    hooks: candidate.hooks,
  };
  const poolId = poolIdOf(poolKey);
  const [slot0, liquidity] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.stateView,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [poolId],
      blockNumber: s.blockNumber,
    }),
    publicClient.readContract({
      address: ADDRESSES.stateView,
      abi: stateViewAbi,
      functionName: "getLiquidity",
      args: [poolId],
      blockNumber: s.blockNumber,
    }),
  ]);
  const output: PhaseBProtocol = {
    blockNumber: s.blockNumber,
    intake,
    intakeCodeHash: keccak256(code),
    action: ORACLE_ACTION,
    imd: ADDRESSES.imd,
    price,
    poolKey,
    poolId,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
    protocolFee: slot0[2],
    lpFee: slot0[3],
    liquidity,
    quoteInputEth: 100000000000000n,
    poolSource: poolInput
      ? "owner-supplied pool"
      : s.treasury.imdPoolSet
        ? "configured treasury pool"
        : "accepted deployment document candidate; requires owner review",
  };
  try {
    const quote = await publicClient.simulateContract({
      address: ADDRESSES.quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey,
          zeroForOne: true,
          exactAmount: output.quoteInputEth,
          hookData: "0x",
        },
      ],
      blockNumber: s.blockNumber,
    });
    output.quoteOutputImd = (quote.result as [bigint, bigint])[0];
    if (output.quoteOutputImd === 0n)
      output.quoteError = "No executable IMD output for this pool";
  } catch (error) {
    output.quoteError =
      error instanceof Error ? error.message : "IMD quote failed";
  }
  return output;
}

const phaseBMethods = {
  treasury: [
    "setReserveTarget",
    "setMaxSpendPerSwap",
    "setSpendPerWindow",
    "setReservePerWindow",
    "setPriceFloors",
    "setImd",
    "setImdPool",
    "setExecutor",
  ],
  adapter: [
    "setIntake",
    "setAction",
    "setPayment",
    "setCallbackConfigured",
    "setBudget",
    "setExecutor",
  ],
} as const;
/** Values are explicit owner input; no defaults are signed. Phase B never runs as part of Phase A. */
export async function executePhaseBCall(
  wallet: WalletClient,
  account: Address,
  contract: "treasury" | "adapter",
  functionName: string,
  args: readonly unknown[],
  onStatus?: StatusListener,
) {
  if (!sameAddress(account, ADDRESSES.owner))
    throw new Error("Only the verified project owner may configure operations");
  if (!(phaseBMethods[contract] as readonly string[]).includes(functionName))
    throw new Error("Unsupported Phase B function");
  const s = await readSnapshot(account);
  if (!s.verified || !s.phaseAComplete)
    throw new Error(
      "Complete verified Phase A bindings before configuring operations",
    );
  if (functionName === "setImd" && !sameAddress(String(args[0]), ADDRESSES.imd))
    throw new Error("Only the verified IMD asset is supported");
  if (functionName === "setIntake") {
    if (!sameAddress(String(args[0]), VERIFIED_INTAKE))
      throw new Error(
        "The entered Intake differs from the verified accepted protocol deployment. Review its provenance before adding support for a new Intake.",
      );
    await readPhaseBProtocol(undefined, args[0] as Address);
  }
  if (functionName === "setImdPool") {
    const protocol = await readPhaseBProtocol({
      fee: Number(args[0]),
      tickSpacing: Number(args[1]),
      hooks: args[2] as Address,
    });
    if (protocol.quoteError || !protocol.quoteOutputImd)
      throw new Error(
        "The owner-selected IMD pool did not provide an executable fresh quote",
      );
  }
  if (functionName === "setAction" && args[0] !== ORACLE_ACTION)
    throw new Error("Only the verified oracle action is supported");
  if (functionName === "setPayment") {
    if (!sameAddress(String(args[0]), ADDRESSES.imd))
      throw new Error("Oracle payment must use the verified IMD token");
    if (s.adapter.intake === zeroAddress)
      throw new Error("Set and verify Intake before setting payment");
    const protocol = await readPhaseBProtocol(undefined, s.adapter.intake);
    if (args[1] !== protocol.price)
      throw new Error(
        "The entered oracle price differs from fresh Intake.priceOf; review the current price",
      );
  }
  if (functionName === "setExecutor") {
    if (!isAddress(String(args[0])) || args[0] === zeroAddress)
      throw new Error(
        "Enter the real separately operated executor wallet; no placeholder is accepted",
      );
    if (
      !s.treasury.imdPoolSet ||
      !sameAddress(s.treasury.imd, ADDRESSES.imd) ||
      s.treasury.minImdPerEth === 0n ||
      s.treasury.minPrioPerEth === 0n ||
      s.treasury.maxSpendPerSwap === 0n ||
      s.treasury.spendPerWindow === 0n ||
      s.treasury.reservePerWindow === 0n ||
      !sameAddress(s.adapter.intake, VERIFIED_INTAKE) ||
      s.adapter.action !== ORACLE_ACTION ||
      !sameAddress(s.adapter.asset, ADDRESSES.imd) ||
      s.adapter.price === 0n ||
      s.adapter.liveIntakePrice !== s.adapter.price ||
      s.adapter.budgetPerWindow === 0n ||
      !s.adapter.callbackConfigured
    )
      throw new Error(
        "Configure reviewed prices, pool, Intake, action, payment, callback and budgets before assigning the executor",
      );
  }
  return executeCall(
    wallet,
    account,
    { address: ADDRESSES[contract], abi: ABIS[contract], functionName, args },
    `Phase B: ${contract}.${functionName}`,
    onStatus,
  );
}
