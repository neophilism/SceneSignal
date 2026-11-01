import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionContributionLedger} from '../src/index.js';
import type {VerifiedSessionContribution} from '../src/index.js';
const scope={tenantId:'tenant',sessionId:'session',application:'scenesignal' as const};
const claim:VerifiedSessionContribution={eventId:'observation',tenantId:'tenant',sessionId:'session',
 speakerId:'speaker',contributorId:'guest',seconds:30,verifiedAtMs:1000};
test('accepts scoped verifier evidence once and avoids double credit',async()=>{
 const ledger=new SessionContributionLedger(scope,async()=>claim);
 assert.deepEqual(await ledger.admit('opaque-cipher',1100),{creditedSeconds:30,duplicate:false});
 assert.deepEqual(await ledger.admit('opaque-cipher',1100),{creditedSeconds:30,duplicate:true});
 assert.deepEqual(ledger.summary(),[{contributorId:'guest',creditedSeconds:30}]);
});
test('denies foreign scope, stale claim, inflated seconds and receipt replay mutation',async()=>{
 for(const [invalid,now] of [
   [{...claim,tenantId:'other'},1100],
   [{...claim,verifiedAtMs:1},310000],
   [{...claim,seconds:301},1100]
 ] as const){
   const ledger=new SessionContributionLedger(scope,async()=>invalid);
   await assert.rejects(ledger.admit('opaque',now));
 }
 let current=claim;
 const ledger=new SessionContributionLedger(scope,async()=>current);
 await ledger.admit('cipher',1100);
 current={...claim,seconds:31};
 await assert.rejects(ledger.admit('cipher',1100),/CONTRIBUTION_REPLAY_CONFLICT/);
 assert.deepEqual(ledger.summary(),[{contributorId:'guest',creditedSeconds:30}]);
});
test('limits claims and refuses missing proof',async()=>{
 const missing=new SessionContributionLedger(scope,async()=>null);
 await assert.rejects(missing.admit('receipt',1100),/CONTRIBUTION_UNVERIFIED/);
 const capped=new SessionContributionLedger(scope,async()=>claim,20);
 await assert.rejects(capped.admit('receipt',1100),/CONTRIBUTION_CREDIT_LIMIT/);
 assert.deepEqual(capped.summary(),[]);
});

test('extra verifier fields including private key material are rejected',async()=>{
 const ledger=new SessionContributionLedger(scope,async()=>({...claim,privateKey:'never-store'}));
 await assert.rejects(ledger.admit('cipher',1100),/CONTRIBUTION_UNVERIFIED/);
 assert.deepEqual(ledger.summary(),[]);
});

test('multiple unique observations never exceed per-contributor allowance',async()=>{
 let current=claim;
 const ledger=new SessionContributionLedger(scope,async()=>current,50);
 await ledger.admit('first',1100);
 current={...claim,eventId:'second',seconds:21};
 await assert.rejects(ledger.admit('second',1100),/CONTRIBUTION_CREDIT_LIMIT/);
 assert.deepEqual(ledger.summary(),[{contributorId:'guest',creditedSeconds:30}]);
});
