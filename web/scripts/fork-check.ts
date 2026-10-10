/** Isolated Anvil rehearsal of the deployed contracts. Never sends to a public transport. */
import assert from "node:assert/strict";
import { mock } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { writeFileSync, mkdirSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, parseAbi, keccak256, stringToHex, encodeAbiParameters, type Address, type Hex, type WalletClient } from "viem";
import { mainnet } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ABIS, ADDRESSES, publicClient, readSnapshot, readRound, phaseAPlan, executePhaseAStep, runContractAction, approveExact, createRevealSecret, readValue, exportSecrets, importSecrets, ORACLE_ACTION, VERIFIED_INTAKE, operatorStatusMessage, verifyOperatorStatus, type OperatorPayload, type TransactionStatus } from "../src/chain";
import { executeRoundStep, type RoundDraft } from "../src/chain/round-admin";
const tempServer=createServer();await new Promise<void>(r=>tempServer.listen(0,"127.0.0.1",r));const port=(tempServer.address() as {port:number}).port;await new Promise<void>(r=>tempServer.close(()=>r()));
const forkUrl=process.env.PRISM_FORK_RPC||"https://ethereum-rpc.publicnode.com";
const upstream=createPublicClient({chain:mainnet,transport:http(forkUrl,{timeout:30000})});
const forkBlock=await upstream.getBlockNumber();
const endpoint=`http://127.0.0.1:${port}`;
const anvil=spawn(process.env.PRISM_ANVIL||"anvil",["--fork-url",forkUrl,"--fork-block-number",forkBlock.toString(),"--chain-id","1","--host","127.0.0.1","--port",String(port),"--silent"],{stdio:["ignore","pipe","pipe"]});
let stderr="";anvil.stderr.on("data",b=>{stderr+=b.toString();});
const local=createPublicClient({chain:mainnet,transport:http(endpoint,{timeout:60000,retryCount:0}),batch:{multicall:true},cacheTime:0,pollingInterval:100});
const rpc=async(method:string,params:unknown[]=[])=>local.request({method:method as never,params:params as never});
const checks:{name:string,detail?:unknown}[]=[];
const pass=(name:string,detail?:unknown)=>{checks.push({name,detail});console.log(`PASS ${name}`);};
const mem=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{get length(){return mem.size;},key:(i:number)=>[...mem.keys()][i]??null,getItem:(k:string)=>mem.get(k)??null,setItem:(k:string,v:string)=>{mem.set(k,v);},removeItem:(k:string)=>mem.delete(k)}});
const reportPath=process.env.PRISM_FORK_REPORT||"artifacts/fork-results.json";
try {
  for(let n=0;n<60;n++){try{if(String(await rpc("web3_clientVersion")).toLowerCase().includes("anvil"))break;}catch{}if(n===59)throw new Error("Anvil did not start: "+stderr);await new Promise(r=>setTimeout(r,250));}
  assert.ok(endpoint.startsWith("http://127.0.0.1:"));assert.match(String(await rpc("web3_clientVersion")),/anvil/i);
  // Redirect every production read/simulation/receipt method to this verified loopback Anvil only.
  for(const key of ["getBlock","getBlockNumber","getChainId","getCode","getBalance","readContract","multicall","simulateContract","waitForTransactionReceipt","getTransactionReceipt","getContractEvents","estimateContractGas","estimateFeesPerGas"] as const)mock.method(publicClient,key,local[key] as never);
  const walletFor=async(account:Address)=>{await rpc("anvil_impersonateAccount",[account]);await rpc("anvil_setBalance",[account,"0x56bc75e2d63100000"]);const wallet=createWalletClient({account,chain:mainnet,transport:http(endpoint)});wallet.getAddresses=async()=>[account];return wallet;};
  const owner=await walletFor(ADDRESSES.owner);
  const initial=await readSnapshot(ADDRESSES.owner);assert.equal(initial.verified,true);assert.equal(initial.phaseAComplete,true);assert.ok(phaseAPlan(initial).every(s=>s.state==="correct"));
  await executePhaseAStep(owner,ADDRESSES.owner,6);pass("Fresh deployed runtimes and all 9 bindings verify; completed one-shot A7 is skipped",{forkBlock:forkBlock.toString()});
  const rawCall=async(wallet:WalletClient,target:Address,abi:any,fn:string,args:unknown[]=[])=>{const {request}=await local.simulateContract({address:target,abi,functionName:fn,args,account:wallet.account!,chain:mainnet});const hash=await wallet.writeContract(request as never);const receipt=await local.waitForTransactionReceipt({hash});assert.equal(receipt.status,"success");return receipt;};
  const call=async(contract:keyof typeof ABIS,fn:string,args:unknown[]=[])=>rawCall(owner,ADDRESSES[contract],ABIS[contract],fn,args);
  const signer=privateKeyToAccount(generatePrivateKey());const executor=await walletFor(signer.address);
  for(const [contract,fn,args] of [
    ["treasury","setImd",[ADDRESSES.imd]],["treasury","setImdPool",[10000,200,"0x0000000000000000000000000000000000000000"]],
    ["treasury","setPriceFloors",[1n,1n]],["treasury","setMaxSpendPerSwap",[parseEther("0.1")]],["treasury","setSpendPerWindow",[parseEther("0.2")]],
    ["adapter","setIntake",[VERIFIED_INTAKE]],["adapter","setAction",[ORACLE_ACTION]],
    ["adapter","setPayment",[ADDRESSES.imd,await local.readContract({address:VERIFIED_INTAKE,abi:parseAbi(["function priceOf(bytes32,address) view returns(uint256)"]),functionName:"priceOf",args:[ORACLE_ACTION,ADDRESSES.imd]})]],
    ["adapter","setCallbackConfigured",[true]],["adapter","setBudget",[parseEther("10")]],
    ["treasury","setExecutor",[signer.address]],["adapter","setExecutor",[signer.address]],["adapter","setSigner",[signer.address]],
  ] as const)await call(contract,fn,[...args]);
  // Fixture-only earned ETH delivery from the bound hook, then REAL fee-budget purchases.
  const hook=await walletFor(ADDRESSES.hook);
  const incomeHash=await hook.sendTransaction({account:ADDRESSES.hook,chain:mainnet,to:ADDRESSES.treasury,value:parseEther("1")});await local.waitForTransactionReceipt({hash:incomeHash});
  await call("treasury","allocate");
  await rawCall(executor,ADDRESSES.treasury,ABIS.treasury,"buyPrio",[parseEther("0.01"),1n]);
  await rawCall(executor,ADDRESSES.treasury,ABIS.treasury,"buyImd",[parseEther("0.01"),1n]);
  let funded=await readSnapshot();assert.equal(funded.operationsReady,true,funded.readinessReasons.join("; "));assert.ok(funded.arena.unallocatedPrizePool>parseEther("300"));assert.ok(funded.vault.rewardReserve>0n);
  pass("Real treasury allocation and mainnet-pool purchases fund Arena, IMD adapter and staking on the fork",{prizes:funded.arena.unallocatedPrizePool.toString(),imd:funded.adapter.imdBalance.toString(),rewardRate:funded.vault.rewardRate.toString()});
  const proof=async()=>{const s=await readSnapshot();const now=Math.floor(Date.now()/1000);const payload:OperatorPayload={version:1,chainId:1,arena:ADDRESSES.arena,generatedAt:now,expiresAt:now+240,observedBlock:s.blockNumber.toString(),paidOperationsEnabled:true,budget:{requestsRemaining:10,gasEthRemainingWei:parseEther("1").toString(),imdRemainingWei:s.adapter.imdBalance.toString()},activity:[]};return verifyOperatorStatus({payload,signature:await signer.signMessage({message:operatorStatusMessage(payload)})},s);};
  const d=(id:bigint,mode=0):RoundDraft=>({id,mode,choiceCount:mode===1?2:3,commitDeadline:BigInt(funded.timestamp+300),revealDeadline:BigInt(funded.timestamp+600),resultDeadline:BigInt(funded.timestamp+900),prize:parseEther("100"),bossThreshold:mode===2?2:0,questionHash:keccak256(stringToHex(`isolated fork fixture ${id}`)),minPanel:3,minQuorum:2,body:stringToHex(JSON.stringify({fixture:"isolated local fork only",question:"Return 0 as uint256",choices:["one","two","three"]})),source:"owner",proposalId:""});
  const round1=d(funded.arena.roundCount+1n),round2=d(round1.id+1n,1),bossRound=d(round2.id+1n,2);
  for(const draft of [round1,round2,bossRound]){
    await executeRoundStep(owner,ADDRESSES.owner,draft,"pin",await proof());await executeRoundStep(owner,ADDRESSES.owner,draft,"create",await proof());
    const r=await readRound(draft.id);assert.equal(r.round.commitDeadline,draft.commitDeadline);assert.equal(r.pinned?.notBefore,draft.commitDeadline);
  }
  pass("Owner pinQuestion → createRound uses matching deadlines and locks actual funded prizes in all 3 modes");
  const poolWallet=await walletFor(ADDRESSES.poolManager);
  const players=await Promise.all([0,1,2].map(async()=>{const account=privateKeyToAccount(generatePrivateKey());return {account:account.address,wallet:await walletFor(account.address)};}));
  for(const player of players)await rawCall(poolWallet,ADDRESSES.token,ABIS.token,"transfer",[player.account,parseEther("1000")]);
  const secrets:any[]=[];
  for(const [i,player]of players.entries())for(const draft of [round1,round2,bossRound]){
    const secret=createRevealSecret(player.account,draft.id,i===1?2:1);secrets.push(secret);
    const backup=exportSecrets(player.account);assert.ok(importSecrets(backup,player.account)>=1);
    await approveExact(player.wallet,player.account,ADDRESSES.arena,parseEther("102"));
    const stages:TransactionStatus["stage"][]=[];
    await runContractAction(player.wallet,player.account,"arena","enter",[draft.id,secret.commitment],s=>stages.push(s.stage),{operatorProof:await proof()});
    assert.deepEqual(stages,["simulating","wallet","pending","confirmed"]);
    assert.equal(await readValue<bigint>("token","allowance",[player.account,ADDRESSES.arena]),0n);
  }
  pass("9 funded entries use production readiness, exact 102 PRIO approvals, saved/exported secrets and receipt-checked commits");
  const first=players[0],firstSecret=secrets.find(s=>s.account?.toLowerCase()===first.account.toLowerCase()&&s.roundId===round1.id.toString())||secrets[0];
  await assert.rejects(()=>runContractAction(first.wallet,first.account,"arena","reveal",[round1.id,firstSecret.choice,firstSecret.salt]),/window is not open/);
  await rpc("evm_setNextBlockTimestamp",[Number(round1.commitDeadline)]);await rpc("evm_mine");
  for(const [i,player]of players.entries())if(i<2)for(const draft of [round1,bossRound]){const secret=createRevealSecret(player.account,draft.id,i===1?2:1);await runContractAction(player.wallet,player.account,"arena","reveal",[draft.id,secret.choice,secret.salt]);}
  await rpc("evm_setNextBlockTimestamp",[Number(round1.revealDeadline)]);await rpc("evm_mine");
  for(const draft of [round1,bossRound]){
    const block=await local.getBlock();const attestation={requestId:keccak256(stringToHex(`fork request ${draft.id}`)),chainId:1n,questionHash:draft.questionHash,answerType:3,answer:encodeAbiParameters([{type:"uint256"}],[0n]),figure:0n,fromBlock:block.number,toBlock:block.number,blockHash:block.hash,panelJobId:keccak256(stringToHex(`fork panel ${draft.id}`)),panelSize:3,quorum:2,agreed:3,issuedAt:block.timestamp,expiresAt:block.timestamp+600n};
    const digest=await local.readContract({address:ADDRESSES.adapter,abi:ABIS.adapter,functionName:"attestationDigest",args:[attestation]}) as Hex;
    const signature=await signer.sign({hash:digest});
    await call("adapter","submitAttestation",[draft.id,attestation,signature]);
    await runContractAction(first.wallet,first.account,"arena","settle",[draft.id]);
  }
  for(const [i,player]of players.entries())for(const draft of [round1,bossRound]){
    const before=await readValue<bigint>("token","balanceOf",[player.account]);
    const expected=parseEther(i===0?(draft.mode===2?"100":"200"):i===1?"90":"80");
    await runContractAction(player.wallet,player.account,"arena","claim",[draft.id]);
    assert.equal((await readValue<bigint>("token","balanceOf",[player.account]))-before,expected);
    await assert.rejects(()=>runContractAction(player.wallet,player.account,"arena","claim",[draft.id]));
  }
  pass("Production reveal, signed attestation, settle and claims pay exactly 200/90/80 PRIO; unmet Boss threshold pays 100/90/80; double claims revert");
  await rpc("evm_setNextBlockTimestamp",[Number(round2.resultDeadline+259200n)]);await rpc("evm_mine");
  await runContractAction(first.wallet,first.account,"arena","cancel",[round2.id]);
  for(const player of players){const before=await readValue<bigint>("token","balanceOf",[player.account]);await runContractAction(player.wallet,player.account,"arena","refund",[round2.id]);assert.equal((await readValue<bigint>("token","balanceOf",[player.account]))-before,parseEther("102"));}
  const final=await readSnapshot();assert.equal(final.arena.totalEscrowed,0n);assert.equal(final.arena.lockedPrizes,0n);
  pass("Unresolved round cancels only after the grace period; all 3 refunds return 102 PRIO and escrow/locked-prize accounting clears");
  mkdirSync(new URL('../../artifacts/',import.meta.url),{recursive:true});
  writeFileSync(reportPath,JSON.stringify({result:"passed",date:new Date().toISOString(),forkBlock:forkBlock.toString(),networkWrites:"loopback Anvil only",deployedContracts:true,redeployments:0,checks,limitations:["Fork-only fixture fee income, balances, executor and oracle signer settings; not mainnet configuration.","Oracle attestation signed by an ephemeral fork-only signer; the hosted IMD service was not called.","Readiness guards and production transaction functions used; no production bypass flag exists."]},null,2));
}catch(e){console.error(e);writeFileSync(reportPath,JSON.stringify({result:"failed",error:String(e),checks,stderr},null,2));process.exitCode=1;}
finally{mock.restoreAll();anvil.kill("SIGTERM");}
