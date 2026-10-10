import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  fallback,
  http,
  keccak256,
  toHex,
  encodeAbiParameters,
  parseAbi,
} from "viem";
import { mainnet } from "viem/chains";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const acceptedRoot = process.argv[2];
const rpc =
  process.env.PRISM_VERIFY_RPC || "https://ethereum-rpc.publicnode.com";
const client = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http(rpc, { batch: { wait: 20 }, timeout: 30000 }),
    http("https://eth.drpc.org", { batch: { wait: 20 }, timeout: 30000 }),
  ]),
});
const addresses = {
  PrismRiotToken: "0xfd1c234972768c23bb21d655966e0b122dd67a2c",
  TreasuryFeeHook: "0x65a783cc6725a02ce349dc4d72577994df1760cc",
  FeeTreasury: "0xb68b1ba47734ba91f3fc37164bb39d408908ff7c",
  StakingVault: "0x10373c4afc7851b8ab5d94dce7ec1688624cec33",
  Arena: "0xe31277d4e9fbf9fc35239dc7d2280e97d5c817c1",
  OracleAdapter: "0x002021b4aeb4125ff25e0353b004f6fdec5f93ed",
};
const txs = {
  tokenHook:
    "0x545df1adb27c4a2ad6de57dd3d4d28005306f1471c0002381d5518fbc1c6dd7d",
  application:
    "0x6f4d5e54bf0e9faa57a2163f7b484678233a0e0fd4498c198366e453c0151f4a",
};
const infrastructure = {
  poolManager: "0x000000000004444c5dc75cb358380d2e3de08a90",
  router: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  quoter: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
  stateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  imd: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
const stringify = (value) =>
  JSON.stringify(
    value,
    (_, x) => (typeof x === "bigint" ? x.toString() : x),
    2,
  );
const block = await client.getBlock();
if ((await client.getChainId()) !== 1)
  throw new Error("RPC is not Ethereum mainnet");
const report = {
  observedAt: new Date().toISOString(),
  chainId: 1,
  blockNumber: block.number,
  blockHash: block.hash,
  blockTimestamp: block.timestamp,
  rpc,
  fallbackRpc: "https://eth.drpc.org",
  sourceCommit: "0345ffa67225afed469453250362e74b7f00ff42",
  ownerExpected: "0x13afb9b5780cd9ae79c61503adb69c57845d8eac",
  contracts: {},
  receipts: {},
  pool: {},
  simulations: {},
  limitations: [
    "Read-only inspection. No transaction was signed or broadcast.",
    "Runtime comparison masks compiler-listed immutable slots; corresponding public immutable getters are checked separately.",
    "Application ABI hashes are computed from accepted compiled ABIs; pinned deployment.json supplies expected hashes only for token and hook.",
    "PublicNode refused historical eth_getCode during initial verification; the pinned DRPC fallback is used where needed.",
  ],
};
const pinnedPath = path.join(root, ".imd/reads/deployment.json");
const pinned = fs.existsSync(pinnedPath)
  ? JSON.parse(fs.readFileSync(pinnedPath))
  : {
      contracts: [
        {
          name: "PrismRiotToken",
          abiHash:
            "f36d2fe28b62f817a4fba0b78bb501b41895eada3982280273c063ad8183f577",
        },
        {
          name: "TreasuryFeeHook",
          abiHash:
            "648426405c5b573f3171227588337b09b11a4bb67c65791dda5b682d51c360d7",
        },
      ],
    };
const existingHashesPath = path.join(root, "web/src/chain/runtime-hashes.json");
const existingHashes = fs.existsSync(existingHashesPath)
  ? JSON.parse(fs.readFileSync(existingHashesPath))
  : {};
const fields = {
  PrismRiotToken: ["name", "symbol", "decimals", "totalSupply"],
  TreasuryFeeHook: [
    "owner",
    "pendingOwner",
    "poolManager",
    "token",
    "factory",
    "poolId",
    "poolKey",
    "initialized",
    "FEE_BPS",
    "treasury",
    "pendingEth",
    "pendingClaims",
    "totalFeeCharged",
    "totalFeeDelivered",
  ],
  FeeTreasury: [
    "owner",
    "poolManager",
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
  StakingVault: [
    "owner",
    "prio",
    "rewardFunder",
    "totalStaked",
    "rewardReserve",
    "rewardsOwed",
    "rewardRate",
    "rewardsDuration",
    "periodFinish",
  ],
  Arena: [
    "owner",
    "prio",
    "oracle",
    "roundCount",
    "unallocatedPrizePool",
    "lockedPrizes",
    "totalEscrowed",
    "ENTRY_COST",
    "MAX_LOSS",
  ],
  OracleAdapter: [
    "owner",
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
};
for (const [name, address] of Object.entries(addresses)) {
  const abi = JSON.parse(
    fs.readFileSync(path.join(root, `web/src/chain/abi/${name}.json`)),
  );
  const code = await client.getCode({ address, blockNumber: block.number });
  if (!code || code === "0x") throw new Error(`No code at ${name}`);
  const canonicalAbiHash = keccak256(toHex(JSON.stringify(canonical(abi))));
  const expected = pinned.contracts.find((c) => c.name === name)?.abiHash;
  const values = Object.fromEntries(
    await Promise.all(
      fields[name].map(async (functionName) => [
        functionName,
        await client.readContract({
          address,
          abi,
          functionName,
          blockNumber: block.number,
        }),
      ]),
    ),
  );
  let runtimeComparison = { performed: false };
  if (acceptedRoot) {
    const compiled = JSON.parse(
      fs.readFileSync(path.join(acceptedRoot, `out/${name}.sol/${name}.json`)),
    );
    const slots = Object.values(
      compiled.deployedBytecode.immutableReferences || {},
    ).flat();
    const mask = (input) => {
      const chars = input.replace(/^0x/, "").split("");
      for (const { start, length } of slots)
        chars.fill("0", start * 2, (start + length) * 2);
      return chars.join("");
    };
    runtimeComparison = {
      performed: true,
      matchesOutsideImmutables:
        mask(code) === mask(compiled.deployedBytecode.object),
      immutableSlots: slots.length,
      compiledAbiMatchesShipped:
        JSON.stringify(canonical(abi)) ===
        JSON.stringify(canonical(compiled.abi)),
    };
  }
  report.contracts[name] = {
    address,
    codeBytes: (code.length - 2) / 2,
    runtimeCodeHash: keccak256(code),
    canonicalAbiHash,
    expectedAbiHash: expected ? `0x${expected}` : null,
    abiHashMatchesPinned: expected
      ? canonicalAbiHash === `0x${expected}`
      : null,
    runtimeComparison,
    values,
  };
  if (expected && canonicalAbiHash !== `0x${expected}`)
    throw new Error(`${name} ABI differs from pinned deployment`);
  if (
    runtimeComparison.performed &&
    (!runtimeComparison.matchesOutsideImmutables ||
      !runtimeComparison.compiledAbiMatchesShipped)
  )
    throw new Error(
      `${name} code/ABI differs from the compiled accepted source`,
    );
  if (!runtimeComparison.performed && existingHashes[name] !== keccak256(code))
    throw new Error(
      `${name} code differs from the existing verified baseline; supply accepted compiled source`,
    );
  if (values.owner && values.owner.toLowerCase() !== report.ownerExpected)
    throw new Error(`${name} owner differs from the project owner`);
}
for (const name of ["StakingVault", "Arena"])
  if (
    report.contracts[name].values.prio.toLowerCase() !==
    addresses.PrismRiotToken
  )
    throw new Error(`${name} immutable PRIO differs`);
for (const name of ["TreasuryFeeHook", "FeeTreasury"])
  if (
    report.contracts[name].values.poolManager.toLowerCase() !==
    "0x000000000004444c5dc75cb358380d2e3de08a90"
  )
    throw new Error(`${name} immutable PoolManager differs`);
if (
  report.contracts.TreasuryFeeHook.values.token.toLowerCase() !==
  addresses.PrismRiotToken
)
  throw new Error("Hook immutable PRIO differs");
for (const [name, hash] of Object.entries(txs)) {
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${name} deployment receipt is not successful`);
  const expectedContracts =
    name === "tokenHook"
      ? ["PrismRiotToken", "TreasuryFeeHook"]
      : ["FeeTreasury", "StakingVault", "Arena", "OracleAdapter"];
  const creationChecks = {};
  for (const contract of expectedContracts) {
    const address = addresses[contract];
    const [before, after] = await Promise.all([
      client.getCode({ address, blockNumber: receipt.blockNumber - 1n }),
      client.getCode({ address, blockNumber: receipt.blockNumber }),
    ]);
    creationChecks[contract] = {
      absentBeforeDeploymentBlock: !before || before === "0x",
      presentAtDeploymentBlock: !!after && after !== "0x",
      logsEmittedInDeploymentReceipt: receipt.logs.some(
        (l) => l.address.toLowerCase() === address,
      ),
    };
    if (Object.values(creationChecks[contract]).some((v) => !v))
      throw new Error(
        `${contract} was not verified as created with logs at its stated deployment`,
      );
  }
  const acceptedCommit =
    name === "application"
      ? report.sourceCommit
      : "34e992ab84195173cd35219f895309b051b1944d";
  const sourceCommitInReceipt = receipt.logs.some((l) =>
    l.data.startsWith(`0x${acceptedCommit}`),
  );
  if (!sourceCommitInReceipt)
    throw new Error(
      `${name} receipt does not carry the accepted source commit`,
    );
  report.receipts[name] = {
    hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    from: receipt.from,
    to: receipt.to,
    contractAddress: receipt.contractAddress,
    creationChecks,
    sourceCommitInReceipt,
    logs: receipt.logs.map((log) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
    })),
  };
}
const key = report.contracts.TreasuryFeeHook.values.poolKey;
const poolId = keccak256(
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
const stateView = "0x7ffe42c4a5deea5b0fec41c94c136cf115597227";
const stateAbi = parseAbi([
  "function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns (uint128)",
]);
const [slot0, liquidity] = await Promise.all([
  client.readContract({
    address: stateView,
    abi: stateAbi,
    functionName: "getSlot0",
    args: [poolId],
    blockNumber: block.number,
  }),
  client.readContract({
    address: stateView,
    abi: stateAbi,
    functionName: "getLiquidity",
    args: [poolId],
    blockNumber: block.number,
  }),
]);
report.pool = {
  key,
  poolId,
  matchesHookPoolId: poolId === report.contracts.TreasuryFeeHook.values.poolId,
  sqrtPriceX96: slot0[0],
  tick: slot0[1],
  protocolFee: slot0[2],
  lpFee: slot0[3],
  liquidity,
};
const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountOut,uint256 gasEstimate)",
]);
for (const [name, zeroForOne, exactAmount] of [
  ["buy", true, 100000000000000n],
  ["sell", false, 100000000000000000000n],
]) {
  try {
    const quote = await client.simulateContract({
      address: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ poolKey: key, zeroForOne, exactAmount, hookData: "0x" }],
      blockNumber: block.number,
    });
    report.simulations[name] = {
      input: exactAmount,
      output: quote.result[0],
      gasEstimate: quote.result[1],
      ok: true,
    };
  } catch (error) {
    report.simulations[name] = {
      input: exactAmount,
      ok: false,
      error: error.shortMessage || error.message,
    };
  }
}
report.infrastructure = {};
const infrastructureHashes = {};
for (const [name, address] of Object.entries(infrastructure)) {
  const code = await client.getCode({ address, blockNumber: block.number });
  if (!code || code === "0x") throw new Error(`No deployed code for ${name}`);
  infrastructureHashes[name] = keccak256(code);
  report.infrastructure[name] = {
    address,
    codeBytes: (code.length - 2) / 2,
    runtimeCodeHash: infrastructureHashes[name],
  };
}
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
fs.writeFileSync(
  path.join(root, "artifacts/onchain-verification.json"),
  stringify(report) + "\n",
);
fs.writeFileSync(
  path.join(root, "docs/chain-verification.json"),
  stringify(report) + "\n",
);
const hashes = Object.fromEntries(
  Object.entries(report.contracts).map(([name, data]) => [
    name,
    data.runtimeCodeHash,
  ]),
);
fs.writeFileSync(
  path.join(root, "web/src/chain/runtime-hashes.json"),
  JSON.stringify(hashes, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(root, "web/src/chain/infrastructure-hashes.json"),
  JSON.stringify(infrastructureHashes, null, 2) + "\n",
);
console.log(
  stringify({
    block: block.number,
    contracts: Object.fromEntries(
      Object.entries(report.contracts).map(([n, c]) => [
        n,
        {
          codeBytes: c.codeBytes,
          abiMatch: c.abiHashMatchesPinned,
          runtimeMatch: c.runtimeComparison.matchesOutsideImmutables,
          owner: c.values.owner,
        },
      ]),
    ),
    pool: report.pool,
    simulations: report.simulations,
    receipts: Object.fromEntries(
      Object.entries(report.receipts).map(([n, r]) => [
        n,
        { status: r.status, block: r.blockNumber },
      ]),
    ),
  }),
);
