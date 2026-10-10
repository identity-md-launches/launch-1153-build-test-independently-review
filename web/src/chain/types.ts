import type { Address, Hex } from "viem";
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}
export interface Snapshot {
  blockNumber: bigint;
  timestamp: number;
  verified: boolean;
  verificationErrors: string[];
  owners: Record<string, Address>;
  codeHashes: Record<string, Hex>;
  hook: {
    treasury: Address;
    initialized: boolean;
    feeBps: bigint;
    pendingEth: bigint;
    pendingClaims: bigint;
    totalFeeCharged: bigint;
    totalFeeDelivered: bigint;
    poolId: Hex;
    poolKey: PoolKey;
    token: Address;
    poolManager: Address;
  };
  pool: {
    sqrtPriceX96: bigint;
    tick: number;
    protocolFee: number;
    lpFee: number;
    liquidity: bigint;
  };
  treasury: {
    hook: Address;
    prio: Address;
    imd: Address;
    stakingVault: Address;
    arena: Address;
    oracleAdapter: Address;
    executor: Address;
    totalIncome: bigint;
    unallocated: bigint;
    reserve: bigint;
    imdBudget: bigint;
    prioBudget: bigint;
    ownerBudget: bigint;
    reserveTarget: bigint;
    maxSpendPerSwap: bigint;
    spendPerWindow: bigint;
    spentInWindow: bigint;
    windowStart: bigint;
    reservePerWindow: bigint;
    reserveSpentInWindow: bigint;
    reserveWindowStart: bigint;
    minPrioPerEth: bigint;
    minImdPerEth: bigint;
    imdPoolSet: boolean;
    imdPoolKey: PoolKey;
    prioPurchased: boolean;
    imdPurchased: boolean;
  };
  vault: {
    prio: Address;
    rewardFunder: Address;
    totalStaked: bigint;
    rewardReserve: bigint;
    rewardsOwed: bigint;
    rewardRate: bigint;
    rewardsDuration: bigint;
    periodFinish: bigint;
  };
  arena: {
    prio: Address;
    oracle: Address;
    roundCount: bigint;
    unallocatedPrizePool: bigint;
    lockedPrizes: bigint;
    totalEscrowed: bigint;
    entryCost: bigint;
    maxLoss: bigint;
  };
  adapter: {
    arena: Address;
    intake: Address;
    action: Hex;
    asset: Address;
    price: bigint;
    callbackConfigured: boolean;
    executor: Address;
    budgetPerWindow: bigint;
    spentInWindow: bigint;
    windowStart: bigint;
    paidRequestsEnabled: boolean;
    oracleSigner: Address;
    imdBalance: bigint;
    liveIntakePrice?: bigint;
    liveIntakePriceError?: string;
  };
  account?: {
    address: Address;
    eth: bigint;
    prio: bigint;
    staked: bigint;
    earned: bigint;
    vaultAllowance: bigint;
    arenaAllowance: bigint;
  };
  phaseAComplete: boolean;
  configurationReady?: boolean;
  operationsReady?: boolean;
  corePaidReady: boolean;
  paidReady: boolean;
  readinessReasons: string[];
}
export interface Round {
  mode: number;
  state: number;
  choiceCount: number;
  winningChoice: number;
  bossThreshold: number;
  commitDeadline: bigint;
  revealDeadline: bigint;
  resultDeadline: bigint;
  prize: bigint;
  prizePerWinner: bigint;
  entries: bigint;
  correct: bigint;
  rulesHash: Hex;
  oracle: Address;
  questionHash: Hex;
}
export interface RoundEntry {
  commitment: Hex;
  choice: number;
  claimed: boolean;
}
export interface OracleResult {
  answer: bigint;
  requestId: Hex;
  panelJobId: Hex;
  blockHash: Hex;
  fromBlock: bigint;
  toBlock: bigint;
  issuedAt: bigint;
  agreed: number;
  settled: boolean;
}
export interface PinnedQuestion {
  questionHash: Hex;
  chainId: bigint;
  minPanel: number;
  minQuorum: number;
  notBefore: bigint;
  signer: Address;
  body: Hex;
}
export interface RoundSnapshot {
  id: bigint;
  round: Round;
  entry?: RoundEntry;
  payout?: bigint;
  result?: OracleResult;
  pinned?: PinnedQuestion;
  evidenceError?: string;
  blockNumber: bigint;
  timestamp: number;
}
export interface TransactionStatus {
  stage: "simulating" | "wallet" | "pending" | "confirmed";
  label: string;
  hash?: Hex;
}
export type StatusListener = (status: TransactionStatus) => void;
