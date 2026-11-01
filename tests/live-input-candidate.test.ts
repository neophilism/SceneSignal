import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveInputCandidateGate} from '../src/index.js';
import type {SceneActor,VerifiedLiveMonitorReport} from '../src/index.js';

const scope={tenantId:'tenant',sessionId:'session',application:'scenesignal' as const};
const actor:SceneActor={tenantId:'tenant',sessionId:'session',
  identityId:'organizer',roles:['organizer'],expiresAtMs:20000};
const report:VerifiedLiveMonitorReport={proofId:'measurement',tenantId:'tenant',sessionId:'session',
  inputDeviceId:'mic',monitorRouteId:'performer-monitor',measuredAtMs:1000,expiresAtMs:5000,
  roundTripLatencyMs:12,jitterMs:2,sampleCount:20,
  monitorChannelVerified:true,performerConsentVerified:true};
const gate=(verify:()=>Promise<VerifiedLiveMonitorReport|null>)=>
  new LiveInputCandidateGate(scope,verify,40,8,10);

test('signed-verifier adapter candidate is bounded, expires and cannot start an audio route',async()=>{
 const g=gate(async()=>report);
 assert.equal(g.candidate(actor,1001),null);
 assert.deepEqual(await g.admit(actor,'opaque-proof',1100),{duplicate:false,fieldValidated:false});
 assert.deepEqual(g.candidate(actor,1100),{inputDeviceId:'mic',monitorRouteId:'performer-monitor',
   evidenceExpiresAtMs:5000,fieldValidated:false});
 assert.equal(g.candidate(actor,900),null);
 assert.equal(g.candidate(actor,5000),null);
 g.clear(actor,1101);
 assert.equal(g.candidate(actor,1102),null);
});
test('replayed evidence is idempotent, mutation and old proof are denied',async()=>{
 let current=report;
 const g=gate(async()=>current);
 await g.admit(actor,'proof',1100);
 assert.deepEqual(await g.admit(actor,'proof',1100),{duplicate:true,fieldValidated:false});
 current={...report,jitterMs:3};
 await assert.rejects(g.admit(actor,'proof',1100),/LIVE_INPUT_PROOF_REPLAY_CONFLICT/);
 current={...report,proofId:'older',measuredAtMs:999};
 await assert.rejects(g.admit(actor,'old',1100),/LIVE_INPUT_PROOF_NOT_NEWER/);
});
test('scope, rights, unverified measurement, missing consent, jitter and freshness deny',async()=>{
 for(const invalid of [
   {...report,tenantId:'foreign'}, {...report,roundTripLatencyMs:99},
   {...report,jitterMs:9},{...report,sampleCount:1},
   {...report,monitorChannelVerified:false},{...report,performerConsentVerified:false},
   {...report,expiresAtMs:700000}
 ]){
   const g=gate(async()=>invalid);
   await assert.rejects(g.admit(actor,'proof',1100));
   assert.equal(g.candidate(actor,1100),null);
 }
 const unverified=gate(async()=>null);
 await assert.rejects(unverified.admit(actor,'proof',1100),/LIVE_INPUT_EVIDENCE_UNVERIFIED/);
 const fresh=gate(async()=>report);
 await assert.rejects(fresh.admit({...actor,roles:['performer']},'proof',1100),/SCENE_ACCESS_DENIED/);
 await assert.rejects(fresh.admit({...actor,sessionId:'foreign'},'proof',1100),/SCENE_ACCESS_DENIED/);
 await assert.rejects(fresh.admit(actor,'',1100),/INVALID_LIVE_INPUT_EVIDENCE/);
});
