import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneSpeakerTransition } from '../src/index.js';
import type { MixPlan } from '@neophilism/distributed-audio-engine';

function plan(gains: Record<string,number>, ceiling: Record<string,number> = {}): MixPlan {
  const speakerIds = Object.keys(gains);
  return {
    sceneId:'scene',revision:1,sourceIds:['stem'],speakerIds,missingSourceIds:[],
    gains:Object.fromEntries(speakerIds.map(id=>[id,{stem:gains[id]!}])),
    ceilings:Object.fromEntries(speakerIds.map(id=>[id,ceiling[id] ?? 0.5]))
  };
}
const level=(p:MixPlan,id:string)=>p.gains[id]?.stem ?? -1;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`expected ${a} ≈ ${b}`);

test('first speaker joins silently and ramps to the authorized target',()=>{
  const t=new SceneSpeakerTransition(1000);t.setTarget(plan({a:0.2}),1000);
  near(level(t.at(1000).plan,'a'),0);
  near(level(t.at(1500).plan,'a'),0.1);
  near(level(t.at(2000).plan,'a'),0.2);
  assert.equal(t.at(2001).fieldValidated,false);
});
test('departed or revoked speakers are removed immediately; remaining output eases safely',()=>{
  const t=new SceneSpeakerTransition(1000);
  t.setTarget(plan({a:0.2,b:0.1}),1000);t.at(2000);
  t.setTarget(plan({b:0.3}),2000);
  const initial=t.at(2000).plan;
  assert.deepEqual(initial.speakerIds,['b']);
  assert.equal('a' in initial.gains,false);
  near(level(initial,'b'),0.1);
  near(level(t.at(2500).plan,'b'),0.2);
  near(level(t.at(3000).plan,'b'),0.3);
});
test('new speaker fades in without commanding old absent outputs',()=>{
  const t=new SceneSpeakerTransition(1000);
  t.setTarget(plan({a:0.3}),1000);t.at(2000);
  t.setTarget(plan({a:0.2,b:0.2}),2000);
  near(level(t.at(2000).plan,'b'),0);
  near(level(t.at(2500).plan,'b'),0.1);
  near(level(t.at(3000).plan,'b'),0.2);
});
test('new lower ceiling is enforced at every transition instant',()=>{
  const t=new SceneSpeakerTransition(1000);
  t.setTarget(plan({a:0.4}),1000);t.at(2000);
  t.setTarget(plan({a:0.1},{a:0.15}),2000);
  assert.ok(level(t.at(2000).plan,'a')<=0.15+1e-12);
  assert.ok(level(t.at(2300).plan,'a')<=0.15+1e-12);
  near(level(t.at(3000).plan,'a'),0.1);
});
test('replanning during an active fade begins from current safe gain',()=>{
  const t=new SceneSpeakerTransition(1000);
  t.setTarget(plan({a:0.4}),1000);
  near(level(t.at(1400).plan,'a'),0.16);
  t.setTarget(plan({a:0.2}),1400);
  near(level(t.at(1400).plan,'a'),0.16);
  near(level(t.at(1900).plan,'a'),0.18);
});
test('invalid plan, topology change and clock rollback fail closed',()=>{
  const t=new SceneSpeakerTransition(1000);
  assert.throws(()=>t.setTarget(plan({a:0.8},{a:0.2}),1000));
  t.setTarget(plan({a:0.2}),1000);
  assert.throws(()=>t.setTarget({...plan({a:0.2}),sourceIds:['different']},1100),/SCENE_SOURCE_TOPOLOGY_CHANGED/);
  assert.throws(()=>t.at(999));
  assert.throws(()=>t.setTarget(plan({a:0.2,b:0.9}),1200));
  t.clear();
  assert.throws(()=>t.at(1300),/NO_MIX_TARGET/);
});
