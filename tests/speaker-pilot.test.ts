import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ControlledSpeakerPilot} from '../src/index.js';
import type {SceneActor,VerifiedPilotObservation} from '../src/index.js';
const scope={tenantId:'tenant',sessionId:'concert',application:'scenesignal' as const};
const host:SceneActor={tenantId:'tenant',sessionId:'concert',identityId:'host',
 roles:['organizer'],expiresAtMs:500000};
const devices=Array.from({length:10},(_,i)=>({speakerId:'speaker'+i,outputId:'output'+i,
 consentReferenceId:'consent'+i,consentExpiresAtMs:10000}));
const fact:VerifiedPilotObservation={observationId:'observed',tenantId:'tenant',sessionId:'concert',
 siteRevision:1,observedAtMs:1100,outputs:devices.map(d=>({outputId:d.outputId,clockDriftMs:2,dropouts:0}))};
const make=(read:()=>Promise<VerifiedPilotObservation|null>)=>
 new ControlledSpeakerPilot(scope,1,5,1,read);
test('verified fixture records all ten outputs but cannot certify real hardware',async()=>{
 const p=make(async()=>fact);p.plan(host,devices,1000,5000);
 assert.deepEqual(await p.record(host,'opaque',1200),{duplicate:false,fieldValidated:false});
 assert.deepEqual(await p.record(host,'opaque',1200),{duplicate:true,fieldValidated:false});
 const summary=p.privateSummary(host,1200);
 assert.equal(summary.plannedOutputs,10);
 assert.deepEqual(summary.observations.map(x=>x.withinDeclaredEnvelope),[true]);
 assert.equal(summary.fieldValidated,false);
 assert.ok(!JSON.stringify(summary).includes('consent0'));
});
test('failed dropout metric is retained as a failed envelope',async()=>{
 const bad={...fact,outputs:fact.outputs.map((o,i)=>i?o:{...o,dropouts:2})};
 const p=make(async()=>bad);p.plan(host,devices,1000,5000);
 await p.record(host,'opaque',1200);
 assert.equal(p.privateSummary(host,1200).observations[0]!.withinDeclaredEnvelope,false);
});
test('rejects insufficient speaker count, duplicate output and missing consent window',()=>{
 const p=make(async()=>fact);
 assert.throws(()=>p.plan(host,devices.slice(0,9),1000,5000));
 assert.throws(()=>p.plan(host,[...devices.slice(0,9),devices[0]!],1000,5000));
 assert.throws(()=>p.plan(host,[...devices.slice(0,9),{...devices[9]!,consentExpiresAtMs:5000}],1000,5000));
});
test('scope, observation identity, freshness and access failures deny',async()=>{
 const foreign=make(async()=>({...fact,sessionId:'other'}));
 foreign.plan(host,devices,1000,5000);
 await assert.rejects(foreign.record(host,'opaque',1200),/PILOT_SCOPE_DENIED/);
 const p=make(async()=>fact);p.plan(host,devices,1000,5000);
 await assert.rejects(p.record({...host,roles:['performer']},'opaque',1200),/SCENE_ACCESS_DENIED/);
 const stale=make(async()=>fact);stale.plan(host,devices,1000,5000);
 await assert.rejects(stale.record(host,'opaque',400000),/PILOT_OBSERVATION_STALE/);
 const unknown=make(async()=>({...fact,outputs:[...fact.outputs.slice(0,9),
  {outputId:'unknown',clockDriftMs:0,dropouts:0}]}));
 unknown.plan(host,devices,1000,5000);
 await assert.rejects(unknown.record(host,'opaque',1200),/PILOT_OUTPUT_COVERAGE/);
});
