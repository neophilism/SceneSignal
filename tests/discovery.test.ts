import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneDiscovery, SceneSession, SceneLineup } from '../src/index.js';
import type { SceneActor, SitePlan } from '../src/index.js';
import { createControlSigningKey, signControl, ControlVerifier, MemoryCheckpointStore } from '@neophilism/distributed-audio-engine';
import type { ControlBody } from '@neophilism/distributed-audio-engine';
const scope={tenantId:'label',application:'scenesignal' as const,sessionId:'event'};
const plan:SitePlan={siteId:'PRIVATE_SITE',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:10000,endsAtMs:20000,maximumLinearGain:0.4,publicSummary:'Free string quartet'};
const organizer:SceneActor={tenantId:'label',sessionId:'event',identityId:'organizer',roles:['organizer'],expiresAtMs:30000};
async function prepared() {
  const session=new SceneSession(scope,plan,()=>{});const lineup=new SceneLineup(session);
  const keys=await createControlSigningKey();
  const verifier=new ControlVerifier(scope,new Map([['key',keys.publicKey]]),new Set(['session-authorize']),new MemoryCheckpointStore());
  const body:ControlBody={version:'1.0.0',scope,keyId:'key',algorithm:'ALG-ED25519',epoch:1,sequence:1,issuedAtMs:100,expiresAtMs:21000,action:'session-authorize',payloadCiphertextBase64:'YWJjZA=='};
  const signed=await signControl(body,keys.privateKey);
  const authorization={kind:'organizer-attested',siteId:plan.siteId,siteRevision:1,conditionsDigestHex:plan.conditionsDigestHex,validFromMs:100,validUntilMs:21000,authorizerId:'organizer',encryptedEvidenceObjectId:'PRIVATE_OBJECT',evidenceDigestHex:'b'.repeat(64),maximumLinearGain:0.2};
  return {session,lineup,authorize:()=>session.authorize(organizer,signed,verifier,async()=>authorization,500)};
}
test('discovery requires a current authorized session and organizer role',async()=>{
  const f=await prepared();const discovery=new SceneDiscovery();const options={eventArea:'North park',accessibilitySummary:'Quiet route available'};
  assert.throws(()=>discovery.publish(organizer,f.session,f.lineup,options,500));
  await f.authorize();
  assert.throws(()=>discovery.publish({...organizer,roles:['performer']},f.session,f.lineup,options,501));
  discovery.publish(organizer,f.session,f.lineup,options,501);
  assert.equal(discovery.discover(600,'string').length,1);
  assert.equal(discovery.discover(600,'other').length,0);
});
test('public pages omit private site, authorization, permit, and conditions',async()=>{
  const f=await prepared();await f.authorize();const discovery=new SceneDiscovery();
  discovery.publish(organizer,f.session,f.lineup,{eventArea:'Neighborhood',accessibilitySummary:null},501);
  const page=discovery.detail('event',501);
  assert.equal(page?.freeAdmission,true);
  const serialized=JSON.stringify(page);
  for(const privateValue of ['PRIVATE_SITE','PRIVATE_OBJECT','conditionsDigestHex','maximumLinearGain','authorization'])assert.equal(serialized.includes(privateValue),false);
  assert.equal(page?.listingRevision,1);
});
test('site revision and cancellation automatically remove public discovery',async()=>{
  const f=await prepared();await f.authorize();const discovery=new SceneDiscovery();
  discovery.publish(organizer,f.session,f.lineup,{eventArea:null,accessibilitySummary:null},501);
  assert.equal(discovery.discover(502).length,1);
  f.session.revise(organizer,{...plan,revision:2,conditionsDigestHex:'c'.repeat(64)},600);
  assert.equal(discovery.detail('event',601),null);
});
test('unpublish is role-protected and copied projections cannot mutate registry',async()=>{
  const f=await prepared();await f.authorize();const discovery=new SceneDiscovery();
  discovery.publish(organizer,f.session,f.lineup,{eventArea:'District',accessibilitySummary:null},501);
  const page=discovery.detail('event',502)!;page.summary='tampered';
  assert.equal(discovery.detail('event',503)?.summary,'Free string quartet');
  assert.throws(()=>discovery.unpublish({...organizer,roles:['performer']},f.session,503));
  discovery.unpublish(organizer,f.session,503);assert.equal(discovery.detail('event',504),null);
});
