/** Offline adversarial interaction tests. All wallets, RPC replies and salts are test fixtures;
 * this suite never requests a real signature or broadcasts a transaction. */
import assert from 'node:assert/strict'
import { beforeEach, afterEach, mock, test } from 'node:test'
import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, keccak256, parseAbiParameters, zeroAddress, type Address, type Hex, type WalletClient } from 'viem'
import { ABIS, ADDRESSES, publicClient } from '../src/chain/config'
import { commitmentOf, createRevealSecret, exportSecrets, importSecrets, listSecrets, loadRevealSecret, requireSavedCommitment, validateSecret, type RevealSecret } from '../src/chain/secrets'
import { encodeSwap, executeSwap, minimumOutput, prepareSwapApproval, type SwapQuote } from '../src/chain/swap'
import { approveExact, executeCall, executePhaseAStep, phaseAPlan, requireWallet } from '../src/chain/write'
import { phaseABindingsComplete } from '../src/chain/read'
import type { Snapshot, TransactionStatus } from '../src/chain/types'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { fetchOperatorStatus, operatorStatusMessage, verifyOperatorStatus, type OperatorPayload, type SignedOperatorStatus } from '../src/chain/operator'

const memory = new Map<string, string>()
const localStorageFixture = {
  get length() { return memory.size },
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, String(value)) },
  removeItem: (key: string) => { memory.delete(key) },
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
}
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageFixture })
beforeEach(() => {
  memory.clear()
  mock.method(publicClient, 'estimateContractGas', async () => 50000n)
  mock.method(publicClient, 'estimateFeesPerGas', async () => ({maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n}))
  mock.method(publicClient, 'getBalance', async () => 10n ** 20n)
  mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request in offline safety suite') })
})
afterEach(() => mock.restoreAll())

const SALT = `0x${'17'.repeat(32)}` as Hex
const OTHER_SALT = `0x${'28'.repeat(32)}` as Hex
const TX_HASH = `0x${'42'.repeat(32)}` as Hex
function fixtureSecret(account: Address = ADDRESSES.owner, roundId = 7n, choice = 2, salt = SALT): RevealSecret {
  return { version: 1, chainId: 1, arena: ADDRESSES.arena, account, roundId: roundId.toString(), choice, salt,
    commitment: commitmentOf(roundId, account, choice, salt), createdAt: '2026-10-10T00:00:00.000Z' }
}
function bundle(...secrets: unknown[]) { return JSON.stringify({ format: 'prism-riot-reveal-backup', version: 1, secrets }) }
function storageSnapshot() { return [...memory.entries()] }
function fixtureWallet(overrides: Record<string, unknown> = {}) {
  return { getChainId: async () => 1, getAddresses: async () => [ADDRESSES.owner],
    writeContract: async () => TX_HASH, ...overrides } as unknown as WalletClient
}

// Partial fixture: Phase A only consumes these exact fields, not balances or operating limits.
function setupSnapshot(): Snapshot {
  return { verified: true, verificationErrors: [], corePaidReady: false, paidReady: false,
    owners: { treasury: ADDRESSES.owner, arena: ADDRESSES.owner },
    hook: { treasury: zeroAddress },
    treasury: { hook: zeroAddress, prio: zeroAddress, stakingVault: zeroAddress, arena: zeroAddress, oracleAdapter: zeroAddress },
    vault: { rewardFunder: zeroAddress }, arena: { prio: ADDRESSES.token, oracle: zeroAddress }, adapter: { arena: zeroAddress },
  } as unknown as Snapshot
}
function applyCorrectStep(s: Snapshot, index: number) {
  if (index === 0) s.treasury.hook = ADDRESSES.hook
  if (index === 1) s.treasury.prio = ADDRESSES.token
  if (index === 2) Object.assign(s.treasury, { stakingVault: ADDRESSES.vault, arena: ADDRESSES.arena, oracleAdapter: ADDRESSES.adapter })
  if (index === 3) s.hook.treasury = ADDRESSES.treasury
  if (index === 4) s.vault.rewardFunder = ADDRESSES.treasury
  if (index === 5) s.arena.oracle = ADDRESSES.adapter
  if (index === 6) s.adapter.arena = ADDRESSES.arena
}
const poolKey = { currency0: zeroAddress, currency1: ADDRESSES.token, fee: 12500, tickSpacing: 60, hooks: ADDRESSES.hook }
function swapQuote(direction: 'buy' | 'sell'): SwapQuote {
  return { direction, amountIn: 123456789n, amountOut: 987654321n, minimumOut: minimumOutput(987654321n, 50), slippageBps: 50,
    blockNumber: 26000000n, observedAt: 1000, expiresAt: 61000, poolKey, gasEstimate: 250000n,
    lpFeePpm: 12500, protocolFeePpm: 0, combinedPoolFeePpm: 12500, hookFeeEth: 1n, hookFeeIsEstimate: true }
}

test('entry guard refuses a previous wallet or round commitment after account switching',()=>{
  const secret=createRevealSecret(ADDRESSES.owner,7n,2)
  assert.equal(requireSavedCommitment(ADDRESSES.owner,7n,secret.commitment).salt,secret.salt)
  assert.throws(()=>requireSavedCommitment(ADDRESSES.arena,7n,secret.commitment),/matching local reveal backup/)
  assert.throws(()=>requireSavedCommitment(ADDRESSES.owner,8n,secret.commitment),/matching local reveal backup/)
  assert.throws(()=>requireSavedCommitment(ADDRESSES.owner,7n,TX_HASH),/matching local reveal backup/)
})
test('a successful cancellation replacement receipt cannot confirm the original action',async()=>{
  mock.method(publicClient,'simulateContract',async(request:unknown)=>({request}))
  mock.method(publicClient,'waitForTransactionReceipt',async({onReplaced}:{onReplaced:(r:unknown)=>void})=>{
    onReplaced({reason:'cancelled',transaction:{hash:TX_HASH}})
    return {status:'success',transactionHash:TX_HASH}
  })
  const statuses:TransactionStatus[]=[]
  await assert.rejects(()=>executeCall(fixtureWallet(),ADDRESSES.owner,{address:ADDRESSES.vault,abi:ABIS.vault,functionName:'claim'},'Claim',s=>statuses.push(s)),/cancelled or replaced/)
  assert.ok(!statuses.some(s=>s.stage==='confirmed'))
})

test('slippage rejects unsupported bounds, non-integers, NaN and zero-output protection', () => {
  for (const invalid of [-1, 0, 501, 10_000, 0.5, NaN, Infinity]) assert.throws(() => minimumOutput(10000n, invalid), /Slippage/)
  for (const output of [-1n, 0n, 1n]) assert.throws(() => minimumOutput(output, 50), /nonzero minimum/)
  assert.equal(minimumOutput(10000n, 1), 9999n)
  assert.equal(minimumOutput(10000n, 500), 9500n)
  assert.equal(minimumOutput(10001n, 50), 9950n, 'integer rounding must favor the protected lower bound')
})

test('slippage output stays bounded and monotonically decreases across the full allowed range', () => {
  const output = (1n << 127n) - 1n
  let previous = output
  for (let bps = 1; bps <= 500; bps++) {
    const minimum = minimumOutput(output, bps)
    assert.ok(minimum > 0n && minimum <= output && minimum <= previous)
    assert.equal(output * BigInt(10000 - bps) - minimum * 10000n < 10000n, true)
    previous = minimum
  }
})

for (const direction of ['buy', 'sell'] as const) {
  test(`${direction} router calldata enforces exact settlement, minimum output and caller-owned dust refund`, () => {
    const q = swapQuote(direction); const deadline = 1700000120n
    const encoded = encodeSwap(q, ADDRESSES.owner, deadline)
    assert.equal(encoded.commands, '0x1004', 'no allow-revert flag or extra platform transfer')
    assert.equal(encoded.value, direction === 'buy' ? q.amountIn : 0n)
    assert.equal(encoded.deadline, deadline)
    const [actions, parameters] = decodeAbiParameters(parseAbiParameters('bytes, bytes[]'), encoded.inputs[0])
    assert.equal(actions, '0x060c0f')
    const [swap] = decodeAbiParameters(parseAbiParameters('((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)'), parameters[0])
    assert.equal(swap.zeroForOne, direction === 'buy')
    assert.equal(swap.amountIn, q.amountIn); assert.equal(swap.amountOutMinimum, q.minimumOut)
    assert.equal(swap.poolKey.hooks.toLowerCase(), ADDRESSES.hook); assert.equal(swap.poolKey.fee, 12500)
    assert.equal(swap.poolKey.tickSpacing, 60); assert.equal(swap.hookData, '0x')
    const [input, maximum] = decodeAbiParameters(parseAbiParameters('address, uint256'), parameters[1])
    const [output, minimum] = decodeAbiParameters(parseAbiParameters('address, uint256'), parameters[2])
    assert.equal(input.toLowerCase(), direction === 'buy' ? zeroAddress : ADDRESSES.token)
    assert.equal(output.toLowerCase(), direction === 'buy' ? ADDRESSES.token : zeroAddress)
    assert.equal(maximum, q.amountIn); assert.equal(minimum, q.minimumOut)
    const [currency, recipient, sweepMinimum] = decodeAbiParameters(parseAbiParameters('address,address,uint256'), encoded.inputs[1])
    assert.equal(currency, zeroAddress); assert.equal(recipient.toLowerCase(), ADDRESSES.owner); assert.equal(sweepMinimum, 0n)
  })
}

test('expired quote and invalid approval inputs fail before any wallet or network request', async () => {
  const wallet = fixtureWallet({ writeContract: () => { assert.fail('must not sign') } })
  await assert.rejects(() => executeSwap(wallet, ADDRESSES.owner, swapQuote('buy')), /Quote expired/)
  for (const amount of [0n, -1n, 1n << 128n]) await assert.rejects(() => prepareSwapApproval(wallet, ADDRESSES.owner, amount), /Invalid approval amount/)
  await assert.rejects(() => approveExact(wallet, ADDRESSES.owner, ADDRESSES.vault, -1n), /negative/)
  await assert.rejects(() => approveExact(wallet, ADDRESSES.owner, ADDRESSES.owner, 1n), /Unrecognized PRIO spender/)
})

test('an already exact allowance needs no replacement wallet approval', async () => {
  const amount = 22n * 10n ** 18n
  const read = mock.method(publicClient, 'readContract', (async (request: { functionName: string; args: unknown[] }) => {
    assert.equal(request.functionName, 'allowance'); assert.deepEqual(request.args, [ADDRESSES.owner, ADDRESSES.arena]); return amount
  }) as never)
  assert.equal(await approveExact(fixtureWallet(), ADDRESSES.owner, ADDRESSES.arena, amount), undefined)
  assert.equal(read.mock.callCount(), 1)
})

test('reveal commitment binds round, player, choice and full 32-byte salt using deployed ABI encoding', () => {
  const expected = keccak256(encodeAbiParameters(parseAbiParameters('uint256,address,uint8,bytes32'), [7n, ADDRESSES.owner, 2, SALT]))
  const actual = commitmentOf(7n, ADDRESSES.owner, 2, SALT)
  assert.equal(actual, expected)
  assert.equal(new Set([actual, commitmentOf(8n, ADDRESSES.owner, 2, SALT), commitmentOf(7n, ADDRESSES.arena, 2, SALT), commitmentOf(7n, ADDRESSES.owner, 3, SALT), commitmentOf(7n, ADDRESSES.owner, 2, OTHER_SALT)]).size, 5)
})

test('secret creation persists before entry, reuses its salt and never silently changes a saved choice', () => {
  const created = createRevealSecret(ADDRESSES.owner, 7n, 2)
  assert.equal(loadRevealSecret(ADDRESSES.owner, 7n)?.commitment, created.commitment)
  assert.deepEqual(createRevealSecret(ADDRESSES.owner, 7n, 2), created)
  assert.throws(() => createRevealSecret(ADDRESSES.owner, 7n, 3), /never overwritten/)
  assert.equal(createRevealSecret(ADDRESSES.owner, 8n, 2).salt === created.salt, false)
  assert.equal(loadRevealSecret(ADDRESSES.arena, 7n), undefined)
  assert.equal(loadRevealSecret(ADDRESSES.owner, 9n), undefined)
})

test('reveal backup recovers exact secrets and filters exports to the selected wallet', () => {
  importSecrets(bundle(fixtureSecret(), fixtureSecret(ADDRESSES.arena, 8n)), undefined)
  const exported = exportSecrets(ADDRESSES.owner)
  const parsed = JSON.parse(exported)
  assert.equal(parsed.secrets.length, 1); assert.equal(parsed.secrets[0].account, ADDRESSES.owner)
  memory.clear(); assert.equal(importSecrets(exported, ADDRESSES.owner), 1)
  assert.deepEqual(loadRevealSecret(ADDRESSES.owner, 7n), fixtureSecret())
  assert.equal(listSecrets().length, 1)
})

test('invalid imported secrets preserve all existing backups, including when invalid entry is last', () => {
  importSecrets(bundle(fixtureSecret()))
  const before = storageSnapshot()
  const malformed = [
    { ...fixtureSecret(ADDRESSES.owner, 9n), chainId: 8453 },
    { ...fixtureSecret(ADDRESSES.owner, 9n), arena: ADDRESSES.vault },
    { ...fixtureSecret(ADDRESSES.owner, 9n), choice: 0 },
    { ...fixtureSecret(ADDRESSES.owner, 9n), salt: '0x01' },
    { ...fixtureSecret(ADDRESSES.owner, 9n), commitment: `0x${'00'.repeat(32)}` },
  ]
  for (const secret of malformed) {
    assert.throws(() => importSecrets(bundle(fixtureSecret(ADDRESSES.owner, 8n), secret)))
    assert.deepEqual(storageSnapshot(), before, 'the valid first record must not have been imported')
  }
  assert.throws(() => importSecrets('{malformed'))
  assert.throws(() => importSecrets(' '.repeat(1024 * 1024 + 1)), /1 MiB/)
  assert.deepEqual(storageSnapshot(), before)
})

test('wallet mismatch, existing conflict and conflicts within one file cannot overwrite secrets', () => {
  importSecrets(bundle(fixtureSecret()))
  const before = storageSnapshot()
  assert.throws(() => importSecrets(bundle(fixtureSecret(ADDRESSES.arena, 8n)), ADDRESSES.owner), /different wallet/)
  assert.throws(() => importSecrets(bundle(fixtureSecret(ADDRESSES.owner, 8n), fixtureSecret(ADDRESSES.owner, 7n, 2, OTHER_SALT))), /Conflicting/)
  assert.throws(() => importSecrets(bundle(fixtureSecret(ADDRESSES.owner, 8n), fixtureSecret(ADDRESSES.owner, 8n, 2, OTHER_SALT))), /Conflicting/)
  assert.deepEqual(storageSnapshot(), before)
})

test('a valid secret copied under the wrong storage key is rejected rather than reused for entry', () => {
  importSecrets(bundle(fixtureSecret()))
  const key = [...memory.keys()][0]
  for (const foreign of [fixtureSecret(ADDRESSES.arena), fixtureSecret(ADDRESSES.owner, 8n)]) {
    assert.doesNotThrow(() => validateSecret(foreign), 'fixture itself is internally valid')
    memory.set(key, JSON.stringify(foreign))
    assert.throws(() => loadRevealSecret(ADDRESSES.owner, 7n), /match|wallet|round|key/i)
  }
})

test('unavailable or non-persistent browser storage prevents creation of a paid entry secret', () => {
  mock.method(localStorageFixture, 'setItem', () => { throw new Error('Storage quota exceeded') })
  assert.throws(() => createRevealSecret(ADDRESSES.owner, 7n, 2), /quota/)
  mock.restoreAll()
  mock.method(localStorageFixture, 'setItem', () => {})
  assert.throws(() => createRevealSecret(ADDRESSES.owner, 7n, 2), /could not be verified/)
  assert.equal(memory.size, 0)
})

test('Phase A exposes exactly seven ABI-decodable owner calls and unlocks them in sequence', () => {
  const s = setupSnapshot()
  const expected = ['bindHook', 'setPrio', 'setSinks', 'bindTreasury', 'setRewardFunder', 'setOracle', 'setArena']
  for (let completed = 0; completed <= 7; completed++) {
    const plan = phaseAPlan(s)
    assert.deepEqual(plan.map(step => step.functionName), expected)
    assert.equal(plan.length, 7)
    for (const [index, step] of plan.entries()) {
      const decoded = decodeFunctionData({ abi: ABIS[step.contract], data: step.calldata })
      assert.equal(decoded.functionName, expected[index]); assert.equal(step.target, ADDRESSES[step.contract])
      assert.deepEqual(decoded.args?.map(x => typeof x === 'string' ? x.toLowerCase() : x), step.args)
      assert.equal(step.state, index < completed ? 'correct' : index === completed ? 'ready' : 'waiting')
    }
    assert.equal(phaseABindingsComplete(s), completed === 7)
    if (completed < 7) applyCorrectStep(s, completed)
  }
})

test('conflicting permanent bindings and failed deployment verification block configuration', () => {
  const s = setupSnapshot(); s.treasury.hook = ADDRESSES.arena
  const plan = phaseAPlan(s)
  assert.equal(plan[0].state, 'conflict'); assert.ok(plan.slice(1).every(step => step.state !== 'ready'))
  const adapterConflict = setupSnapshot()
  for (let i = 0; i < 6; i++) applyCorrectStep(adapterConflict, i)
  adapterConflict.adapter.arena = ADDRESSES.vault
  assert.equal(phaseAPlan(adapterConflict)[6].state, 'conflict')
  const unverified = setupSnapshot(); unverified.verified = false
  assert.ok(phaseAPlan(unverified).every(step => step.state === 'conflict'))
})

test('owner-only setup and wallet chain/account checks fail before simulation or signing', async () => {
  await assert.rejects(() => executePhaseAStep(fixtureWallet(), ADDRESSES.arena, 0), /Only the verified project owner/)
  for (const index of [-1, 7, 0.5]) await assert.rejects(() => executePhaseAStep(fixtureWallet(), ADDRESSES.owner, index), /Invalid Phase A step/)
  await assert.rejects(() => requireWallet(fixtureWallet({ getChainId: async () => 8453 }), ADDRESSES.owner), /Ethereum mainnet/)
  await assert.rejects(() => requireWallet(fixtureWallet({ getAddresses: async () => [ADDRESSES.arena] }), ADDRESSES.owner), /account changed/)
})

test('bounded approval calldata is simulated unchanged and only becomes confirmed after successful receipt', async () => {
  const amount = 22n * 10n ** 18n; const statuses: TransactionStatus['stage'][] = []; const sequence: string[] = []
  const call = { address: ADDRESSES.token, abi: ABIS.token, functionName: 'approve', args: [ADDRESSES.arena, amount] as const }
  mock.method(publicClient, 'simulateContract', (async (request: Record<string, unknown>) => {
    sequence.push('simulate'); assert.equal(request.account, ADDRESSES.owner); assert.deepEqual(request.args, [ADDRESSES.arena, amount]); return { request }
  }) as never)
  mock.method(publicClient, 'waitForTransactionReceipt', (async (request: { hash: Hex; confirmations: number }) => {
    sequence.push('receipt'); assert.equal(request.hash, TX_HASH); assert.equal(request.confirmations, 1)
    assert.equal(statuses.includes('confirmed'), false)
    return { status: 'success', transactionHash: TX_HASH }
  }) as never)
  const wallet = fixtureWallet({ writeContract: async (request: Record<string, unknown>) => {
    sequence.push('wallet'); assert.deepEqual(request.args, [ADDRESSES.arena, amount]); assert.equal(request.address, ADDRESSES.token); return TX_HASH
  } })
  await executeCall(wallet, ADDRESSES.owner, call, 'Approve exact test amount', status => statuses.push(status.stage))
  assert.deepEqual(sequence, ['simulate', 'wallet', 'receipt'])
  assert.deepEqual(statuses, ['simulating', 'wallet', 'pending', 'confirmed'])
})

test('simulation failure, mid-flow chain switch and reverted receipt never emit confirmed state', async () => {
  const call = { address: ADDRESSES.arena, abi: ABIS.arena, functionName: 'claim', args: [7n] }
  let signed = 0; const statuses: TransactionStatus['stage'][] = []
  const wallet = fixtureWallet({ writeContract: async () => { signed++; return TX_HASH } })
  const simulation = mock.method(publicClient, 'simulateContract', (async () => { throw new Error('Simulation rejected') }) as never)
  await assert.rejects(() => executeCall(wallet, ADDRESSES.owner, call, 'Test', s => statuses.push(s.stage)), /Simulation rejected/)
  assert.equal(signed, 0)
  simulation.mock.mockImplementation((async (request: unknown) => ({ request })) as never)
  let chainsRead = 0
  const switched = fixtureWallet({ getChainId: async () => ++chainsRead === 1 ? 1 : 8453, writeContract: async () => { signed++; return TX_HASH } })
  await assert.rejects(() => executeCall(switched, ADDRESSES.owner, call, 'Test', s => statuses.push(s.stage)), /Ethereum mainnet/)
  assert.equal(signed, 0)
  mock.method(publicClient, 'waitForTransactionReceipt', (async () => ({ status: 'reverted', transactionHash: TX_HASH })) as never)
  await assert.rejects(() => executeCall(wallet, ADDRESSES.owner, call, 'Test', s => statuses.push(s.stage)), /reverted/)
  assert.equal(signed, 1); assert.equal(statuses.includes('confirmed'), false)
})

async function operatorFixture() {
  // An ephemeral test-only key, never written to disk or used on a network.
  const signer = privateKeyToAccount(generatePrivateKey())
  const now = 1_790_000_000
  const payload: OperatorPayload = { version: 1, chainId: 1, arena: ADDRESSES.arena,
    generatedAt: now - 10, expiresAt: now + 200, observedBlock: '26000000', paidOperationsEnabled: true,
    budget: { requestsRemaining: 2, gasEthRemainingWei: '1000000000000000', imdRemainingWei: '100' },
    activity: [{ id: 'test-only-heartbeat', kind: 'heartbeat', time: now - 10, summary: 'Offline test fixture' }] }
  const snapshot = setupSnapshot()
  Object.assign(snapshot, { blockNumber: 26000000n, corePaidReady: true,
    readinessReasons: ['Separate server operator readiness has not been supplied to this static site'] })
  snapshot.adapter.executor = signer.address
  snapshot.treasury.executor = signer.address
  snapshot.adapter.price = 20n
  const sign = async (value: OperatorPayload): Promise<SignedOperatorStatus> => ({ payload: value, signature: await signer.signMessage({ message: operatorStatusMessage(value) }) })
  return { signer, now, payload, snapshot, sign }
}

test('operator proof accepts only the currently configured signer and canonical payload survives key reordering', async () => {
  const f = await operatorFixture(); const signed = await f.sign(f.payload)
  const reordered = Object.fromEntries(Object.entries(f.payload).reverse()) as unknown as OperatorPayload
  assert.equal(operatorStatusMessage(reordered), operatorStatusMessage(f.payload))
  const proof = await verifyOperatorStatus({ ...signed, payload: reordered }, f.snapshot, f.now)
  assert.equal(proof.ready, true); assert.deepEqual(proof.reasons, [])
  assert.equal(proof.signer.toLowerCase(), f.signer.address.toLowerCase())
  f.snapshot.adapter.executor = ADDRESSES.owner; f.snapshot.treasury.executor = ADDRESSES.owner
  await assert.rejects(() => verifyOperatorStatus(signed, f.snapshot, f.now), /signature does not match/)
  f.snapshot.adapter.executor = zeroAddress
  await assert.rejects(() => verifyOperatorStatus(signed, f.snapshot, f.now), /executors are not configured/)
})

test('operator proof rejects unsigned mutations, wrong chain and wrong Arena', async () => {
  const f = await operatorFixture(); const signed = await f.sign(f.payload)
  const tampered = structuredClone(signed); tampered.payload.budget.requestsRemaining++
  await assert.rejects(() => verifyOperatorStatus(tampered, f.snapshot, f.now), /signature does not match/)
  for (const invalid of [{ ...f.payload, chainId: 8453 }, { ...f.payload, arena: ADDRESSES.vault }]) {
    await assert.rejects(() => verifyOperatorStatus({ ...signed, payload: invalid }, f.snapshot, f.now), /invalid chain, Arena/)
  }
})

test('operator reports must be short-lived and bound to a recent, nonfuture block', async () => {
  const f = await operatorFixture()
  const invalidTimes = [
    { generatedAt: f.now - 301, expiresAt: f.now + 10 },
    { generatedAt: f.now + 31, expiresAt: f.now + 100 },
    { generatedAt: f.now - 10, expiresAt: f.now },
    { generatedAt: f.now - 10, expiresAt: f.now + 291 },
  ]
  for (const times of invalidTimes) {
    const signed = await f.sign({ ...f.payload, ...times, activity: [] })
    await assert.rejects(() => verifyOperatorStatus(signed, f.snapshot, f.now), /stale, future-dated, expired/)
  }
  for (const observedBlock of ['25999967', '26000001']) {
    const signed = await f.sign({ ...f.payload, observedBlock })
    await assert.rejects(() => verifyOperatorStatus(signed, f.snapshot, f.now), /recent observed mainnet block/)
  }
})

test('a valid operator signature cannot bypass disabled operations, exhausted budgets or chain readiness', async () => {
  const f = await operatorFixture()
  const payloads: OperatorPayload[] = [
    { ...f.payload, paidOperationsEnabled: false },
    { ...f.payload, budget: { ...f.payload.budget, requestsRemaining: 0 } },
    { ...f.payload, budget: { ...f.payload.budget, gasEthRemainingWei: '0' } },
    { ...f.payload, budget: { ...f.payload.budget, imdRemainingWei: '19' } },
  ]
  for (const payload of payloads) {
    const proof = await verifyOperatorStatus(await f.sign(payload), f.snapshot, f.now)
    assert.equal(proof.ready, false); assert.ok(proof.reasons.length > 0)
  }
  f.snapshot.corePaidReady = false
  const incomplete = await verifyOperatorStatus(await f.sign(f.payload), f.snapshot, f.now)
  assert.equal(incomplete.ready, false); assert.match(incomplete.reasons.join(';'), /On-chain readiness is incomplete/)
  f.snapshot.readinessReasons.push('No funded active prizes')
  const unfunded = await verifyOperatorStatus(await f.sign(f.payload), f.snapshot, f.now)
  assert.equal(unfunded.ready, false); assert.ok(unfunded.reasons.includes('No funded active prizes'))
})

test('operator status fetch rejects credentialed and insecure endpoints without sending any secrets', async () => {
  const f = await operatorFixture()
  for (const url of ['http://operator.example/status', 'https://user:password@operator.example/status', 'https://operator.example/status#secret']) {
    await assert.rejects(() => fetchOperatorStatus(url, f.snapshot), /public HTTPS status URL/)
  }
  const request = mock.method(globalThis, 'fetch', (async (_url: unknown, options: RequestInit) => {
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer')
    assert.equal(options.cache, 'no-store'); assert.equal(options.body, undefined)
    return { ok: true, text: async () => ' '.repeat(65537) } as Response
  }) as never)
  await assert.rejects(() => fetchOperatorStatus('https://operator.example/status', f.snapshot), /too large/)
  assert.equal(request.mock.callCount(), 1)
})

test('operator service readiness permits first-round management without bypassing paid-entry prize checks', async () => {
  const f = await operatorFixture(); f.snapshot.operationsReady = true; f.snapshot.corePaidReady = false;
  f.snapshot.readinessReasons = ['No funded active prizes', 'Separate server operator readiness has not been supplied to this static site'];
  const proof = await verifyOperatorStatus(await f.sign(f.payload), f.snapshot, f.now);
  assert.equal(proof.serviceReady, true); assert.equal(proof.ready, false);
  f.snapshot.operationsReady = false;
  assert.equal((await verifyOperatorStatus(await f.sign(f.payload), f.snapshot, f.now)).serviceReady, false);
});

test('reviewed IMD proposals must have bounded real content hashes in the signed payload', async () => {
  const f = await operatorFixture();
  const payload = { ...f.payload, reviewedChallenges: [{ id: 'test-proposal', title: 'Test-only proposal', questionHash: TX_HASH, bodyHash: TX_HASH, rulesHash: TX_HASH, reviewedAt: f.now - 20 }] };
  assert.ok((await verifyOperatorStatus(await f.sign(payload), f.snapshot, f.now)).signed.payload.reviewedChallenges?.length);
  const malformed = { ...payload, reviewedChallenges: [{ ...payload.reviewedChallenges[0], rulesHash: '0x' as Hex }] };
  await assert.rejects(async () => verifyOperatorStatus(await f.sign(malformed), f.snapshot, f.now), /reviewed challenge/);
});
