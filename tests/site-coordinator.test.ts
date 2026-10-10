import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneSession, SceneSiteCoordinator } from '../src/index.js';
import { ControlVerifier, MemoryCheckpointStore, createControlSigningKey, signControl } from '@neophilism/distributed-audio-engine';
import type { SceneActor, SitePlan } from '../src/index.js';
import type { ControlBody, CoordinatorLease } from '@neophilism/distributed-audio-engine';

const scope={tenantId:'label',application:'scenesignal' as const,sessionId:'concert'};
const plan:SitePlan={siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:5000,endsAtMs:15000,maximumLinearGain:0.4,publicSummary:'Public concert'};
const actor:SceneActor={tenantId:'label',sessionId:'concert',identityId:'host',roles:['organizer'],expiresAtMs:25000};
const request={tenantId:'label',application:'scenesignal' as const,storageObjectId:'object',chunkIndex:0,expectedBytes:20};

async function fixture(decoder?: (body: ControlBody)=>Promise<CoordinatorLease>) {
  const keys=await createControlSigningKey();
  const verifier=new ControlVerifier(scope,new Map([['key',keys.publicKey]]),new Set(['coordinator-lease']),new MemoryCheckpointStore());
  const body:ControlBody={version:'1.0.0',scope,keyId:'key',algorithm:'ALG-ED25519',epoch:1,sequence:1,issuedAtMs:1000,expiresAtMs:3000,action:'coordinator-lease',payloadCiphertextBase64:'YWJjZA=='};
  const lease:CoordinatorLease={coordinatorId:'local',programId:'program',expiresAtMs:2000,term:1};
  const session=new SceneSession(scope,plan,()=>{});
  let now=1000, local=0, fallback=0;
  const coordinator=new SceneSiteCoordinator(session,'program',verifier,decoder??(async()=>lease),
    new Map([['local',{async read(){local++;return new Uint8Array(20).fill(1);}}]]),
    {async read(){fallback++;return new Uint8Array(20).fill(2);}},
    {nowUnixMs:()=>now});
  return {coordinator,session,keys,body,lease,setNow:(n:number)=>{now=n;},counts:()=>({local,fallback})};
}
test('preauthorized routing is ciphertext-only fallback, signed lease selects registered local host',async()=>{
  const f=await fixture();
  assert.deepEqual(f.coordinator.diagnostics(actor,1000),{localLease:'none',coordinatorId:null,siteRevision:1,nativeDeviceReady:false,fieldValidated:false});
  assert.equal((await f.coordinator.readCiphertext(actor,request,1000))[0],2);
  await f.coordinator.acceptLease(actor,await signControl(f.body,f.keys.privateKey),1000);
  assert.equal((await f.coordinator.readCiphertext(actor,request,1000))[0],1);
  assert.deepEqual(f.counts(),{local:1,fallback:1});
  assert.equal(f.coordinator.diagnostics(actor,1000).localLease,'signed-active');
  f.setNow(2000);
  assert.equal((await f.coordinator.readCiphertext(actor,request,2000))[0],2);
});
test('untrusted roles or tenant scope cannot grant coordinator access',async()=>{
  const f=await fixture(), signed=await signControl(f.body,f.keys.privateKey);
  await assert.rejects(f.coordinator.acceptLease({...actor,roles:['performer']},signed,1000));
  await assert.rejects(f.coordinator.acceptLease({...actor,tenantId:'other'},signed,1000));
  await assert.rejects(f.coordinator.readCiphertext({...actor,roles:['performer']},request,1000));
  await assert.rejects(f.coordinator.readCiphertext(actor,{...request,tenantId:'foreign'},1000));
  assert.equal(f.counts().local,0);
});
test('site revision or cancellation irreversibly disables old coordinator',async()=>{
  const f=await fixture(), signed=await signControl(f.body,f.keys.privateKey);
  await f.coordinator.acceptLease(actor,signed,1000);
  f.session.revise(actor,{...plan,revision:2,conditionsDigestHex:'b'.repeat(64)},1100);
  await assert.rejects(f.coordinator.readCiphertext(actor,request,1101),/SITE_COORDINATOR_NOT_CURRENT/);
  await assert.rejects(f.coordinator.acceptLease(actor,signed,1102),/SITE_COORDINATOR_NOT_CURRENT/);
  const g=await fixture();g.session.cancel(actor,1000);
  await assert.rejects(g.coordinator.readCiphertext(actor,request,1001),/SITE_COORDINATOR_NOT_CURRENT/);
});
test('cancellation during asynchronous signed-lease decoding cannot resurrect access',async()=>{
  let release!:(value:CoordinatorLease)=>void,entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const f=await fixture(async()=>{entered();return new Promise<CoordinatorLease>(resolve=>{release=resolve;});});
  const pending=f.coordinator.acceptLease(actor,await signControl(f.body,f.keys.privateKey),1000);
  await started;
  f.session.cancel(actor,1100);
  release(f.lease);
  await assert.rejects(pending);
  await assert.rejects(f.coordinator.readCiphertext(actor,request,1101),/SITE_COORDINATOR_NOT_CURRENT/);
});
test('untrusted altered or forged coordinator control is rejected',async()=>{
  const f=await fixture(),wrong=await createControlSigningKey();
  await assert.rejects(f.coordinator.acceptLease(actor,await signControl(f.body,wrong.privateKey),1000));
  assert.equal(f.coordinator.diagnostics(actor,1000).localLease,'none');
});
