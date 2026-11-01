import {canonicalJson,finite,identifier,integer,invariant} from '@neophilism/distributed-audio-engine';
import type {Scope} from '@neophilism/distributed-audio-engine';
import {requireSceneRole} from './session.js';
import type {SceneActor} from './session.js';
export interface PilotSpeakerReservation {speakerId:string;outputId:string;consentReferenceId:string;consentExpiresAtMs:number}
export interface VerifiedPilotObservation {
 observationId:string;tenantId:string;sessionId:string;siteRevision:number;observedAtMs:number;
 outputs:Array<{outputId:string;clockDriftMs:number;dropouts:number}>;
}
export type PilotVerifier=(opaqueEvidence:string)=>Promise<VerifiedPilotObservation|null>;
/** No output device, real measurement, or production safety certification is provided. */
export class ControlledSpeakerPilot {
 private readonly scope:Scope;
 private readonly siteRevision:number;
 private devices:PilotSpeakerReservation[]=[];
 private readonly observations=new Map<string,VerifiedPilotObservation>();
 constructor(scope:Scope,siteRevision:number,private readonly maximumDriftMs:number,
   private readonly maximumDropouts:number,private readonly verify:PilotVerifier){
   invariant(scope.application==='scenesignal','INVALID_SCENE_APPLICATION');
   identifier(scope.tenantId);identifier(scope.sessionId);integer(siteRevision,1);
   finite(maximumDriftMs,0,1000);integer(maximumDropouts,0,1000000);
   this.scope=structuredClone(scope);this.siteRevision=siteRevision;
 }
 plan(actor:SceneActor,devices:PilotSpeakerReservation[],nowMs:number,endsAtMs:number){
   requireSceneRole(actor,this.scope,['organizer'],nowMs);integer(endsAtMs,nowMs+1);
   invariant(Array.isArray(devices)&&devices.length>=10&&devices.length<=20,
     'PILOT_REQUIRES_TEN_TO_TWENTY_SPEAKERS');
   invariant(this.observations.size===0,'PILOT_ALREADY_OBSERVED');
   const speakers=new Set<string>(),outputs=new Set<string>();
   for(const device of devices){
     invariant(Object.keys(device).sort().join(',')===
       'consentExpiresAtMs,consentReferenceId,outputId,speakerId','INVALID_PILOT_DEVICE');
     for(const id of [device.speakerId,device.outputId,device.consentReferenceId])identifier(id);
     integer(device.consentExpiresAtMs,endsAtMs+1);
     invariant(!speakers.has(device.speakerId)&&!outputs.has(device.outputId),
       'DUPLICATE_PILOT_OUTPUT');
     speakers.add(device.speakerId);outputs.add(device.outputId);
   }
   this.devices=structuredClone(devices);
 }
 async record(actor:SceneActor,evidence:string,nowMs:number){
   requireSceneRole(actor,this.scope,['organizer','operator'],nowMs);
   invariant(this.devices.length>=10,'PILOT_NOT_PLANNED');
   invariant(typeof evidence==='string'&&evidence.length>0&&evidence.length<=8192,
     'INVALID_PILOT_EVIDENCE');
   const fact=await this.verify(evidence);
   invariant(fact&&typeof fact==='object'&&!Array.isArray(fact)&&
     Object.keys(fact).sort().join(',')===
     'observationId,observedAtMs,outputs,sessionId,siteRevision,tenantId',
     'PILOT_EVIDENCE_UNVERIFIED');
   identifier(fact.observationId);integer(fact.siteRevision,1);integer(fact.observedAtMs);
   invariant(fact.tenantId===this.scope.tenantId&&fact.sessionId===this.scope.sessionId&&
     fact.siteRevision===this.siteRevision,'PILOT_SCOPE_DENIED');
   invariant(fact.observedAtMs<=nowMs&&nowMs-fact.observedAtMs<=300000,
     'PILOT_OBSERVATION_STALE');
   invariant(Array.isArray(fact.outputs)&&fact.outputs.length===this.devices.length,
     'PILOT_OUTPUT_COVERAGE');
   const expected=new Set(this.devices.map(d=>d.outputId)),seen=new Set<string>();
   for(const metric of fact.outputs){
     invariant(metric&&Object.keys(metric).sort().join(',')===
       'clockDriftMs,dropouts,outputId','INVALID_PILOT_METRIC');
     identifier(metric.outputId);
     invariant(expected.has(metric.outputId)&&!seen.has(metric.outputId),'PILOT_OUTPUT_COVERAGE');
     seen.add(metric.outputId);finite(metric.clockDriftMs,0,1000);
     integer(metric.dropouts,0,1000000);
   }
   const prior=this.observations.get(fact.observationId);
   if(prior){
     invariant(canonicalJson(prior)===canonicalJson(fact),'PILOT_REPLAY_CONFLICT');
     return {duplicate:true,fieldValidated:false as const};
   }
   invariant(this.observations.size<64,'PILOT_RECORD_LIMIT');
   this.observations.set(fact.observationId,structuredClone(fact));
   return {duplicate:false,fieldValidated:false as const};
 }
 privateSummary(actor:SceneActor,nowMs:number){
   requireSceneRole(actor,this.scope,['organizer','operator'],nowMs);
   return {plannedOutputs:this.devices.length,siteRevision:this.siteRevision,
     observations:[...this.observations.values()].map(o=>({
       observationId:o.observationId,observedAtMs:o.observedAtMs,
       withinDeclaredEnvelope:o.outputs.every(d=>d.clockDriftMs<=this.maximumDriftMs&&
         d.dropouts<=this.maximumDropouts)})),
     fieldValidated:false as const};
 }
}
