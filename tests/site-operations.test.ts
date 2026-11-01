import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SceneSession,SceneSiteOperations} from '../src/index.js';
import type {SceneActor,SitePlan} from '../src/index.js';
const scope={tenantId:'community',application:'scenesignal' as const,sessionId:'event'};
const plan:SitePlan={siteId:'private-site',revision:1,conditionsDigestHex:'a'.repeat(64),
  startsAtMs:5000,endsAtMs:20000,maximumLinearGain:0.3,publicSummary:'Free event'};
const host:SceneActor={tenantId:'community',sessionId:'event',identityId:'host',
  roles:['organizer'],expiresAtMs:30000};
const steward:SceneActor={...host,identityId:'steward',roles:['steward']};
const unauthorized:SceneActor={...host,identityId:'visitor',roles:['performer']};
const event={incidentId:'weather-1',kind:'WEATHER' as const,severity:'STOP' as const,observedAtMs:1000};
function fixture(){let stopped=0;
 const session=new SceneSession(scope,plan,()=>{stopped++;});
 return {session,operations:new SceneSiteOperations(session),stopped:()=>stopped};
}
test('owner sets opaque private contacts; public roles cannot inspect or configure',()=>{
 const f=fixture(),contacts=[{role:'SITE_LEAD' as const,secureReferenceId:'secure-ref'}];
 f.operations.configureContacts(host,contacts,1000);
 contacts[0]!.secureReferenceId='modified';
 assert.deepEqual(f.operations.snapshot(steward,1000).contacts,
  [{role:'SITE_LEAD',secureReferenceId:'secure-ref'}]);
 assert.throws(()=>f.operations.configureContacts(steward,contacts,1000),/SCENE_ACCESS_DENIED/);
 assert.throws(()=>f.operations.snapshot(unauthorized,1000),/SCENE_ACCESS_DENIED/);
 assert.throws(()=>f.operations.configureContacts(host,[contacts[0]!,contacts[0]!],1000),
  /DUPLICATE_SITE_CONTACT_ROLE/);
});
test('severe authorized hazard stops output once and prevents unsafe restart',()=>{
 const f=fixture();
 assert.deepEqual(f.operations.recordIncident(steward,event,1100),
  {duplicate:false,sessionStopped:true,fieldValidated:false});
 assert.equal(f.stopped(),1);
 assert.equal(f.session.snapshot().state,'stopped');
 assert.deepEqual(f.operations.recordIncident(steward,event,1101),
  {duplicate:true,sessionStopped:true,fieldValidated:false});
 assert.equal(f.stopped(),1);
 assert.throws(()=>f.operations.recordIncident(host,{...event,incidentId:'another'},1102),
  /SITE_OPERATIONS_NOT_CURRENT/);
 assert.throws(()=>f.operations.recordIncident(steward,{...event,severity:'ADVISORY'},1103),
  /SITE_INCIDENT_REPLAY_CONFLICT/);
});
test('fake operator, stale events, foreign roles and malformed classifications deny',()=>{
 const f=fixture();
 assert.throws(()=>f.operations.recordIncident(unauthorized,event,1100),/SCENE_ACCESS_DENIED/);
 assert.throws(()=>f.operations.recordIncident({...host,tenantId:'other'},event,1100),
  /SCENE_ACCESS_DENIED/);
 assert.throws(()=>f.operations.recordIncident({...host,expiresAtMs:700000},{...event,observedAtMs:0},650000),
  /STALE_SITE_INCIDENT/);
 assert.throws(()=>f.operations.recordIncident(host,{...event,kind:'UNKNOWN' as 'WEATHER'},1100),
  /INVALID_SITE_INCIDENT_CLASSIFICATION/);
 assert.equal(f.stopped(),0);
});
test('advisory does not assert live weather or stop output; a site revision supersedes operations',()=>{
 const f=fixture();
 f.operations.recordIncident(host,{...event,severity:'ADVISORY'},1100);
 assert.equal(f.session.snapshot().state,'planning');
 assert.equal(f.operations.snapshot(host,1101).fieldValidated,false);
 f.session.revise(host,{...plan,revision:2,conditionsDigestHex:'b'.repeat(64)},1200);
 assert.throws(()=>f.operations.configureContacts(host,[],1201),/SITE_OPERATIONS_NOT_CURRENT/);
 assert.throws(()=>f.operations.recordIncident(steward,{...event,incidentId:'another'},1201),
  /SITE_OPERATIONS_NOT_CURRENT/);
});
