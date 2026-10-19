import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveSceneControl, SceneSession, SpatialWorkspace} from '../src/index.js';
import type {SceneActor} from '../src/index.js';
const scope={tenantId:'tenant',application:'scenesignal' as const,sessionId:'session'};
const organizer:SceneActor={tenantId:'tenant',sessionId:'session',identityId:'lead',roles:['organizer'],expiresAtMs:10000};
const operator:SceneActor={...organizer,identityId:'op',roles:['operator']};
const backup:SceneActor={...organizer,identityId:'backup',roles:['operator']};
function fixture(){
 const session=new SceneSession(scope,{siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),
 startsAtMs:1000,endsAtMs:10000,maximumLinearGain:0.6,publicSummary:'Event'},()=>{});
 const scene={id:'scene',revision:1,sampleRate:8000,frames:8000,
 sources:[{id:'stem',assetId:'cipher',position:{x:0,y:0,z:0},spreadMeters:2,gain:0.2,role:'full-range'}]};
 const workspace=new SpatialWorkspace(session,scene,()=>true);
 return {session,workspace,control:new LiveSceneControl(session,workspace),scene};
}
test('authorized handoff fences prior operator and preserves revision checks',()=>{
 const f=fixture();
 const first=f.control.grant(organizer,operator,1000);
 const edited=f.control.edit(operator,first.epoch,{...f.scene,revision:2},1100);
 assert.equal(edited.sceneRevision,2);
 const next=f.control.transfer(operator,first.epoch,backup,1200);
 assert.notEqual(next.epoch,first.epoch);
 assert.throws(()=>f.control.edit(operator,first.epoch,{...f.scene,revision:3},1300),/SCENE_CONTROL_LEASE_STALE/);
 assert.equal(f.control.edit(backup,next.epoch,{...f.scene,revision:3},1300).sceneRevision,3);
 assert.throws(()=>f.control.edit(backup,next.epoch,{...f.scene,revision:3},1400));
 assert.equal(f.workspace.snapshot().scene.revision,3);
});
test('cross-session recipients and observers cannot gain control',()=>{
 const f=fixture();
 const observer:SceneActor={...operator,identityId:'observer',roles:[]};
 assert.throws(()=>f.control.grant(operator,backup,1000));
 assert.throws(()=>f.control.grant(organizer,observer,1000));
 assert.throws(()=>f.control.grant(organizer,{...backup,tenantId:'other'},1000));
 const first=f.control.grant(organizer,operator,1000);
 assert.throws(()=>f.control.transfer(operator,first.epoch,{...backup,sessionId:'other'},1100));
 assert.equal(f.control.snapshot().holderId,operator.identityId);
});
test('relinquish clears ownership and invalidates the old epoch',()=>{
 const f=fixture();
 const first=f.control.grant(organizer,operator,1000);
 const relinquished=f.control.relinquish(operator,first.epoch,1200);
 assert.equal(relinquished.holderId,null);
 assert.throws(()=>f.control.edit(operator,first.epoch,{...f.scene,revision:2},1300));
 const replacement=f.control.grant(organizer,backup,1400);
 assert.ok(replacement.epoch>first.epoch);
});

test('stopped or cancelled sessions cannot accept subsequent live scene edits',()=>{
 const f=fixture();
 const lease=f.control.grant(organizer,operator,1000);
 f.session.stop(organizer,1100);
 assert.throws(()=>f.control.edit(operator,lease.epoch,{...f.scene,revision:2},1200),/SCENE_SESSION_NOT_EDITABLE/);
 assert.equal(f.workspace.snapshot().scene.revision,1);
});
