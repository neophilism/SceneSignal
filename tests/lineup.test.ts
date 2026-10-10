import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneSession, SceneLineup } from '../src/index.js';
import type { SceneActor, SitePlan } from '../src/index.js';
const scope={tenantId:'label',application:'scenesignal' as const,sessionId:'festival'};
const plan:SitePlan={siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:10000,endsAtMs:30000,maximumLinearGain:0.3,publicSummary:'Free concert'};
const actor=(id:string,roles:SceneActor['roles']):SceneActor=>({tenantId:'label',sessionId:'festival',identityId:id,roles,expiresAtMs:40000});
const organizer=actor('organizer',['organizer']), performer=actor('artist',['performer']);
const make=()=>{const session=new SceneSession(scope,plan,()=>{});return {session,lineup:new SceneLineup(session)};};
const call={id:'call',title:'Open artist call',publicDescription:'Free performances',opensAtMs:1000,closesAtMs:8000,maxApplications:2};
const application={id:'application',callId:'call',performerId:'artist',stageName:'Public Alias',privatePitch:'PRIVATE-PITCH',requestedMinutes:10};
const terms={id:'offer',performerId:'artist',stageName:'Public Alias',beginsAtMs:11000,endsAtMs:12000,guaranteedFeeCents:15000,artistShareBps:7000,rightsReferenceId:'private-rights'};
test('artist calls are scoped and only open within their window',()=>{
  const {lineup}=make();assert.throws(()=>lineup.publishCall(performer,call,1500));
  lineup.publishCall(organizer,call,1500);assert.equal(lineup.publicCalls(500).length,0);
  assert.equal(lineup.publicCalls(1500).length,1);assert.equal(lineup.publicCalls(8000).length,0);
});
test('private pitches are visible only to organizers and the submitting performer',()=>{
  const {lineup}=make();lineup.publishCall(organizer,call,1500);
  assert.throws(()=>lineup.apply(actor('imposter',['performer']),application,2000));
  lineup.apply(performer,application,2000);
  assert.throws(()=>lineup.apply(performer,{...application,id:'again'},2100));
  assert.equal(lineup.privateApplications(performer,2200)[0]?.privatePitch,'PRIVATE-PITCH');
  assert.equal(lineup.privateApplications(actor('visitor',['performer']),2200).length,0);
  assert.equal(JSON.stringify(lineup.publicCalls(2200)).includes('PRIVATE-PITCH'),false);
});
test('artist acceptance and explicit public consent exclude private financial and rights terms',()=>{
  const {lineup}=make();lineup.offer(organizer,terms,2000);
  assert.throws(()=>lineup.respond(actor('other',['performer']),'offer','accept',true,3000));
  assert.equal(lineup.publicLineup(3000).length,0);
  lineup.respond(performer,'offer','accept',true,3000);
  assert.deepEqual(lineup.publicLineup(3000),[{stageName:'Public Alias',beginsAtMs:11000,endsAtMs:12000}]);
  assert.equal(JSON.stringify(lineup.publicLineup(3000)).includes('15000'),false);
  assert.equal(JSON.stringify(lineup.publicLineup(3000)).includes('private-rights'),false);
  assert.equal(lineup.privateOffers(organizer,3000)[0]?.terms.guaranteedFeeCents,15000);
  lineup.cancel(performer,'offer',4000);assert.equal(lineup.publicLineup(4000).length,0);
});
test('site revision invalidates existing calls and public lineup without leaking old conditions',()=>{
  const {lineup,session}=make();lineup.publishCall(organizer,call,1500);lineup.offer(organizer,terms,2000);
  lineup.respond(performer,'offer','accept',true,3000);
  session.revise(organizer,{...plan,revision:2,conditionsDigestHex:'b'.repeat(64)},4000);
  assert.equal(lineup.publicLineup(4001).length,0);assert.equal(lineup.publicCalls(4001).length,0);
  assert.throws(()=>lineup.apply(performer,application,4001));
});
test('reject overlapping accepted slots and invalid financial terms',()=>{
  const {lineup}=make();lineup.offer(organizer,terms,2000);
  assert.throws(()=>lineup.offer(organizer,{...terms,id:'bad',artistShareBps:10001},2000));
  lineup.offer(organizer,{...terms,id:'overlap',beginsAtMs:11500,endsAtMs:12500},2000);
  lineup.respond(performer,'offer','accept',false,3000);
  assert.throws(()=>lineup.respond(performer,'overlap','accept',false,3000));
  assert.equal(lineup.publicLineup(3000).length,0);
});
