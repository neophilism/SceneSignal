import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ingestCompositionManifest} from '../src/index.js';
import type {CompositionAsset, CompositionManifest, SceneActor} from '../src/index.js';

const scope = {tenantId:'tenant', application:'scenesignal' as const, sessionId:'session'};
const actor:SceneActor = {tenantId:'tenant',sessionId:'session',identityId:'organizer',
  roles:['organizer'],expiresAtMs:10000};
const stem:CompositionAsset = {id:'violin',encryptedObjectId:'cipher-stem',role:'strings',
  sampleRate:48000,frames:480000,channels:2,pcmSha256:'a'.repeat(64),encrypted:true};
const completeMix:CompositionAsset = {id:'mix',encryptedObjectId:'cipher-mix',role:'complete-mix',
  sampleRate:48000,frames:480000,channels:2,pcmSha256:'b'.repeat(64),encrypted:true};
const manifest:CompositionManifest = {id:'song',revision:1,sampleRate:48000,
  frames:480000,stems:[stem],completeMix};
const probe = async (objectId:string) => {
  const a = objectId === stem.encryptedObjectId ? stem : completeMix;
  return {sampleRate:a.sampleRate,frames:a.frames,channels:a.channels,pcmSha256:a.pcmSha256};
};
const args = () => ({actor,scope,manifest,nowMs:()=>1000,
  rightsAllowAsset:()=>true,probe});

test('admits endpoint-verified aligned stems and complete mix as a private copy',async()=>{
  const accepted=await ingestCompositionManifest(args());
  assert.deepEqual(accepted,manifest);
  assert.notEqual(accepted,manifest);
  manifest.stems[0]!.id='changed';
  assert.equal(accepted.stems[0]!.id,'violin');
  manifest.stems[0]!.id='violin';
});
test('rejects missing fallback, duplicate assets and unaligned media',async()=>{
  await assert.rejects(ingestCompositionManifest({...args(),manifest:{...manifest,completeMix:undefined as unknown as CompositionAsset}}));
  await assert.rejects(ingestCompositionManifest({...args(),manifest:{...manifest,completeMix:{...completeMix,encryptedObjectId:stem.encryptedObjectId}}}));
  await assert.rejects(ingestCompositionManifest({...args(),manifest:{...manifest,stems:[{...stem,frames:479999}]}}));
});
test('denies a foreign actor, revoked rights and mismatched decoded bytes',async()=>{
  await assert.rejects(ingestCompositionManifest({...args(),actor:{...actor,tenantId:'other'}}));
  await assert.rejects(ingestCompositionManifest({...args(),rightsAllowAsset:()=>false}));
  await assert.rejects(ingestCompositionManifest({...args(),probe:async()=>({sampleRate:48000,frames:480000,channels:2 as const,pcmSha256:'f'.repeat(64)})}));
});
test('rejects rights expiry during asynchronous probing',async()=>{
  let calls=0;
  await assert.rejects(ingestCompositionManifest({...args(),rightsAllowAsset:()=>++calls<=2}));
});
test('rejects extra key material and plaintext manifest fields',async()=>{
  const withKey={...stem,key:'secret'} as CompositionAsset;
  await assert.rejects(ingestCompositionManifest({...args(),manifest:{...manifest,stems:[withKey]}}));
  await assert.rejects(ingestCompositionManifest({...args(),manifest:{...manifest,stems:[{...stem,encrypted:false as true}]}}));
});

test('rejects a caller mutation during asynchronous endpoint verification',async()=>{
  const mutable=structuredClone(manifest);
  await assert.rejects(ingestCompositionManifest({
    ...args(),
    manifest:mutable,
    probe:async objectId=>{
      if(objectId===stem.encryptedObjectId){
        mutable.stems[0]!.pcmSha256='f'.repeat(64);
        return {...await probe(objectId),pcmSha256:'f'.repeat(64)};
      }
      return probe(objectId);
    }
  }),/DECODED_ASSET_EVIDENCE_MISMATCH/);
});

test('cancellation during endpoint decode aborts ingestion without probing other assets',async()=>{
  const controller=new AbortController();
  const seen:string[]=[];
  await assert.rejects(ingestCompositionManifest({...args(),signal:controller.signal,
    probe:async objectId=>{
      seen.push(objectId);
      controller.abort();
      return probe(objectId);
    }
  }),/COMPOSITION_INGEST_CANCELLED/);
  assert.deepEqual(seen,[stem.encryptedObjectId]);
});

test('already-cancelled ingestion performs no endpoint probe',async()=>{
  const controller=new AbortController();
  controller.abort();
  let calls=0;
  await assert.rejects(ingestCompositionManifest({...args(),signal:controller.signal,
    probe:async objectId=>{calls++;return probe(objectId);}
  }),/COMPOSITION_INGEST_CANCELLED/);
  assert.equal(calls,0);
});
