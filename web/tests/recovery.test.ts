import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { keccak256, type Hex, type WalletClient } from "viem";
import {
  ADDRESSES,
  publicClient,
  runContractAction,
  commitmentOf,
} from "../src/chain/index";
import hashes from "../src/chain/runtime-hashes.json";

// All RPC and wallet calls in this file are isolated test doubles. No signature or network request.
const fixtureCode = "0x6000600055" as const;
const fixtureHash = `0x${"ab".repeat(32)}` as Hex;
const account = ADDRESSES.owner;
const salt = `0x${"cd".repeat(32)}` as Hex;
function harness(
  t: TestContext,
  contract: "vault" | "arena" | "token",
  roundOverrides: Record<string, unknown> = {},
) {
  const key =
    contract === "vault"
      ? "StakingVault"
      : contract === "arena"
        ? "Arena"
        : "PrismRiotToken";
  const previous = hashes[key];
  hashes[key] = keccak256(fixtureCode);
  t.after(() => {
    hashes[key] = previous;
  });
  let simulations = 0,
    writes = 0;
  const readCalls: { functionName: string; args: readonly unknown[] }[] = [];
  t.mock.method(publicClient, "getChainId", async () => 1);
  t.mock.method(publicClient, "estimateContractGas", async () => 50000n);
  t.mock.method(publicClient, "estimateFeesPerGas", async () => ({ maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n }));
  t.mock.method(publicClient, "getBalance", async () => 10n ** 20n);
  t.mock.method(
    publicClient,
    "getCode",
    async ({ address }: { address: string }) => {
      assert.equal(address, ADDRESSES[contract]);
      return fixtureCode;
    },
  );
  t.mock.method(publicClient, "getBlock", async () => ({
    number: 10n,
    timestamp: 100n,
  }));
  t.mock.method(publicClient, "multicall", async () => {
    throw new Error("Unrelated configuration RPC is unavailable");
  });
  t.mock.method(
    publicClient,
    "readContract",
    async ({
      functionName,
      args = [],
    }: {
      functionName: string;
      args?: readonly unknown[];
    }) => {
      readCalls.push({ functionName, args });
      if (functionName === "prio") return ADDRESSES.token;
      if (functionName === "rounds")
        return {
          state: 1,
          commitDeadline: 90n,
          revealDeadline: 110n,
          choiceCount: 2,
          ...roundOverrides,
        };
      if (functionName === "entries")
        return {
          choice: 0,
          commitment: commitmentOf(7n, account, 2, salt),
          claimed: false,
        };
      throw new Error(`Unrelated ${functionName} read is unavailable`);
    },
  );
  t.mock.method(publicClient, "simulateContract", async (request: unknown) => {
    simulations++;
    return { request };
  });
  t.mock.method(publicClient, "waitForTransactionReceipt", async () => ({
    status: "success",
    transactionHash: fixtureHash,
    logs: [],
  }));
  const wallet = {
    getChainId: async () => 1,
    getAddresses: async () => [account],
    writeContract: async () => {
      writes++;
      return fixtureHash;
    },
  } as unknown as WalletClient;
  return { wallet, readCalls, counts: () => ({ simulations, writes }) };
}

test("withdrawal ignores unrelated owner/configuration RPC failures while verifying its target", async (t) => {
  const h = harness(t, "vault");
  const receipt = await runContractAction(
    h.wallet,
    account,
    "vault",
    "withdraw",
    [1n],
  );
  assert.equal(receipt.status, "success");
  assert.deepEqual(h.counts(), { simulations: 1, writes: 1 });
  assert.deepEqual(
    h.readCalls.map((c) => c.functionName),
    ["prio"],
  );
});
test("round-indexed refund remains accessible without an operator or oracle evidence", async (t) => {
  const h = harness(t, "arena");
  await runContractAction(h.wallet, account, "arena", "refund", [7n]);
  assert.deepEqual(h.counts(), { simulations: 1, writes: 1 });
  assert.deepEqual(
    h.readCalls.map((c) => c.functionName),
    ["prio"],
  );
});
test("recovery blocks a mismatching target runtime before simulation or wallet request", async (t) => {
  const h = harness(t, "vault");
  t.mock.method(publicClient, "getCode", async () => "0x6001600055");
  await assert.rejects(
    () => runContractAction(h.wallet, account, "vault", "withdraw", [1n]),
    /runtime does not match/,
  );
  assert.deepEqual(h.counts(), { simulations: 0, writes: 0 });
});
test("early reveal never sends a salt to RPC simulation", async (t) => {
  const h = harness(t, "arena", { commitDeadline: 101n });
  await assert.rejects(
    () =>
      runContractAction(h.wallet, account, "arena", "reveal", [7n, 2, salt]),
    /reveal window is not open/,
  );
  assert.deepEqual(h.counts(), { simulations: 0, writes: 0 });
  assert.ok(h.readCalls.every((c) => !c.args.includes(salt)));
});
test("late reveal never sends a salt to RPC simulation", async (t) => {
  const h = harness(t, "arena", { revealDeadline: 100n });
  await assert.rejects(
    () =>
      runContractAction(h.wallet, account, "arena", "reveal", [7n, 2, salt]),
    /reveal window is not open/,
  );
  assert.deepEqual(h.counts(), { simulations: 0, writes: 0 });
});
test("wrong reveal commitment stops locally before salt disclosure", async (t) => {
  const h = harness(t, "arena");
  await assert.rejects(
    () =>
      runContractAction(h.wallet, account, "arena", "reveal", [7n, 1, salt]),
    /does not match this entry/,
  );
  assert.deepEqual(h.counts(), { simulations: 0, writes: 0 });
});
test("eligible matching reveal simulates only after window and commitment checks", async (t) => {
  const h = harness(t, "arena");
  await runContractAction(h.wallet, account, "arena", "reveal", [7n, 2, salt]);
  assert.deepEqual(h.counts(), { simulations: 1, writes: 1 });
  assert.deepEqual(
    h.readCalls.map((c) => c.functionName),
    ["prio", "rounds", "entries"],
  );
});
test("zero token approval revocation does not require unrelated application readiness", async (t) => {
  const h = harness(t, "token");
  await runContractAction(h.wallet, account, "token", "approve", [
    ADDRESSES.vault,
    0n,
  ]);
  assert.deepEqual(h.counts(), { simulations: 1, writes: 1 });
  assert.equal(h.readCalls.length, 0);
});
