import {
  encodeAbiParameters,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  ABIS,
  ADDRESSES,
  publicClient,
  sameAddress,
  type ContractName,
} from "./config";
import hashes from "./runtime-hashes.json";
import infrastructureHashes from "./infrastructure-hashes.json";
import type {
  Snapshot,
  PoolKey,
  Round,
  RoundEntry,
  RoundSnapshot,
  OracleResult,
  PinnedQuestion,
} from "./types";

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32) view returns (uint128 liquidity)",
]);
const hashNames = {
  token: "PrismRiotToken",
  hook: "TreasuryFeeHook",
  treasury: "FeeTreasury",
  vault: "StakingVault",
  arena: "Arena",
  adapter: "OracleAdapter",
} as const;
export async function readValue<T>(
  contract: ContractName,
  functionName: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
): Promise<T> {
  return (await publicClient.readContract({
    address: ADDRESSES[contract],
    abi: ABIS[contract],
    functionName,
    args,
    blockNumber,
  })) as T;
}
async function readRecord<T>(
  contract: ContractName,
  names: string[],
  blockNumber: bigint,
): Promise<T> {
  const values = await publicClient.multicall({
    contracts: names.map((functionName) => ({
      address: ADDRESSES[contract],
      abi: ABIS[contract],
      functionName,
    })),
    blockNumber,
    allowFailure: false,
  });
  return Object.fromEntries(
    names.map((name, index) => [name, values[index]]),
  ) as T;
}
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}
export function phaseABindingsComplete(
  s: Pick<Snapshot, "hook" | "treasury" | "vault" | "arena" | "adapter">,
) {
  return (
    sameAddress(s.treasury.hook, ADDRESSES.hook) &&
    sameAddress(s.treasury.prio, ADDRESSES.token) &&
    sameAddress(s.treasury.stakingVault, ADDRESSES.vault) &&
    sameAddress(s.treasury.arena, ADDRESSES.arena) &&
    sameAddress(s.treasury.oracleAdapter, ADDRESSES.adapter) &&
    sameAddress(s.hook.treasury, ADDRESSES.treasury) &&
    sameAddress(s.vault.rewardFunder, ADDRESSES.treasury) &&
    sameAddress(s.arena.oracle, ADDRESSES.adapter) &&
    sameAddress(s.adapter.arena, ADDRESSES.arena)
  );
}

/** All financial reads in a snapshot use one block. RPC errors propagate: never substitute zero balances. */
export async function readSnapshot(account?: Address): Promise<Snapshot> {
  const [block, chainId] = await Promise.all([
    publicClient.getBlock(),
    publicClient.getChainId(),
  ]);
  if (chainId !== 1)
    throw new Error(
      "The RPC did not return Ethereum mainnet. Transactions are disabled.",
    );
  const n = block.number;
  const [
    hookRaw,
    treasury,
    vault,
    arenaRaw,
    adapterRaw,
    ownersEntries,
    codeEntries,
    infrastructureEntries,
  ] = await Promise.all([
    readRecord<Snapshot["hook"] & { FEE_BPS: bigint }>(
      "hook",
      [
        "treasury",
        "initialized",
        "FEE_BPS",
        "pendingEth",
        "pendingClaims",
        "totalFeeCharged",
        "totalFeeDelivered",
        "poolId",
        "poolKey",
        "token",
        "poolManager",
      ],
      n,
    ),
    readRecord<Snapshot["treasury"]>(
      "treasury",
      [
        "hook",
        "prio",
        "imd",
        "stakingVault",
        "arena",
        "oracleAdapter",
        "executor",
        "totalIncome",
        "unallocated",
        "reserve",
        "imdBudget",
        "prioBudget",
        "ownerBudget",
        "reserveTarget",
        "maxSpendPerSwap",
        "spendPerWindow",
        "spentInWindow",
        "windowStart",
        "reservePerWindow",
        "reserveSpentInWindow",
        "reserveWindowStart",
        "minPrioPerEth",
        "minImdPerEth",
        "imdPoolSet",
        "imdPoolKey",
        "prioPurchased",
        "imdPurchased",
      ],
      n,
    ),
    readRecord<Snapshot["vault"]>(
      "vault",
      [
        "prio",
        "rewardFunder",
        "totalStaked",
        "rewardReserve",
        "rewardsOwed",
        "rewardRate",
        "rewardsDuration",
        "periodFinish",
      ],
      n,
    ),
    readRecord<Snapshot["arena"] & { ENTRY_COST: bigint; MAX_LOSS: bigint }>(
      "arena",
      [
        "prio",
        "oracle",
        "roundCount",
        "unallocatedPrizePool",
        "lockedPrizes",
        "totalEscrowed",
        "ENTRY_COST",
        "MAX_LOSS",
      ],
      n,
    ),
    readRecord<Snapshot["adapter"]>(
      "adapter",
      [
        "arena",
        "intake",
        "action",
        "asset",
        "price",
        "callbackConfigured",
        "executor",
        "budgetPerWindow",
        "spentInWindow",
        "windowStart",
        "paidRequestsEnabled",
        "oracleSigner",
      ],
      n,
    ),
    Promise.all(
      (["hook", "treasury", "vault", "arena", "adapter"] as const).map(
        async (c) => [c, await readValue<Address>(c, "owner", [], n)] as const,
      ),
    ),
    Promise.all(
      (Object.keys(hashNames) as ContractName[]).map(async (c) => {
        const code = await publicClient.getCode({
          address: ADDRESSES[c],
          blockNumber: n,
        });
        return [c, code && code !== "0x" ? keccak256(code) : "0x"] as const;
      }),
    ),
    Promise.all(
      (
        Object.keys(
          infrastructureHashes,
        ) as (keyof typeof infrastructureHashes)[]
      ).map(async (c) => {
        const code = await publicClient.getCode({
          address: ADDRESSES[c],
          blockNumber: n,
        });
        return [c, code && code !== "0x" ? keccak256(code) : "0x"] as const;
      }),
    ),
  ]);
  const hook = { ...hookRaw, feeBps: hookRaw.FEE_BPS };
  const arena = {
    ...arenaRaw,
    entryCost: arenaRaw.ENTRY_COST,
    maxLoss: arenaRaw.MAX_LOSS,
  };
  const [slot0, liquidity, imdBalance] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.stateView,
      abi: stateViewAbi,
      functionName: "getSlot0",
      args: [hook.poolId],
      blockNumber: n,
    }),
    publicClient.readContract({
      address: ADDRESSES.stateView,
      abi: stateViewAbi,
      functionName: "getLiquidity",
      args: [hook.poolId],
      blockNumber: n,
    }),
    publicClient.readContract({
      address: ADDRESSES.imd,
      abi: ABIS.token,
      functionName: "balanceOf",
      args: [ADDRESSES.adapter],
      blockNumber: n,
    }) as Promise<bigint>,
  ]);
  const adapter = { ...adapterRaw, imdBalance };
  if (adapter.intake !== zeroAddress) {
    try {
      adapter.liveIntakePrice = await publicClient.readContract({
        address: adapter.intake,
        abi: parseAbi([
          "function priceOf(bytes32 action, address asset) view returns (uint256)",
        ]),
        functionName: "priceOf",
        args: [adapter.action, adapter.asset],
        blockNumber: n,
      });
    } catch (error) {
      adapter.liveIntakePriceError =
        error instanceof Error ? error.message : "Intake price read failed";
    }
  }
  const owners = Object.fromEntries(ownersEntries),
    codeHashes = Object.fromEntries(codeEntries);
  const verificationErrors: string[] = [];
  for (const c of Object.keys(hashNames) as ContractName[])
    if (codeHashes[c] !== hashes[hashNames[c]])
      verificationErrors.push(
        `${c}: deployed runtime differs from verified accepted deployment`,
      );
  for (const [c, hash] of infrastructureEntries)
    if (hash !== infrastructureHashes[c])
      verificationErrors.push(
        `${c}: infrastructure code differs from the verified mainnet baseline`,
      );
  for (const [c, owner] of ownersEntries)
    if (!sameAddress(owner, ADDRESSES.owner))
      verificationErrors.push(
        `${c}: owner differs from the verified project owner`,
      );
  if (
    !sameAddress(hook.token, ADDRESSES.token) ||
    !sameAddress(vault.prio, ADDRESSES.token) ||
    !sameAddress(arena.prio, ADDRESSES.token)
  )
    verificationErrors.push("PRIO contract binding differs");
  if (!sameAddress(hook.poolManager, ADDRESSES.poolManager))
    verificationErrors.push("PoolManager binding differs");
  const key = hook.poolKey;
  if (
    !hook.initialized ||
    key.currency0 !== zeroAddress ||
    !sameAddress(key.currency1, ADDRESSES.token) ||
    !sameAddress(key.hooks, ADDRESSES.hook) ||
    key.fee !== 12500 ||
    key.tickSpacing !== 60 ||
    poolIdOf(key) !== hook.poolId ||
    hook.feeBps !== 50n
  )
    verificationErrors.push(
      "ETH/PRIO PoolKey or immutable treasury fee differs",
    );
  const phaseAComplete = phaseABindingsComplete({
    hook,
    treasury,
    vault,
    arena,
    adapter,
  });
  const readinessReasons: string[] = [];
  if (!phaseAComplete) readinessReasons.push("Owner bindings are incomplete");
  if (!adapter.paidRequestsEnabled)
    readinessReasons.push("Paid oracle requests are disabled");
  if (
    !sameAddress(adapter.asset, ADDRESSES.imd) ||
    adapter.action !== stringToHex("oracle.request@oracle-1", { size: 32 })
  )
    readinessReasons.push(
      "The oracle IMD asset / action are not configured correctly",
    );
  if (
    adapter.intake !== zeroAddress &&
    (adapter.liveIntakePrice === undefined ||
      adapter.liveIntakePrice === 0n ||
      adapter.liveIntakePrice !== adapter.price)
  )
    readinessReasons.push(
      "The adapter payment price does not match a fresh successful Intake price read",
    );
  if (
    treasury.minPrioPerEth === 0n ||
    treasury.minImdPerEth === 0n ||
    !treasury.imdPoolSet ||
    !sameAddress(treasury.imd, ADDRESSES.imd)
  )
    readinessReasons.push(
      "Operating price floors / IMD pool are not configured",
    );
  if (
    treasury.executor === zeroAddress ||
    adapter.executor === zeroAddress ||
    !sameAddress(treasury.executor, adapter.executor)
  )
    readinessReasons.push(
      "Matching budget-limited executors are not configured",
    );
  if (
    treasury.totalIncome === 0n ||
    treasury.reserve === 0n ||
    treasury.imdBudget === 0n ||
    treasury.prioBudget === 0n
  )
    readinessReasons.push("Fee-funded operating budgets are not available");
  if (
    adapter.price === 0n ||
    adapter.imdBalance < adapter.price ||
    adapter.budgetPerWindow < adapter.price
  )
    readinessReasons.push("Oracle payment is not funded within its budget");
  const oracleSpent =
    BigInt(block.timestamp) < adapter.windowStart + 86400n
      ? adapter.spentInWindow
      : 0n;
  const treasurySpent =
    BigInt(block.timestamp) < treasury.windowStart + 86400n
      ? treasury.spentInWindow
      : 0n;
  if (
    adapter.budgetPerWindow < oracleSpent + adapter.price ||
    treasury.maxSpendPerSwap === 0n ||
    treasury.spendPerWindow <= treasurySpent ||
    treasury.reservePerWindow === 0n
  )
    readinessReasons.push("An operating spend window is exhausted or disabled");
  if (arena.lockedPrizes === 0n)
    readinessReasons.push("No funded active prizes");
  // Static hosting cannot certify a separately operated server. The UI must require independently
  // supplied, fresh operator evidence before offering new paid entries, even after chain setup.
  const corePaidReady =
    readinessReasons.length === 0 && verificationErrors.length === 0;
  readinessReasons.push(
    "Separate server operator readiness has not been supplied to this static site",
  );
  const s: Snapshot = {
    blockNumber: n,
    timestamp: Number(block.timestamp),
    verified: verificationErrors.length === 0,
    verificationErrors,
    owners,
    codeHashes,
    hook,
    treasury,
    vault,
    arena,
    adapter,
    pool: {
      sqrtPriceX96: slot0[0],
      tick: slot0[1],
      protocolFee: slot0[2],
      lpFee: slot0[3],
      liquidity,
    },
    phaseAComplete,
    corePaidReady,
    paidReady: false,
    readinessReasons,
  };
  if (account) {
    const [eth, prio, staked, earned, vaultAllowance, arenaAllowance] =
      await Promise.all([
        publicClient.getBalance({ address: account, blockNumber: n }),
        readValue<bigint>("token", "balanceOf", [account], n),
        readValue<bigint>("vault", "staked", [account], n),
        readValue<bigint>("vault", "earned", [account], n),
        readValue<bigint>("token", "allowance", [account, ADDRESSES.vault], n),
        readValue<bigint>("token", "allowance", [account, ADDRESSES.arena], n),
      ]);
    s.account = {
      address: account,
      eth,
      prio,
      staked,
      earned,
      vaultAllowance,
      arenaAllowance,
    };
  }
  return s;
}

export async function readRound(
  id: bigint,
  account?: Address,
): Promise<RoundSnapshot> {
  if (id < 1n) throw new Error("Round IDs start at 1");
  const block = await publicClient.getBlock();
  const round = await readValue<Round>("arena", "rounds", [id], block.number);
  const out: RoundSnapshot = {
    id,
    round,
    blockNumber: block.number,
    timestamp: Number(block.timestamp),
  };
  if (account)
    [out.entry, out.payout] = await Promise.all([
      readValue<RoundEntry>("arena", "entries", [id, account], block.number),
      readValue<bigint>("arena", "payoutOf", [id, account], block.number),
    ]);
  if (round.state !== 0 && round.oracle !== zeroAddress) {
    try {
      [out.result, out.pinned] = await Promise.all([
        publicClient.readContract({
          address: round.oracle,
          abi: ABIS.adapter,
          functionName: "resultOf",
          args: [id],
          blockNumber: block.number,
        }) as Promise<OracleResult>,
        publicClient.readContract({
          address: round.oracle,
          abi: ABIS.adapter,
          functionName: "pinned",
          args: [id],
          blockNumber: block.number,
        }) as Promise<PinnedQuestion>,
      ]);
    } catch (error) {
      out.evidenceError =
        error instanceof Error
          ? error.message
          : "Oracle evidence is unavailable";
    }
  }
  return out;
}

export interface ActivityEvent {
  contract: ContractName;
  name: string;
  args: Record<string, unknown>;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
}
/** Bounded paged historical query, never manufacture activity when a provider refuses history. */
export async function readActivity(
  fromBlock: bigint,
  toBlock: bigint,
): Promise<ActivityEvent[]> {
  if (toBlock < fromBlock || toBlock - fromBlock > 50000n)
    throw new Error("Choose a history range of at most 50,000 blocks");
  const events: ActivityEvent[] = [];
  for (let start = fromBlock; start <= toBlock; start += 5000n) {
    const end = start + 4999n > toBlock ? toBlock : start + 4999n;
    const groups = await Promise.all(
      (["arena", "treasury", "vault", "adapter", "hook"] as const).map(
        async (contract) => {
          const logs = await publicClient.getContractEvents({
            address: ADDRESSES[contract],
            abi: ABIS[contract],
            fromBlock: start,
            toBlock: end,
          });
          return logs.map((log) => ({
            contract,
            name: log.eventName || "Event",
            args: log.args as Record<string, unknown>,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
          }));
        },
      ),
    );
    events.push(...groups.flat());
  }
  return events.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );
}
