import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionSettlementPreview} from '../src/index.js';
import type {SceneActor,VerifiedSettlementBatch} from '../src/index.js';
const scope={tenantId:'tenant',sessionId:'concert',application:'scenesignal' as const};
const organizer:SceneActor={tenantId:'tenant',sessionId:'concert',identityId:'host',
  roles:['organizer'],expiresAtMs:10000};
const facts:VerifiedSettlementBatch={tenantId:'tenant',sessionId:'concert',asOfMs:1000,
  payments:[{transactionId:'tx-1',artistId:'artist',grossCents:3000,currency:'USD',confirmedAtMs:990},
    {transactionId:'tx-2',artistId:'artist',grossCents:2000,currency:'USD',confirmedAtMs:999}],
  costs:[{expenseId:'cost-1',category:'SITE',amountCents:600,currency:'USD',approved:true}],
  participation:[{eventId:'contribution-1',contributorId:'guest',verifiedSeconds:40}]};
const make=(read:()=>Promise<VerifiedSettlementBatch|null>)=>
  new SessionSettlementPreview(scope,read);
test('private verified settlement preview totals only evidence, never executes a payout',async()=>{
 const report=await make(async()=>facts).report(organizer,1100);
 assert.equal(report.grossCents,5000);
 assert.equal(report.costCents,600);
 assert.equal(report.netBeforeDistributionCents,4400);
 assert.deepEqual(report.artistGross,[{artistId:'artist',grossCents:5000}]);
 assert.equal(report.verifiedParticipationSeconds,40);
 assert.equal(report.distributionExecuted,false);
 assert.equal(report.fieldValidated,false);
 assert.equal(JSON.stringify(report).includes('contributorId'),false);
});
test('performers and foreign sessions cannot view private financial data',async()=>{
 const viewer={...organizer,roles:['performer'] as SceneActor['roles']};
 await assert.rejects(make(async()=>facts).report(viewer,1100),/SCENE_ACCESS_DENIED/);
 await assert.rejects(make(async()=>facts).report({...organizer,sessionId:'wrong'},1100),
   /SCENE_ACCESS_DENIED/);
 await assert.rejects(make(async()=>({...facts,sessionId:'wrong'})).report(organizer,1100),
   /SETTLEMENT_SCOPE_DENIED/);
});
test('duplicate receipts, invented expense approval and participation replay deny',async()=>{
 for(const bad of [
   {...facts,payments:[facts.payments[0]!,facts.payments[0]!] },
   {...facts,costs:[{...facts.costs[0]!,approved:false}]},
   {...facts,participation:[facts.participation[0]!,facts.participation[0]!]}
 ]){
   await assert.rejects(make(async()=>bad).report(organizer,1100));
 }
});
test('unsigned, stale, inflated or malformed evidence cannot produce a settlement',async()=>{
 await assert.rejects(make(async()=>null).report(organizer,1100),/SETTLEMENT_EVIDENCE_UNVERIFIED/);
 await assert.rejects(make(async()=>({...facts,asOfMs:1})).report(
   {...organizer,expiresAtMs:700000},400000),/SETTLEMENT_EVIDENCE_STALE/);
 await assert.rejects(make(async()=>({...facts,payments:[{...facts.payments[0]!,grossCents:1000000001}]}))
   .report(organizer,1100));
 await assert.rejects(make(async()=>({...facts,participation:[{...facts.participation[0]!,
   verifiedSeconds:301}]})).report(organizer,1100));
});
