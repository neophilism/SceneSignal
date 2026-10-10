import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneSponsorship, SceneSession } from '../src/index.js';
import type { SceneActor, SitePlan } from '../src/index.js';
const scope={tenantId:'label',application:'scenesignal' as const,sessionId:'show'};
const plan:SitePlan={siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:10000,endsAtMs:20000,maximumLinearGain:0.4,publicSummary:'Concert'};
const organizer:SceneActor={tenantId:'label',sessionId:'show',identityId:'owner',roles:['organizer'],expiresAtMs:30000};
const terms={id:'sponsor',sponsorId:'brand',publicName:'A sponsor',placement:'event-page' as const,committedCents:15000,disclosure:'Paid placement',privateAgreementReference:'private-deal'};
const make=()=>{const session=new SceneSession(scope,plan,()=>{});return{session,sponsorship:new SceneSponsorship(session)};};
test('organizer can propose, accept and cancel, but untrusted performers cannot',()=>{
  const {sponsorship}=make();assert.throws(()=>sponsorship.propose({...organizer,roles:['performer']},terms,1000));
  sponsorship.propose(organizer,terms,1000);assert.deepEqual(sponsorship.publicCredits(1000),[]);
  assert.throws(()=>sponsorship.accept({...organizer,roles:['performer']},'sponsor',1001));
  sponsorship.accept(organizer,'sponsor',1001);
  assert.deepEqual(sponsorship.publicCredits(1002),[{publicName:'A sponsor',placement:'event-page',disclosure:'Paid placement'}]);
  assert.equal(JSON.stringify(sponsorship.publicCredits(1002)).includes('private-deal'),false);
  assert.equal(sponsorship.privateRecords(organizer,1002)[0]?.details.committedCents,15000);
  sponsorship.cancel(organizer,'sponsor',1003);assert.equal(sponsorship.publicCredits(1004).length,0);
});
test('site revisions invalidate publication and invalid money is rejected',()=>{
  const {session,sponsorship}=make();
  assert.throws(()=>sponsorship.propose(organizer,{...terms,committedCents:-1},1000));
  sponsorship.propose(organizer,terms,1000);sponsorship.accept(organizer,'sponsor',1001);
  session.revise(organizer,{...plan,revision:2,conditionsDigestHex:'b'.repeat(64)},1002);
  assert.equal(sponsorship.publicCredits(1003).length,0);
  assert.throws(()=>sponsorship.accept(organizer,'sponsor',1004));
});
