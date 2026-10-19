import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneSession, SpatialWorkspace, SpatialAutomation } from '../src/index.js';
import type { ContributorSpeaker, SceneActor } from '../src/index.js';
const scope={tenantId:'t',application:'scenesignal' as const,sessionId:'s'};
const organizer:SceneActor={tenantId:'t',sessionId:'s',identityId:'organizer',roles:['organizer'],expiresAtMs:100000};
const fan:SceneActor={...organizer,identityId:'fan',roles:[]};
function fixture(){const session=new SceneSession(scope,{siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:1000,endsAtMs:10000,maximumLinearGain:0.6,publicSummary:'Free concert'},()=>{});const scene={id:'scene',revision:1,sampleRate:8000,frames:8000,sources:[{id:'violin',assetId:'stem',position:{x:0,y:0,z:0},spreadMeters:3,gain:0.5,role:'full-range'}]};return{session,workspace:new SpatialWorkspace(session,scene,()=>true),scene};}
const speaker:ContributorSpeaker={id:'speaker',ownerId:'fan',outputId:'physical-output',consentUntilMs:9000,maximumLinearGain:0.3,roleWeights:{'full-range':1},placement:'fixed',position:{x:2,y:0,z:0},trackerId:null};
test('fixed speaker stays independent of phone movement, expires with consent and obeys contributor ceiling',()=>{const f=fixture();f.workspace.joinSpeaker(fan,speaker,1000);assert.throws(()=>f.workspace.observeSpeaker(fan,{objectId:'speaker',trackerId:'phone',sequence:1,position:{x:100,y:0,z:0},atMs:1001,uncertaintyMeters:0,confidence:1,method:'validated-coordinate'},1001));assert.deepEqual(f.workspace.snapshot().speakers[0]!.position,speaker.position);const mixed=f.workspace.audition({violin:new Float32Array([1,1])},1001);assert.equal(mixed.simulation,true);assert.ok(mixed.samples.speaker![0]!<=Math.fround(0.3));assert.equal(f.workspace.mixPlan(1001,'audition').plan.ceilings.speaker,0.3);assert.equal(f.workspace.mixPlan(9000,'audition').plan.speakerIds.length,0);assert.throws(()=>f.workspace.mixPlan(2000,'authorized-session'));});
test('physical-output duplicates, foreign consent, unauthenticated tracking and source-rights failures reject',()=>{const f=fixture();f.workspace.joinSpeaker(fan,speaker,1000);assert.throws(()=>f.workspace.joinSpeaker({...fan,identityId:'other'},{...speaker,id:'other'},1000));assert.throws(()=>f.workspace.joinSpeaker(fan,{...speaker,id:'clone'},1000));assert.throws(()=>f.workspace.setFixedPosition(fan,'speaker',{x:0,y:0,z:0},1000));const denied=new SpatialWorkspace(f.session,f.scene,()=>false);assert.throws(()=>denied.mixPlan(2000,'audition'));});
test('Spime controls its instrument, never a speaker; stale position mutes the anchored source until manual fallback',()=>{const f=fixture();f.workspace.joinSpeaker(fan,speaker,1000);f.workspace.bindSpime(organizer,{id:'statue',sourceId:'violin',controllerId:'organizer',trackingObjectId:'physical-statue',trackerId:'validated-tracker',calibrationId:'cal',calibrationUntilMs:9000,method:'validated-coordinate'},1000);const observation={objectId:'physical-statue',trackerId:'validated-tracker',sequence:1,position:{x:5,y:0,z:0},atMs:1000,uncertaintyMeters:0.2,confidence:0.95,method:'validated-coordinate' as const};f.workspace.observeSpime(organizer,'statue',observation,1000);assert.equal(f.workspace.snapshot().scene.sources[0]!.position.x,5);assert.deepEqual(f.workspace.snapshot().speakers[0]!.position,speaker.position);assert.throws(()=>f.workspace.observeSpime(organizer,'statue',{...observation,sequence:2,method:'presence-only'},1001));const stale=f.workspace.mixPlan(4001,'audition');assert.deepEqual(stale.unavailableSpimeIds,['statue']);assert.equal(stale.plan.gains.speaker!.violin,0);f.workspace.removeSpime(organizer,'statue',4001);assert.ok(f.workspace.mixPlan(4001,'audition').plan.gains.speaker!.violin!>0);});
test('tracked speaker needs validated coordinates and loses mix participation when its observations become stale',()=>{const f=fixture();f.workspace.joinSpeaker(fan,{...speaker,placement:'tracked',trackerId:'tracker'},1000);assert.equal(f.workspace.mixPlan(1000,'audition').plan.speakerIds.length,0);f.workspace.observeSpeaker(fan,{objectId:'speaker',trackerId:'tracker',sequence:1,position:{x:1,y:0,z:0},atMs:1000,uncertaintyMeters:0.1,confidence:1,method:'validated-coordinate'},1000);assert.equal(f.workspace.mixPlan(1001,'audition').plan.speakerIds.length,1);assert.equal(f.workspace.mixPlan(4001,'audition').plan.speakerIds.length,0);});

test('authorized spatial automation uses workspace revision and rights boundaries',()=>{
 const f=fixture();
 let allowed=true;
 const timeline=new SpatialAutomation(scope,()=>allowed);
 timeline.schedule(organizer,[{atMs:1000,scene:f.scene},{atMs:2000,scene:{...f.scene,sources:[{...f.scene.sources[0]!,position:{x:10,y:0,z:0}}]}}],900);
 assert.equal(f.workspace.applyAutomation(organizer,timeline,999),false);
 assert.throws(()=>f.workspace.applyAutomation(fan,timeline,1500));
 assert.equal(f.workspace.applyAutomation(organizer,timeline,1500),true);
 const first=f.workspace.snapshot().scene;
 assert.equal(first.revision,2);
 assert.equal(first.sources[0]!.position.x,5);
 allowed=false;
 assert.throws(()=>f.workspace.applyAutomation(organizer,timeline,1600));
 assert.equal(f.workspace.snapshot().scene.revision,2);
});

test('an external automation cannot substitute the workspace source',()=>{
 const f=fixture();
 const foreign={...f.scene,sources:[{...f.scene.sources[0]!,assetId:'other-stem'}]};
 const timeline=new SpatialAutomation(scope,()=>true);
 timeline.schedule(organizer,[{atMs:1000,scene:foreign},{atMs:2000,scene:foreign}],900);
 assert.throws(()=>f.workspace.applyAutomation(organizer,timeline,1500),/AUTOMATION_SOURCE_CONFLICT/);
 assert.equal(f.workspace.snapshot().scene.sources[0]!.assetId,'stem');
 assert.equal(f.workspace.snapshot().scene.revision,1);
});

test('replaying or rewinding a committed spatial automation tick fails closed',()=>{
 const f=fixture();
 const timeline=new SpatialAutomation(scope,()=>true);
 timeline.schedule(organizer,[{atMs:1000,scene:f.scene},{atMs:2000,scene:f.scene}],900);
 assert.equal(f.workspace.applyAutomation(organizer,timeline,1500),true);
 assert.throws(()=>f.workspace.applyAutomation(organizer,timeline,1500));
 assert.throws(()=>f.workspace.applyAutomation(organizer,timeline,1400));
 assert.equal(f.workspace.snapshot().scene.revision,2);
 assert.equal(f.workspace.applyAutomation(organizer,timeline,1600),true);
 assert.equal(f.workspace.snapshot().scene.revision,3);
});

test('another session cannot inject an otherwise aligned private automation',()=>{
 const f=fixture();
 const wrong={...scope,sessionId:'another-session'};
 const timeline=new SpatialAutomation(wrong,()=>true);
 const foreignActor={...organizer,sessionId:'another-session'};
 timeline.schedule(foreignActor,[{atMs:1000,scene:f.scene},{atMs:2000,scene:f.scene}],900);
 assert.throws(()=>f.workspace.applyAutomation(organizer,timeline,1500),/AUTOMATION_SCOPE_CONFLICT/);
 assert.equal(f.workspace.snapshot().scene.revision,1);
});

test('manual scene revision supersedes older spatial automation',()=>{
 const f=fixture();
 const timeline=new SpatialAutomation(scope,()=>true);
 timeline.schedule(organizer,[{atMs:1000,scene:f.scene},{atMs:2000,scene:f.scene}],900);
 assert.equal(f.workspace.applyAutomation(organizer,timeline,1500),true);
 const manuallyUpdated=f.workspace.snapshot().scene;
 f.workspace.compose(organizer,{...manuallyUpdated,revision:manuallyUpdated.revision+1},1550);
 assert.throws(()=>f.workspace.applyAutomation(organizer,timeline,1600),/AUTOMATION_SUPERSEDED_BY_MANUAL_EDIT/);
 assert.equal(f.workspace.snapshot().scene.revision,3);
});
