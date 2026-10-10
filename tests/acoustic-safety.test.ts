import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneAcousticMonitor, SceneSession } from '../src/index.js';
import type { AcousticObservation, SceneActor, SessionAuthorization, SitePlan } from '../src/index.js';
import {
  ControlVerifier, MemoryCheckpointStore, createControlSigningKey, signControl
} from '@neophilism/distributed-audio-engine';
import type { ControlBody } from '@neophilism/distributed-audio-engine';

const scope = {tenantId:'label',application:'scenesignal' as const,sessionId:'show'};
const plan:SitePlan = {siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:2000,endsAtMs:10000,maximumLinearGain:0.3,publicSummary:'Free concert'};
const actor:SceneActor={tenantId:'label',sessionId:'show',identityId:'host',roles:['organizer'],expiresAtMs:15000};
const observation:AcousticObservation={sensorId:'meter',calibrationReference:'calibration',siteRevision:1,observedAtMs:2200,calibrationValidUntilMs:9000,measuredDbA:71};
const authorization:SessionAuthorization={kind:'organizer-attested',siteId:'site',siteRevision:1,conditionsDigestHex:plan.conditionsDigestHex,validFromMs:1000,validUntilMs:11000,authorizerId:'host',encryptedEvidenceObjectId:'object',evidenceDigestHex:'b'.repeat(64),maximumLinearGain:0.3};

async function fixture(decode?: (body:ControlBody)=>Promise<AcousticObservation>) {
  const stops:string[] = []; const session=new SceneSession(scope,plan,(reason)=>stops.push(reason));
  const keys=await createControlSigningKey();
  const authVerifier=new ControlVerifier(scope,new Map([['key',keys.publicKey]]),new Set(['session-authorize']),new MemoryCheckpointStore());
  const authBody:ControlBody={version:'1.0.0',scope,keyId:'key',algorithm:'ALG-ED25519',epoch:1,sequence:1,issuedAtMs:1000,expiresAtMs:12000,action:'session-authorize',payloadCiphertextBase64:'YWJjZA=='};
  await session.authorize(actor,await signControl(authBody,keys.privateKey),authVerifier,async()=>authorization,1000);
  session.activate(actor,2000);
  const verifier=new ControlVerifier(scope,new Map([['key',keys.publicKey]]),new Set(['acoustic-observation']),new MemoryCheckpointStore());
  const monitor=new SceneAcousticMonitor(session,verifier,decode??(async()=>observation),{maxDbA:75,maxStalenessMs:500});
  const report=async(sequence=1,nowMs=2250)=>{
    const control:ControlBody={...authBody,action:'acoustic-observation',sequence,issuedAtMs:2100,expiresAtMs:9000};
    return monitor.accept(actor,await signControl(control,keys.privateKey),nowMs);
  };
  return{monitor,session,keys,stops,report,authBody};
}
test('reported levels below threshold do not count as verified hardware safety',async()=>{
  const f=await fixture();
  assert.equal(f.monitor.status(2100).state,'no-observation');
  const result=await f.report(1,2250);
  assert.equal(result.state,'adapter-reported-below-limit');
  assert.equal(result.mostRecentLevelDbA,71);
  assert.equal(result.verifiedPhysicalEvidence,false);
  assert.equal(result.safeForProductionRelease,false);
  assert.equal(f.session.snapshot().state,'active');
});
test('over-limit signed observation stops operating session and cannot reopen it',async()=>{
  const f=await fixture(async()=>({...observation,measuredDbA:78}));
  const result=await f.report(1,2250);
  assert.equal(result.state,'halted');
  assert.equal(f.session.snapshot().state,'stopped');
  assert.deepEqual(f.stops,['ACOUSTIC_LIMIT_EXCEEDED']);
  await assert.rejects(f.report(2,2251),/ACOUSTIC_MONITOR_NOT_CURRENT/);
});
test('stale or absent meter observations stop active output; emergency stop needs no meter',async()=>{
  const f=await fixture();
  assert.equal(f.monitor.tick(actor,2200).state,'halted');
  assert.deepEqual(f.stops,['ACOUSTIC_MONITOR_STALE']);
  const g=await fixture();
  await g.report(1,2250);
  assert.equal(g.monitor.tick(actor,2800).state,'halted');
  assert.deepEqual(g.stops,['ACOUSTIC_MONITOR_STALE']);
  const h=await fixture();
  h.monitor.emergencyStop({...actor,roles:['steward']},2100);
  assert.deepEqual(h.stops,['ACOUSTIC_EMERGENCY_STOP']);
});
test('role, scope, forged signing keys and out-of-site reports fail closed',async()=>{
  const f=await fixture(), control:ControlBody={...f.authBody,action:'acoustic-observation',issuedAtMs:2100,expiresAtMs:9000};
  const signed=await signControl(control,f.keys.privateKey);
  await assert.rejects(f.monitor.accept({...actor,roles:['performer']},signed,2250));
  await assert.rejects(f.monitor.accept({...actor,tenantId:'other'},signed,2250));
  const wrong=await createControlSigningKey();
  await assert.rejects(f.monitor.accept(actor,await signControl(control,wrong.privateKey),2250));
  assert.equal(f.monitor.status(2250).state,'no-observation');
  const g=await fixture(async()=>({...observation,siteRevision:2}));
  await assert.rejects(g.report(1,2250),/ACOUSTIC_OBSERVATION_STALE_OR_WRONG_SITE/);
  assert.equal(g.monitor.status(2250).state,'no-observation');
});
test('cancellation while a report decrypts cannot resurrect observation or speaker output',async()=>{
  let entered!:()=>void,release!:(o:AcousticObservation)=>void;
  const ready=new Promise<void>(r=>{entered=r;});
  const f=await fixture(async()=>{entered();return new Promise<AcousticObservation>(r=>{release=r;});});
  const pending=f.report(1,2250);
  await ready;
  f.monitor.emergencyStop(actor,2260);
  release(observation);
  await assert.rejects(pending,/ACOUSTIC_OBSERVATION_SUPERSEDED/);
  assert.equal(f.monitor.status(2260).state,'halted');
  assert.deepEqual(f.stops,['ACOUSTIC_EMERGENCY_STOP']);
});
