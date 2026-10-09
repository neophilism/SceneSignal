import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneSession, privateConditionsDigest } from '../src/index.js';
import { createControlSigningKey, signControl, ControlVerifier, MemoryCheckpointStore } from '@neophilism/distributed-audio-engine';
import type { ControlBody } from '@neophilism/distributed-audio-engine';
import type { SceneActor, SessionAuthorization, SitePlan } from '../src/index.js';
const scope = { tenantId:'label',application:'scenesignal' as const,sessionId:'session' };
const plan: SitePlan = { siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:2000,endsAtMs:10000,maximumLinearGain:0.6,publicSummary:'Free community spatial concert' };
const actor: SceneActor = { tenantId:'label',sessionId:'session',identityId:'organizer',roles:['organizer'],expiresAtMs:20000 };
async function fixture(changes: Partial<SessionAuthorization> = {}) {
  const stops: string[] = []; const session = new SceneSession(scope,plan,r=>stops.push(r)); const keys=await createControlSigningKey();
  const verifier=new ControlVerifier(scope,new Map([['key',keys.publicKey]]),new Set(['session-authorize']),new MemoryCheckpointStore());
  const body: ControlBody={version:'1.0.0',scope,keyId:'key',algorithm:'ALG-ED25519',epoch:1,sequence:1,issuedAtMs:1000,expiresAtMs:12000,action:'session-authorize',payloadCiphertextBase64:'YWJjZA=='};
  const authorization: SessionAuthorization={kind:'organizer-attested',siteId:'site',siteRevision:1,conditionsDigestHex:plan.conditionsDigestHex,validFromMs:1000,validUntilMs:11000,authorizerId:'organizer',encryptedEvidenceObjectId:'encrypted-permit',evidenceDigestHex:'b'.repeat(64),maximumLinearGain:0.5,...changes};
  return{session,keys,verifier,body,authorization,stops,signed:await signControl(body,keys.privateKey)};
}
test('activation requires signed site-specific authorization and current session time',async()=>{
  const f=await fixture();assert.throws(()=>f.session.activate(actor,1000));await f.session.authorize(actor,f.signed,f.verifier,async()=>f.authorization,1000);
  assert.throws(()=>f.session.activate(actor,1500));f.session.activate(actor,2000);assert.deepEqual(f.session.operatingLimits(2000),{maximumLinearGain:0.5,stopAtMs:10000});
  assert.equal(f.session.tick(10000).state,'stopped');assert.deepEqual(f.stops,['AUTHORIZATION_EXPIRED']);
});
test('cross-site, changed conditions, short permits and excessive gain never activate',async()=>{
  for(const changes of [{siteId:'elsewhere'},{conditionsDigestHex:'c'.repeat(64)},{validUntilMs:9000},{maximumLinearGain:0.9}]){const f=await fixture(changes);await assert.rejects(f.session.authorize(actor,f.signed,f.verifier,async()=>f.authorization,1000));assert.equal(f.session.snapshot().state,'planning');}
});
test('forged signatures, cross-tenant roles, expired users and raw document fields fail closed',async()=>{
  const f=await fixture();const wrong=await createControlSigningKey();await assert.rejects(f.session.authorize(actor,await signControl(f.body,wrong.privateKey),f.verifier,async()=>f.authorization,1000));
  await assert.rejects(f.session.authorize({...actor,tenantId:'other'},f.signed,f.verifier,async()=>f.authorization,1000));
  await assert.rejects(f.session.authorize({...actor,expiresAtMs:1000},f.signed,f.verifier,async()=>f.authorization,1000));
  await assert.rejects(f.session.authorize(actor,f.signed,f.verifier,async()=>({...f.authorization,rawPermit:'private'}),1000));
});
test('site changes, cancellation and emergency roles stop output and invalidate authority',async()=>{
  const f=await fixture();await f.session.authorize(actor,f.signed,f.verifier,async()=>f.authorization,1000);f.session.activate(actor,2000);
  f.session.revise(actor,{...plan,revision:2,conditionsDigestHex:'d'.repeat(64)},3000);assert.equal(f.session.snapshot().authorization,null);assert.equal(f.session.snapshot().state,'planning');assert.deepEqual(f.stops,['SITE_CHANGED']);
  assert.throws(()=>f.session.revise({...actor,roles:['performer']},{...plan,revision:3},3000));
  f.session.stop({...actor,roles:['steward']},3001);f.session.cancel(actor,3002);assert.equal(f.session.snapshot().state,'cancelled');
});
test('slow authorization decoding cannot restore cancelled or revised sessions',async()=>{
  const f=await fixture();let release!:(v:SessionAuthorization)=>void;let entered!:()=>void;const ready=new Promise<void>(r=>{entered=r;});
  const pending=f.session.authorize(actor,f.signed,f.verifier,async()=>{entered();return new Promise<SessionAuthorization>(r=>{release=r;});},1000);await ready;f.session.cancel(actor,1100);release(f.authorization);await assert.rejects(pending);assert.equal(f.session.snapshot().state,'cancelled');
});
test('public discovery omits private condition hashes, encrypted permit references and precise site details',async()=>{
  const f=await fixture();const listing=f.session.publicListing(1000);assert.equal(listing.freeAdmission,true);assert.equal('authorization' in listing,false);assert.equal('conditionsDigestHex' in listing,false);assert.equal('siteId' in listing,false);
  assert.equal(await privateConditionsDigest({b:2,a:1}),await privateConditionsDigest({a:1,b:2}));
});
