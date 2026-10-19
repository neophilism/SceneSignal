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
 for(const invalid of [{...claim,tenantId:'other'},{...claim,verifiedAtMs:1},
   {...claim,seconds:301}]){
   const ledger=new SessionContributionLedger(scope,async()=>invalid);
   await assert.rejects(ledger.admit('opaque',310000));
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
