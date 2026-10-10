import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, stringToHex, zeroHash } from 'viem';
import { fmt } from '../src/ui';
import { clearLegacyLanguage } from '../src/i18n';
import { rankClaims, seasonWindow } from '../src/chain/seasons';
import { validateRoundDraft, roundRules, rulesHash, pinMatches, type RoundDraft } from '../src/chain/round-admin';
import { ADDRESSES, type Snapshot } from '../src/chain';
const s={timestamp:100,arena:{roundCount:0n,unallocatedPrizePool:200n*10n**18n},adapter:{oracleSigner:ADDRESSES.owner}} as unknown as Snapshot;
const draft:RoundDraft={id:1n,mode:0,choiceCount:3,commitDeadline:200n,revealDeadline:300n,resultDeadline:400n,prize:100n*10n**18n,bossThreshold:0,questionHash:keccak256(stringToHex('isolated test question')),minPanel:3,minQuorum:2,body:stringToHex('{"test":"reviewed fixture only"}'),source:'owner',proposalId:''};
test('precise token formatting preserves large integers and never hides dust as zero',()=>{
 assert.equal(fmt(123456789123456789123456789n,9),'123,456,789.123456789');
 assert.equal(fmt(1n,4),'<0.0001');assert.equal(fmt(0n),'0');assert.equal(fmt(undefined),'—');
 assert.equal(fmt(189025768306811092460045138888888888n,9,36),'0.189025768');
 assert.equal(fmt(10n**18n,9),'1');
});
test('legacy Turkish preference is removed; language rendering is always English',()=>{
 const values=new Map([['prism-language','tr']]);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{removeItem:(k:string)=>values.delete(k)}});
 clearLegacyLanguage();assert.equal(values.has('prism-language'),false);
 if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete (globalThis as any).localStorage;
});
test('owner round draft rejects unfunded, stale and invalid protocol/deadline choices',()=>{
 assert.doesNotThrow(()=>validateRoundDraft(draft,s));
 const invalid:Partial<RoundDraft>[]=[{id:2n},{mode:3},{choiceCount:1},{mode:1,choiceCount:3},{mode:2,bossThreshold:0},{bossThreshold:1},{commitDeadline:99n},{revealDeadline:200n},{resultDeadline:300n},{resultDeadline:2600001n},{prize:0n},{prize:201n*10n**18n},{questionHash:zeroHash},{body:'0x'},{minPanel:1},{minQuorum:1},{minPanel:2,minQuorum:3}];
 for(const change of invalid)assert.throws(()=>validateRoundDraft({...draft,...change},s),JSON.stringify(change,(_,v)=>typeof v==='bigint'?v.toString():v));
});
test('published rules hash binds all frozen economic parameters and exact question body',()=>{
 assert.equal(rulesHash(draft),keccak256(stringToHex(roundRules(draft))));
 for(const change of [{prize:99n},{commitDeadline:201n},{choiceCount:4},{body:stringToHex('changed')},{mode:2,bossThreshold:2}])assert.notEqual(rulesHash({...draft,...change}),rulesHash(draft));
 const pin={questionHash:draft.questionHash,chainId:1n,minPanel:3,minQuorum:2,notBefore:200n,signer:ADDRESSES.owner,body:draft.body};
 assert.equal(pinMatches(pin,draft,s),true);assert.equal(pinMatches({...pin,notBefore:201n},draft,s),false);assert.equal(pinMatches({...pin,signer:ADDRESSES.arena},draft,s),false);
});
test('seasons use UTC calendar boundaries and prize shares instead of returned principal',()=>{
 assert.deepEqual(seasonWindow('2026-10'),{start:Date.UTC(2026,9,1)/1000,end:Date.UTC(2026,10,1)/1000});assert.throws(()=>seasonWindow('2026-13'));
 const common={roundId:1n,transactionHash:zeroHash,block:1n};
 const ranks=rankClaims([{...common,player:ADDRESSES.owner,amount:150n,prize:50n},{...common,player:ADDRESSES.owner,amount:90n,prize:0n},{...common,player:ADDRESSES.arena,amount:200n,prize:100n}]);
 assert.equal(ranks[0].player,ADDRESSES.arena);assert.equal(ranks[1].prize,50n);assert.equal(ranks[1].claims,2);
});
