import assert from "node:assert/strict";
import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbiParameters,
  type WalletClient,
} from "viem";
import {
  ABIS,
  ADDRESSES,
  publicClient,
  readSnapshot,
  phaseAPlan,
  executePhaseAStep,
  createRevealSecret,
  listSecrets,
  exportSecrets,
  importSecrets,
  loadRevealSecret,
  commitmentOf,
  minimumOutput,
  quoteSwap,
  encodeSwap,
  routerAbi,
  requireWallet,
  readRound,
  readActivity,
  readPhaseBProtocol,
} from "../src/chain/index";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function checkAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    get length() {
      return memory.size;
    },
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    key: (n: number) => [...memory.keys()][n] ?? null,
    removeItem: (k: string) => memory.delete(k),
    clear: () => memory.clear(),
  },
});

check(
  "reveal commitment matches exact ABI encoding and persists before entry",
  () => {
    const s = createRevealSecret(ADDRESSES.owner, 7n, 2);
    assert.equal(s.commitment, commitmentOf(7n, ADDRESSES.owner, 2, s.salt));
    assert.equal(
      loadRevealSecret(ADDRESSES.owner, 7n)?.commitment,
      s.commitment,
    );
    assert.equal(createRevealSecret(ADDRESSES.owner, 7n, 2).salt, s.salt);
    assert.throws(
      () => createRevealSecret(ADDRESSES.owner, 7n, 1),
      /never overwritten/,
    );
  },
);
check(
  "reveal export/import round trip, tamper rejection, wallet isolation",
  () => {
    const backup = exportSecrets(ADDRESSES.owner);
    const before = listSecrets()[0];
    memory.clear();
    assert.equal(importSecrets(backup, ADDRESSES.owner), 1);
    assert.deepEqual(listSecrets()[0], before);
    const bad = JSON.parse(backup);
    bad.secrets[0].choice = 3;
    assert.throws(() => importSecrets(JSON.stringify(bad)), /does not match/);
    assert.throws(
      () => importSecrets(backup, ADDRESSES.arena),
      /different wallet/,
    );
    assert.equal(listSecrets().length, 1);
  },
);
check("slippage bounds cannot produce unprotected zero-output swaps", () => {
  assert.equal(minimumOutput(10000n, 50), 9950n);
  assert.throws(() => minimumOutput(10000n, 0));
  assert.throws(() => minimumOutput(10000n, 501));
  assert.throws(() => minimumOutput(1n, 50));
});
await checkAsync(
  "wrong chain and changed account stop before wallet signing",
  async () => {
    await assert.rejects(
      () =>
        requireWallet(
          { getChainId: async () => 8453 } as unknown as WalletClient,
          ADDRESSES.owner,
        ),
      /Ethereum mainnet/,
    );
    await assert.rejects(
      () =>
        requireWallet(
          {
            getChainId: async () => 1,
            getAddresses: async () => [ADDRESSES.arena],
          } as unknown as WalletClient,
          ADDRESSES.owner,
        ),
      /account changed/,
    );
    await assert.rejects(
      () => executePhaseAStep({} as WalletClient, ADDRESSES.arena, 0),
      /Only the verified project owner/,
    );
  },
);

const snapshot = await readSnapshot(ADDRESSES.owner);
await checkAsync(
  "fresh runtime/owner/pool checks match accepted Ethereum deployment",
  async () => {
    assert.equal(
      snapshot.verified,
      true,
      snapshot.verificationErrors.join("; "),
    );
    assert.equal(snapshot.hook.feeBps, 50n);
    assert.equal(snapshot.hook.poolKey.fee, 12500);
    assert.equal(snapshot.hook.poolKey.tickSpacing, 60);
    assert.ok(snapshot.account);
  },
);
check("fresh configuration reports readiness without assuming historical unset bindings", () => {
  assert.equal(snapshot.paidReady, false);
  const plan = phaseAPlan(snapshot);
  assert.equal(plan.length, 7);
  for (const step of plan) assert.equal(decodeFunctionData({abi:ABIS[step.contract],data:step.calldata}).functionName,step.functionName);
  if(snapshot.phaseAComplete) assert.ok(plan.every(step=>step.state==="correct"));
  if(!snapshot.corePaidReady) assert.ok(snapshot.readinessReasons.length>0);
  console.log(`Phase A ${snapshot.phaseAComplete}; operations ${snapshot.operationsReady}; rounds ${snapshot.arena.roundCount}; reserve ${snapshot.vault.rewardReserve}.`);
});
await checkAsync(
  "old/absent rounds remain readable without fabricated results",
  async () => {
    const round = await readRound(
      snapshot.arena.roundCount + 1n,
      ADDRESSES.owner,
    );
    assert.equal(round.round.state, 0);
    assert.equal(round.payout, 0n);
    assert.equal(round.result, undefined);
  },
);
const quote = await quoteSwap("buy", 100000000000000n, 50);
check("live buy quote includes fees and bounded output", () => {
  assert.ok(quote.amountOut > 0n);
  assert.equal(quote.minimumOut, (quote.amountOut * 9950n) / 10000n);
  assert.equal(quote.lpFeePpm, 12500);
  assert.ok(quote.hookFeeEth > 0n);
  assert.equal(quote.expiresAt - quote.observedAt, 60000);
});
const encoded = encodeSwap(
  quote,
  ADDRESSES.owner,
  BigInt(snapshot.timestamp + 120),
);
check(
  "router codec settles exact maximum, takes nonzero minimum and refunds native dust",
  () => {
    assert.equal(encoded.commands, "0x1004");
    assert.equal(encoded.value, quote.amountIn);
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes, bytes[]"),
      encoded.inputs[0],
    );
    assert.equal(actions, "0x060c0f");
    const [input, amount] = decodeAbiParameters(
      parseAbiParameters("address, uint256"),
      params[1],
    );
    assert.equal(input, "0x0000000000000000000000000000000000000000");
    assert.equal(amount, quote.amountIn);
    const [, minimum] = decodeAbiParameters(
      parseAbiParameters("address, uint256"),
      params[2],
    );
    assert.equal(minimum, quote.minimumOut);
    const [, recipient, minimumSweep] = decodeAbiParameters(
      parseAbiParameters("address, address, uint256"),
      encoded.inputs[1],
    );
    assert.equal(recipient.toLowerCase(), ADDRESSES.owner);
    assert.equal(minimumSweep, 0n);
  },
);
await checkAsync(
  "exact Universal Router buy simulates from the real owner; no transaction broadcast",
  async () => {
    await publicClient.simulateContract({
      address: ADDRESSES.router,
      abi: routerAbi,
      functionName: "execute",
      args: [encoded.commands, encoded.inputs, encoded.deadline],
      account: ADDRESSES.owner,
      value: encoded.value,
    });
  },
);
await checkAsync(
  "real application activity query returns only decoded chain events",
  async () => {
    const activity = await readActivity(26154915n, snapshot.blockNumber);
    assert.ok(Array.isArray(activity));
    for (const event of activity) {
      assert.ok(event.transactionHash.startsWith("0x"));
      assert.ok(event.blockNumber >= 26154915n);
    }
    console.log(
      `Observed ${activity.length} decoded events from block 26154915 through ${snapshot.blockNumber}.`,
    );
  },
);
await checkAsync(
  "Phase B reads current Intake price and executable candidate IMD pool",
  async () => {
    const protocol = await readPhaseBProtocol();
    assert.ok(protocol.price > 0n);
    assert.ok(protocol.intakeCodeHash.startsWith("0x"));
    assert.ok(
      protocol.quoteOutputImd && protocol.quoteOutputImd > 0n,
      protocol.quoteError,
    );
    assert.equal(
      protocol.poolSource,
      "accepted deployment document candidate; requires owner review",
    );
    console.log(
      `Intake price ${protocol.price} IMD wei; candidate pool quote ${protocol.quoteOutputImd} IMD wei / ${protocol.quoteInputEth} ETH wei at block ${protocol.blockNumber}.`,
    );
  },
);
console.log(
  `${passed} checks passed. Read-only mainnet block ${snapshot.blockNumber}. No signature, deployment or broadcast.`,
);
