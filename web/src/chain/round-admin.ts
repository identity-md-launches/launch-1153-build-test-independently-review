import { isHex, keccak256, stringToHex, zeroHash, type Address, type Hex, type WalletClient } from "viem";
import { ABIS, ADDRESSES, sameAddress } from "./config";
import { readRound, readSnapshot, readValue } from "./read";
import { executeCall } from "./write";
import { verifyOperatorStatus, type OperatorProof } from "./operator";
import type { PinnedQuestion, Snapshot, StatusListener } from "./types";
export interface RoundDraft {
  id: bigint; mode: number; choiceCount: number; commitDeadline: bigint; revealDeadline: bigint; resultDeadline: bigint;
  prize: bigint; bossThreshold: number; questionHash: Hex; minPanel: number; minQuorum: number; body: Hex;
  source: "owner" | "imd"; proposalId: string;
}
export const DEPLOYED_SCORING = "winner=(oracleAnswer%choiceCount)+1; correct=100 PRIO+equal funded prize share; wrong=90 PRIO; missed reveal=80 PRIO; entry=100 escrow+2 fee; cancel=102 PRIO refund; boss prize requires correct>=bossThreshold; gas separate";
/** Public rules are reproducible from immutable Arena fields and the pinned question body. */
export function roundRules(d: RoundDraft) {
  return JSON.stringify({version:1,chainId:1,arena:ADDRESSES.arena,roundId:d.id.toString(),mode:d.mode,choiceCount:d.choiceCount,
    commitDeadline:d.commitDeadline.toString(),revealDeadline:d.revealDeadline.toString(),resultDeadline:d.resultDeadline.toString(),
    prizeWei:d.prize.toString(),bossThreshold:d.bossThreshold,questionHash:d.questionHash,body:d.body,scoring:DEPLOYED_SCORING});
}
export function rulesHash(d: RoundDraft) { return keccak256(stringToHex(roundRules(d))); }
export function validateRoundDraft(d: RoundDraft, s: Snapshot) {
  if (d.id !== s.arena.roundCount+1n) throw new Error("Round count changed. Load the next round ID and review again.");
  if (!Number.isInteger(d.mode)||d.mode<0||d.mode>2||!Number.isInteger(d.choiceCount)||d.choiceCount<2||d.choiceCount>255||(d.mode===1&&d.choiceCount!==2)) throw new Error("Choose a valid mode and 2–255 choices; Faction Duel requires exactly 2.");
  if (!Number.isInteger(d.bossThreshold)||d.bossThreshold<0||d.bossThreshold>65535||(d.mode===2&&d.bossThreshold<1)||(d.mode!==2&&d.bossThreshold!==0)) throw new Error("Boss rounds require a threshold of 1–65535; other modes use 0.");
  if (!(BigInt(s.timestamp)<d.commitDeadline&&d.commitDeadline<d.revealDeadline&&d.revealDeadline<d.resultDeadline)||d.resultDeadline-d.commitDeadline>2592000n||d.resultDeadline>=2n**64n) throw new Error("Use future UTC deadlines: commit < reveal < result, with at most 30 days from commit to result.");
  if (d.prize<=0n||d.prize>s.arena.unallocatedPrizePool) throw new Error("Prize must be positive and no greater than the on-chain unallocated prize pool. Player escrow cannot fund prizes.");
  if (!isHex(d.questionHash)||d.questionHash.length!==66||d.questionHash===zeroHash||!isHex(d.body)||d.body.length<=2||d.body.length>32770) throw new Error("Supply the reviewed canonical question hash and exact Intake body (up to 16 KiB). Do not guess the protocol hash.");
  if (!Number.isInteger(d.minPanel)||!Number.isInteger(d.minQuorum)||d.minQuorum<2||d.minPanel<d.minQuorum||d.minPanel>65535) throw new Error("Panel and quorum must be integers; panel ≥ quorum ≥ 2, up to 65535.");
}
export function pinMatches(pin:PinnedQuestion,d:RoundDraft,s:Snapshot) {
  return pin.questionHash.toLowerCase()===d.questionHash.toLowerCase() && pin.chainId===1n && pin.notBefore===d.commitDeadline && pin.minPanel===d.minPanel && pin.minQuorum===d.minQuorum && pin.body===d.body && sameAddress(pin.signer,s.adapter.oracleSigner);
}
export async function executeRoundStep(wallet:WalletClient,account:Address,d:RoundDraft,step:"pin"|"create",proof:OperatorProof|undefined,onStatus?:StatusListener) {
  if(!sameAddress(account,ADDRESSES.owner))throw new Error("Only the verified project owner may create rounds");
  const s=await readSnapshot(account);
  validateRoundDraft(d,s);
  if(!s.verified||!s.phaseAComplete||!s.operationsReady) throw new Error(s.readinessReasons.join("; "));
  if(!proof)throw new Error("Fresh signed operator readiness is required before pinning or opening a paid round");
  const fresh=await verifyOperatorStatus(proof.signed,s);
  if(!fresh.serviceReady)throw new Error(fresh.reasons.join("; "));
  if(d.source==="imd"&&!fresh.signed.payload.reviewedChallenges?.some(c=>c.id===d.proposalId&&c.questionHash.toLowerCase()===d.questionHash.toLowerCase()&&c.bodyHash===keccak256(d.body)&&c.rulesHash===rulesHash(d)))throw new Error("IMD content needs a real reviewed proposal in the signed operator report, matching this exact body, question and future rules.");
  const pin=await readValue<PinnedQuestion>("adapter","pinned",[d.id],s.blockNumber);
  if(step==="pin") {
    if(pin.questionHash!==zeroHash) {
      if(pinMatches(pin,d,s)) return undefined;
      throw new Error("A different question is already pinned. Stop and review; this panel never overwrites a conflicting pin.");
    }
    const receipt=await executeCall(wallet,account,{address:ADDRESSES.adapter,abi:ABIS.adapter,functionName:"pinQuestion",args:[d.id,d.questionHash,1n,d.minPanel,d.minQuorum,d.commitDeadline,d.body]},"OracleAdapter.pinQuestion",onStatus);
    const after=await readValue<PinnedQuestion>("adapter","pinned",[d.id]);
    if(!pinMatches(after,d,s))throw new Error("Pin receipt succeeded but the on-chain question differs. Stop and review.");
    return receipt;
  }
  if(!pinMatches(pin,d,s))throw new Error("Pin the exact reviewed question first, with notBefore equal to the commit deadline.");
  const receipt=await executeCall(wallet,account,{address:ADDRESSES.arena,abi:ABIS.arena,functionName:"createRound",args:[d.mode,d.choiceCount,d.commitDeadline,d.revealDeadline,d.resultDeadline,d.prize,d.bossThreshold,rulesHash(d)]},"Arena.createRound",onStatus);
  const after=await readRound(d.id);
  const r=after.round;
  if(r.state!==1||r.rulesHash!==rulesHash(d)||r.questionHash.toLowerCase()!==d.questionHash.toLowerCase()||r.commitDeadline!==d.commitDeadline||r.revealDeadline!==d.revealDeadline||r.resultDeadline!==d.resultDeadline||r.prize!==d.prize||r.mode!==d.mode||r.choiceCount!==d.choiceCount||r.bossThreshold!==d.bossThreshold||!sameAddress(r.oracle,ADDRESSES.adapter))throw new Error("Round receipt succeeded but immutable round fields differ. Stop and review.");
  return receipt;
}
