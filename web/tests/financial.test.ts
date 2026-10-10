import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { parseEther, keccak256, type WalletClient } from 'viem';
import { parseAmount, percentAmount, editableAmount } from '../src/amounts';
import { gasFresh, requireGas, estimateGasBudget } from '../src/chain/gas';
import { ADDRESSES, ABIS, publicClient } from '../src/chain/config';
import { readStaking, verifyTargets } from '../src/chain/financial-read';
import { executeCall } from '../src/chain/write';
import { sellApproved } from '../src/chain/swap';
import hashes from '../src/chain/runtime-hashes.json';

beforeEach(()=>mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected network in financial unit tests');}));
afterEach(()=>mock.restoreAll());
test('amounts reject invalid syntax, nonpositive values, excess decimals and router overflow',()=>{
 for(const value of ['', '0', '-1', 'NaN', 'Infinity','1e3','1,000','0.0000000000000000001', (1n<<128n).toString()])assert.equal(parseAmount(value),undefined,value);
 assert.equal(parseAmount('123.000000000000000003'),123000000000000000003n);
 assert.equal(parseAmount('0.01',2),1n);assert.equal(parseAmount('0.001',2),undefined);
});
test('all balance percentages round down in base units, including dust, zero and huge balances',()=>{
 for(const balance of [0n,1n,3n,99n,123000000000000000003n,123456789012345678901234567890n])for(const p of [25,50,75,100]){
  const result=percentAmount(balance,p);assert.equal(result,balance*BigInt(p)/100n);assert.ok(result<=balance);
  if(result>0n)assert.equal(parseAmount(editableAmount(result)),result);
 }
 assert.equal(percentAmount(100n,100,120n),0n);assert.equal(percentAmount(101n,25,10n),22n);
 assert.throws(()=>percentAmount(100n,30));
});
test('gas reserve buffers gas and fees with integer ceilings and blocks unaffordable actions',async()=>{
 mock.method(publicClient,'estimateContractGas',async()=>21001n);
 mock.method(publicClient,'estimateFeesPerGas',async()=>({maxFeePerGas:1000000001n,maxPriorityFeePerGas:10n}));
 const call={address:ADDRESSES.token,abi:ABIS.token,functionName:'approve',args:[ADDRESSES.vault,parseEther('1')],value:2n};
 const budget=await estimateGasBudget(ADDRESSES.owner,call);
 assert.equal(budget.gasLimit,26252n);assert.equal(budget.maxFeePerGas,1200000002n);assert.equal(budget.reserve,26252n*1200000002n);assert.equal(gasFresh(budget),true);assert.equal(gasFresh({...budget,observedAt:Date.now()-60000}),false);
 const getBalance=mock.method(publicClient,'getBalance',async()=>budget.reserve+1n);
 await assert.rejects(()=>requireGas(ADDRESSES.owner,call),/Insufficient ETH/);
 getBalance.mock.mockImplementation(async()=>budget.reserve+2n);await requireGas(ADDRESSES.owner,call);
});
test('no wallet request follows failed gas affordability, expired signing guard or changed account',async()=>{
 let writes=0;const wallet={getChainId:async()=>1,getAddresses:async()=>[ADDRESSES.owner],writeContract:async()=>{writes++;throw Error('Must not sign');}} as unknown as WalletClient;
 const call={address:ADDRESSES.vault,abi:ABIS.vault,functionName:'withdraw',args:[1n]};
 mock.method(publicClient,'simulateContract',async()=>({}));mock.method(publicClient,'estimateContractGas',async()=>50000n);mock.method(publicClient,'estimateFeesPerGas',async()=>({maxFeePerGas:100n,maxPriorityFeePerGas:1n}));
 const bal=mock.method(publicClient,'getBalance',async()=>0n);
 await assert.rejects(()=>executeCall(wallet,ADDRESSES.owner,call,'Withdraw'),/Insufficient ETH/);assert.equal(writes,0);
 bal.mock.mockImplementation(async()=>parseEther('1'));
 await assert.rejects(()=>executeCall(wallet,ADDRESSES.owner,call,'Swap',undefined,()=>{throw Error('Quote expired');}),/Quote expired/);assert.equal(writes,0);
 let reads=0;wallet.getAddresses=async()=>[++reads===1?ADDRESSES.owner:ADDRESSES.arena];
 await assert.rejects(()=>executeCall(wallet,ADDRESSES.owner,call,'Withdraw'),/account changed/);assert.equal(writes,0);
});
test('sell needs exact token AND exact unexpired short-lived router allowances',()=>{
 const state=(tokenAllowance:bigint,routerAllowance:bigint,routerExpiration:number)=>({account:{tokenAllowance,routerAllowance,routerExpiration}} as Parameters<typeof sellApproved>[0]);
 assert.equal(sellApproved(state(100n,100n,1200),100n,1000),true);
 for(const s of [state(99n,100n,1200),state(101n,100n,1200),state(100n,101n,1200),state(100n,100n,1059),state(100n,100n,2201)])assert.equal(sellApproved(s,100n,1000),false);
 assert.equal(sellApproved(state(100n,100n,1200),101n,1000),false);
});
test('scoped staking reads have no oracle, treasury, owner or pool dependency; wrong runtime still blocks',async()=>{
 const code='0x6000600055';const original={token:hashes.PrismRiotToken,vault:hashes.StakingVault};hashes.PrismRiotToken=hashes.StakingVault=keccak256(code);
 try {
  mock.method(publicClient,'getBlock',async()=>({number:1n,timestamp:BigInt(Math.floor(Date.now()/1000))}));mock.method(publicClient,'getChainId',async()=>1);
  const runtime=mock.method(publicClient,'getCode',async({address}:{address:string})=>{assert.ok([ADDRESSES.token,ADDRESSES.vault].includes(address as never));return code;});
  mock.method(publicClient,'multicall',async({contracts}:{contracts:{address:string;functionName:string}[]})=>contracts.map(c=>{assert.equal(c.address,ADDRESSES.vault);return c.functionName==='prio'?ADDRESSES.token:c.functionName==='rewardFunder'?ADDRESSES.treasury:0n;}));
  mock.method(publicClient,'getBalance',async()=>100n);
  mock.method(publicClient,'readContract',async({address,functionName}:{address:string;functionName:string})=>{assert.ok([ADDRESSES.token,ADDRESSES.vault].includes(address as never));return functionName==='staked'?123n:0n;});
  const state=await readStaking(ADDRESSES.owner);assert.equal(state.verified,true);assert.equal(state.account?.staked,123n);assert.equal(state.vault.rewardRate,0n);
  runtime.mock.mockImplementation(async()=> '0x6001600055');const broken=await readStaking();assert.equal(broken.verified,false);assert.equal(broken.verificationErrors.length,2);
 } finally {hashes.PrismRiotToken=original.token;hashes.StakingVault=original.vault;}
});

test('nested wallet and gas errors retain an actionable English explanation', async()=>{
 const { message } = await import('../src/wallet');
 assert.match(message({shortMessage:'An unknown RPC error occurred.',details:'Wallet session changed. Reconnect and review the action again.'}),/Wallet session changed.*Reconnect/);
 assert.match(message({shortMessage:'Transaction failed.',details:'The total cost exceeds the balance of the account.'}),/Insufficient ETH.*Reduce/);
 assert.match(message({code:4001,message:'User rejected request'}),/declined/);
});
