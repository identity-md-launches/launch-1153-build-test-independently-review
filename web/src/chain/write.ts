import {
  encodeFunctionData,
  keccak256,
  zeroAddress,
  type Address,
  type WalletClient,
  type Abi,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { mainnet } from "viem/chains";
import {
  ABIS,
  ADDRESSES,
  publicClient,
  sameAddress,
  type ContractName,
} from "./config";
import { readSnapshot, readValue, readRound } from "./read";
import { readStaking, readSwap } from "./financial-read";
import { requireGas } from "./gas";
import { verifyOperatorStatus, type OperatorProof } from "./operator";
import { commitmentOf, requireSavedCommitment } from "./secrets";
import hashes from "./runtime-hashes.json";
import type { Snapshot, StatusListener, Round, RoundEntry } from "./types";

export async function requireWallet(wallet: WalletClient, account: Address) {
  if ((await wallet.getChainId()) !== 1)
    throw new Error("Switch your wallet to Ethereum mainnet before signing.");
  const addresses = await wallet.getAddresses();
  if (!addresses[0] || !sameAddress(addresses[0], account))
    throw new Error(
      "The selected wallet account changed. Reconnect and review the transaction.",
    );
}
/** Simulate the exact caller, calldata, amount and chain that the wallet will receive. */
export async function executeCall(
  wallet: WalletClient,
  account: Address,
  call: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  },
  label: string,
  onStatus?: StatusListener,
  beforeSign?: () => void,
): Promise<TransactionReceipt> {
  await requireWallet(wallet, account);
  onStatus?.({ stage: "simulating", label });
  await publicClient.simulateContract({
    ...call,
    account,
    chain: mainnet,
  });
  const gas = await requireGas(account, call);
  await requireWallet(wallet, account);
  beforeSign?.();
  onStatus?.({ stage: "wallet", label });
  const hash = await wallet.writeContract({
    ...call,
    gas: gas.gasLimit,
    maxFeePerGas: gas.maxFeePerGas,
    maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
    account,
    chain: mainnet,
  });
  onStatus?.({ stage: "pending", label, hash });
  let replacementChanged = false;
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    onReplaced: (replacement) => {
      if (replacement.reason !== "repriced") replacementChanged = true;
      onStatus?.({
        stage: "pending",
        label:
          replacement.reason === "repriced"
            ? label
            : `${label}: transaction replaced`,
        hash: replacement.transaction.hash,
      });
    },
  });
  if (replacementChanged)
    throw new Error(
      `${label} was cancelled or replaced with a different transaction. The original action was not confirmed.`,
    );
  if (receipt.status !== "success")
    throw new Error(`${label} reverted. No successful outcome was recorded.`);
  onStatus?.({ stage: "confirmed", label, hash: receipt.transactionHash });
  return receipt;
}
const userMethods: Partial<Record<ContractName, string[]>> = {
  token: ["approve"],
  vault: ["stake", "withdraw", "claim", "exit"],
  arena: ["enter", "reveal", "claim", "refund", "settle", "cancel"],
  treasury: ["allocate"],
  hook: ["flush", "redeemClaims"],
};
export async function runContractAction(
  wallet: WalletClient,
  account: Address,
  contract: ContractName,
  functionName: string,
  args: readonly unknown[] = [],
  onStatus?: StatusListener,
  options?: { operatorProof?: OperatorProof },
) {
  if (!userMethods[contract]?.includes(functionName))
    throw new Error("This function is not a supported player action");
  const recovery =
    (contract === "vault" &&
      ["withdraw", "claim", "exit"].includes(functionName)) ||
    (contract === "arena" &&
      ["reveal", "claim", "refund", "settle", "cancel"].includes(
        functionName,
      )) ||
    (contract === "token" && functionName === "approve" && args[1] === 0n);
  if (recovery) {
    // Existing claims and withdrawals depend on their own immutable contract, not unrelated
    // setup state, an operator, the current owner, or an unavailable quote/treasury RPC read.
    await requireWallet(wallet, account);
    if ((await publicClient.getChainId()) !== 1)
      throw new Error("Recovery requires Ethereum mainnet");
    const code = await publicClient.getCode({ address: ADDRESSES[contract] });
    const expected =
      contract === "vault"
        ? hashes.StakingVault
        : contract === "arena"
          ? hashes.Arena
          : hashes.PrismRiotToken;
    if (!code || code === "0x" || keccak256(code) !== expected)
      throw new Error(
        "The recovery target runtime does not match the verified deployed contract",
      );
    if (
      contract !== "token" &&
      !sameAddress(await readValue<Address>(contract, "prio"), ADDRESSES.token)
    )
      throw new Error("The recovery target PRIO binding differs");
    if (contract === "arena" && functionName === "reveal") {
      const block = await publicClient.getBlock();
      const roundId = args[0] as bigint,
        choice = args[1] as number,
        salt = args[2] as Hex;
      const [round, entry] = await Promise.all([
        readValue<Round>("arena", "rounds", [roundId], block.number),
        readValue<RoundEntry>(
          "arena",
          "entries",
          [roundId, account],
          block.number,
        ),
      ]);
      if (
        round.state !== 1 ||
        block.timestamp < round.commitDeadline ||
        block.timestamp >= round.revealDeadline
      )
        throw new Error(
          "The reveal window is not open. Your secret was not sent to the RPC.",
        );
      if (
        entry.choice !== 0 ||
        choice < 1 ||
        choice > round.choiceCount ||
        commitmentOf(roundId, account, choice, salt) !== entry.commitment
      )
        throw new Error(
          "The saved reveal does not match this entry. Your secret was not sent to the RPC.",
        );
    }
    return executeCall(
      wallet,
      account,
      { address: ADDRESSES[contract], abi: ABIS[contract], functionName, args },
      `${contract}.${functionName}`,
      onStatus,
    );
  }
  // Financial actions verify their own dependencies, independently of game configuration.
  if ((contract === "vault" && functionName === "stake") ||
      (contract === "token" && functionName === "approve" &&
       [ADDRESSES.vault, ADDRESSES.permit2].some(a => sameAddress(a, String(args[0]))))) {
    const state = contract === "vault" || sameAddress(String(args[0]), ADDRESSES.vault)
      ? await readStaking(account) : await readSwap(account);
    if (!state.verified) throw new Error(state.verificationErrors.join("; "));
    return executeCall(wallet, account, { address: ADDRESSES[contract], abi: ABIS[contract], functionName, args }, `${contract}.${functionName}`, onStatus);
  }
  const snapshot = await readSnapshot(account);
  if (!snapshot.verified)
    throw new Error(snapshot.verificationErrors.join("; "));
  if (contract === "arena" && functionName === "enter") {
    requireSavedCommitment(account, args[0] as bigint, args[1] as Hex);
    if (!options?.operatorProof)
      throw new Error(snapshot.readinessReasons.join("; "));
    const proof = await verifyOperatorStatus(
      options.operatorProof.signed,
      snapshot,
    );
    if (!proof.ready) throw new Error(proof.reasons.join("; "));
    const round = await readRound(args[0] as bigint, account);
    if (
      round.round.state !== 1 ||
      round.round.prize === 0n ||
      Number(round.round.commitDeadline) <= round.timestamp ||
      !sameAddress(round.round.oracle, ADDRESSES.adapter)
    )
      throw new Error(
        "This round is not an open, funded round using the configured oracle",
      );
  }
  return executeCall(
    wallet,
    account,
    { address: ADDRESSES[contract], abi: ABIS[contract], functionName, args },
    `${contract}.${functionName}`,
    onStatus,
  );
}
export async function approveExact(
  wallet: WalletClient,
  account: Address,
  spender: Address,
  amount: bigint,
  onStatus?: StatusListener,
) {
  if (amount < 0n) throw new Error("Approval cannot be negative");
  if (
    ![ADDRESSES.vault, ADDRESSES.arena, ADDRESSES.permit2].some((a) =>
      sameAddress(a, spender),
    )
  )
    throw new Error("Unrecognized PRIO spender");
  const current = await readValue<bigint>("token", "allowance", [
    account,
    spender,
  ]);
  if (current === amount) return undefined;
  return runContractAction(
    wallet,
    account,
    "token",
    "approve",
    [spender, amount],
    onStatus,
  );
}
export interface SetupStep {
  index: number;
  id: string;
  label: string;
  contract: ContractName;
  functionName: string;
  args: readonly unknown[];
  target: Address;
  calldata: Hex;
  state: "correct" | "ready" | "waiting" | "conflict";
  warning: string;
}
export function phaseAPlan(s: Snapshot): SetupStep[] {
  const definitions: [
    ContractName,
    string,
    readonly unknown[],
    boolean,
    boolean,
    string,
  ][] = [
    [
      "treasury",
      "bindHook",
      [ADDRESSES.hook],
      sameAddress(s.treasury.hook, ADDRESSES.hook),
      s.treasury.hook !== zeroAddress,
      "Binding freezes when the first hook fees arrive.",
    ],
    [
      "treasury",
      "setPrio",
      [ADDRESSES.token],
      sameAddress(s.treasury.prio, ADDRESSES.token),
      s.treasury.prio !== zeroAddress,
      "PRIO binding freezes after the first PRIO purchase.",
    ],
    [
      "treasury",
      "setSinks",
      [ADDRESSES.vault, ADDRESSES.arena, ADDRESSES.adapter],
      sameAddress(s.treasury.stakingVault, ADDRESSES.vault) &&
        sameAddress(s.treasury.arena, ADDRESSES.arena) &&
        sameAddress(s.treasury.oracleAdapter, ADDRESSES.adapter),
      [
        s.treasury.stakingVault,
        s.treasury.arena,
        s.treasury.oracleAdapter,
      ].some(
        (a, i) =>
          a !== zeroAddress &&
          !sameAddress(
            a,
            [ADDRESSES.vault, ADDRESSES.arena, ADDRESSES.adapter][i],
          ),
      ),
      "Only the verified vault, Arena and adapter are permitted.",
    ],
    [
      "hook",
      "bindTreasury",
      [ADDRESSES.treasury],
      sameAddress(s.hook.treasury, ADDRESSES.treasury),
      s.hook.treasury !== zeroAddress,
      "Effectively permanent immediately: pending fees may be flushed by anyone after this binding.",
    ],
    [
      "vault",
      "setRewardFunder",
      [ADDRESSES.treasury],
      sameAddress(s.vault.rewardFunder, ADDRESSES.treasury),
      s.vault.rewardFunder !== zeroAddress,
      "Treasury funds actual reward streams; this does not fund rewards.",
    ],
    [
      "arena",
      "setOracle",
      [ADDRESSES.adapter],
      sameAddress(s.arena.oracle, ADDRESSES.adapter),
      s.arena.oracle !== zeroAddress,
      "Applies to new rounds; existing rounds retain their oracle.",
    ],
    [
      "adapter",
      "setArena",
      [ADDRESSES.arena],
      sameAddress(s.adapter.arena, ADDRESSES.arena),
      s.adapter.arena !== zeroAddress,
      "One-shot permanent binding. Verify the complete Arena address before signing.",
    ],
  ];
  let priorIncomplete = false;
  return definitions.map(
    ([contract, functionName, args, correct, conflict, warning], index) => {
      const state: SetupStep["state"] = correct
        ? "correct"
        : conflict || !s.verified
          ? "conflict"
          : priorIncomplete
            ? "waiting"
            : "ready";
      if (!correct) priorIncomplete = true;
      return {
        index,
        id: `A${index + 1}`,
        label: `${contract}.${functionName}`,
        contract,
        functionName,
        args,
        target: ADDRESSES[contract],
        calldata: encodeFunctionData({
          abi: ABIS[contract],
          functionName,
          args,
        }),
        state,
        warning,
      };
    },
  );
}
export async function executePhaseAStep(
  wallet: WalletClient,
  account: Address,
  index: number,
  onStatus?: StatusListener,
) {
  if (!sameAddress(account, ADDRESSES.owner))
    throw new Error("Only the verified project owner may configure bindings");
  if (!Number.isInteger(index) || index < 0 || index > 6)
    throw new Error("Invalid Phase A step");
  const s = await readSnapshot(account);
  const plan = phaseAPlan(s);
  const step = plan[index];
  if (step.state === "correct") return undefined;
  if (plan.some((s) => s.state === "conflict"))
    throw new Error(
      "A conflicting binding or verification failure exists in this setup plan. No owner transaction was requested; stop and review all destinations.",
    );
  if (step.state !== "ready")
    throw new Error(
      step.state === "conflict"
        ? "Conflicting binding or verification failure. Stop and review the deployed contract."
        : "Complete each preceding owner transaction and wait for its receipt first.",
    );
  if (
    index === 3 &&
    (!sameAddress(s.treasury.hook, ADDRESSES.hook) ||
      !sameAddress(s.owners.treasury, ADDRESSES.owner))
  )
    throw new Error(
      "Pre-binding treasury address/code/owner/hook verification failed",
    );
  if (
    index === 6 &&
    (!sameAddress(s.arena.prio, ADDRESSES.token) ||
      !sameAddress(s.owners.arena, ADDRESSES.owner))
  )
    throw new Error("One-shot Arena address/code/owner verification failed");
  const receipt = await executeCall(
    wallet,
    account,
    {
      address: step.target,
      abi: ABIS[step.contract],
      functionName: step.functionName,
      args: step.args,
    },
    `${step.id} ${step.label}`,
    onStatus,
  );
  const after = phaseAPlan(await readSnapshot(account))[index];
  if (after.state !== "correct")
    throw new Error(
      "The receipt succeeded but the binding did not match the expected state. Stop and review.",
    );
  return receipt;
}
