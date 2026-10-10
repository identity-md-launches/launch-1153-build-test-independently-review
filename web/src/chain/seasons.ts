import { decodeEventLog, keccak256, type Address, type Hex } from "viem";
import { ABIS, ADDRESSES, publicClient, sameAddress } from "./config";
import { readValue } from "./read";
import hashes from "./runtime-hashes.json";
import type { Round, RoundEntry } from "./types";
export interface SeasonClaim { player: Address; amount: bigint; prize: bigint; roundId: bigint; transactionHash: Hex; block: bigint; }
export interface SeasonResult { season:string; start:string; end:string; fromBlock:bigint; throughBlock:bigint; claims:SeasonClaim[]; }
export function seasonWindow(season:string) {
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(season))throw new Error("Choose a season in YYYY-MM format");
  const [year,month]=season.split("-").map(Number);
  return {start:Date.UTC(year,month-1,1)/1000,end:Date.UTC(year,month,1)/1000};
}
export function rankClaims(claims:SeasonClaim[]) {
  const ranks=new Map<string,{player:Address;prize:bigint;claims:number;receipts:Hex[]}>();
  for(const c of claims){const key=c.player.toLowerCase();const r=ranks.get(key)||{player:c.player,prize:0n,claims:0,receipts:[]};r.prize+=c.prize;r.claims++;r.receipts.push(c.transactionHash);ranks.set(key,r);}
  return [...ranks.values()].sort((a,b)=>a.prize===b.prize?a.player.toLowerCase().localeCompare(b.player.toLowerCase()):a.prize>b.prize?-1:1);
}
/** UTC calendar seasons, finalized blocks only; incomplete reads never produce a ranking. */
export async function readSeason(season:string,signal?:AbortSignal):Promise<SeasonResult> {
  const {start,end}=seasonWindow(season);
  const finalized=await publicClient.getBlock({blockTag:"finalized"});
  if(await publicClient.getChainId()!==1)throw new Error("Season history requires Ethereum mainnet");
  const code=await publicClient.getCode({address:ADDRESSES.arena,blockNumber:finalized.number});
  if(!code||keccak256(code)!==hashes.Arena)throw new Error("Arena runtime verification failed");
  const deployment=26154915n;
  const boundary=async(time:number)=>{
    let lo=deployment,hi=finalized.number+1n;
    while(lo<hi){signal?.throwIfAborted();const mid=(lo+hi)/2n;const b=await publicClient.getBlock({blockNumber:mid});if(b.timestamp<BigInt(time))lo=mid+1n;else hi=mid;}
    return lo;
  };
  const from=await boundary(start),until=await boundary(end),through=until-1n;
  const claims:SeasonClaim[]=[];const seen=new Set<string>();
  for(let fromBlock=from;fromBlock<=through;fromBlock+=2000n){
    signal?.throwIfAborted();const toBlock=fromBlock+1999n>through?through:fromBlock+1999n;
    const logs=await publicClient.getContractEvents({address:ADDRESSES.arena,abi:ABIS.arena,eventName:"Claimed",fromBlock,toBlock,strict:true});
    for(const log of logs){
      signal?.throwIfAborted();if(log.removed)continue;
      const id=`${log.transactionHash}:${log.logIndex}`;if(seen.has(id))continue;seen.add(id);
      const args=log.args as unknown as {player:Address;roundId:bigint;amount:bigint};
      const [receipt,block,r,entry]=await Promise.all([
        publicClient.getTransactionReceipt({hash:log.transactionHash}),publicClient.getBlock({blockNumber:log.blockNumber}),
        readValue<Round>("arena","rounds",[args.roundId],log.blockNumber),readValue<RoundEntry>("arena","entries",[args.roundId,args.player],log.blockNumber),
      ]);
      if(receipt.status!=="success"||receipt.blockHash!==block.hash||log.blockHash!==block.hash||Number(block.timestamp)<start||Number(block.timestamp)>=end)throw new Error("Season event receipt or canonical block did not verify");
      const receiptLog=receipt.logs.find(l=>l.logIndex===log.logIndex&&sameAddress(l.address,ADDRESSES.arena));
      if(!receiptLog||receiptLog.data!==log.data||JSON.stringify(receiptLog.topics)!==JSON.stringify(log.topics))throw new Error("Claim log does not match its receipt");
      const event=decodeEventLog({abi:ABIS.arena,data:receiptLog.data,topics:receiptLog.topics,strict:true});
      if(event.eventName!=="Claimed"||r.state!==2||!entry.claimed)throw new Error("Claim was not recorded in a settled Arena round");
      const expected=entry.choice===0?80n*10n**18n:entry.choice===r.winningChoice?100n*10n**18n+r.prizePerWinner:90n*10n**18n;
      if(args.amount!==expected)throw new Error("Claim amount disagrees with deployed Arena scoring");
      claims.push({...args,prize:args.amount>100n*10n**18n?args.amount-100n*10n**18n:0n,transactionHash:log.transactionHash,block:log.blockNumber});
    }
  }
  return {season,start:new Date(start*1000).toISOString(),end:new Date(end*1000).toISOString(),fromBlock:from,throughBlock:through,claims};
}
