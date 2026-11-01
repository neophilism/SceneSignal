import {canonicalJson,finite,identifier,integer,invariant} from '@neophilism/distributed-audio-engine';
import type {Scope} from '@neophilism/distributed-audio-engine';
import {requireSceneRole} from './session.js';
import type {SceneActor} from './session.js';

export interface VerifiedLiveMonitorReport {
  proofId:string;
  tenantId:string;sessionId:string;
  inputDeviceId:string;monitorRouteId:string;
  measuredAtMs:number;expiresAtMs:number;
  roundTripLatencyMs:number;jitterMs:number;sampleCount:number;
  monitorChannelVerified:boolean;performerConsentVerified:boolean;
}
export type LiveMonitorVerifier=
  (opaqueEvidence:string)=>Promise<VerifiedLiveMonitorReport|null>;

/** Optional live input PRECONDITION only: it does not capture, route,
 * declassify protected media, or authorize native output. */
export class LiveInputCandidateGate {
  private readonly scope:Scope;
  private accepted:VerifiedLiveMonitorReport|null=null;
  constructor(scope:Scope,private readonly verify:LiveMonitorVerifier,
    private readonly maxRoundTripMs:number,private readonly maxJitterMs:number,
    private readonly minSamples:number){
    invariant(scope.application==='scenesignal','INVALID_SCENE_APPLICATION');
    identifier(scope.tenantId);identifier(scope.sessionId);
    finite(maxRoundTripMs,1,500);
    finite(maxJitterMs,0,100);
    integer(minSamples,1,10000);
    this.scope=structuredClone(scope);
  }
  async admit(actor:SceneActor,opaqueEvidence:string,nowMs:number){
    requireSceneRole(actor,this.scope,['organizer','operator'],nowMs);
    invariant(typeof opaqueEvidence==='string'&&opaqueEvidence.length>0&&
      opaqueEvidence.length<=8192,'INVALID_LIVE_INPUT_EVIDENCE');
    const claim=await this.verify(opaqueEvidence);
    invariant(claim&&typeof claim==='object'&&!Array.isArray(claim)&&
      Object.keys(claim).sort().join(',')===
      'expiresAtMs,inputDeviceId,jitterMs,measuredAtMs,monitorChannelVerified,monitorRouteId,performerConsentVerified,proofId,roundTripLatencyMs,sampleCount,sessionId,tenantId',
      'LIVE_INPUT_EVIDENCE_UNVERIFIED');
    for(const id of [claim.proofId,claim.inputDeviceId,claim.monitorRouteId])identifier(id);
    integer(claim.measuredAtMs);integer(claim.expiresAtMs,claim.measuredAtMs+1);
    integer(claim.sampleCount,this.minSamples,10000);
    finite(claim.roundTripLatencyMs,0,this.maxRoundTripMs);
    finite(claim.jitterMs,0,this.maxJitterMs);
    invariant(claim.tenantId===this.scope.tenantId&&claim.sessionId===this.scope.sessionId,
      'LIVE_INPUT_SCOPE_DENIED');
    invariant(claim.measuredAtMs<=nowMs&&nowMs-claim.measuredAtMs<=300000&&
      nowMs<claim.expiresAtMs&&claim.expiresAtMs<=claim.measuredAtMs+600000,
      'LIVE_INPUT_EVIDENCE_STALE');
    invariant(claim.monitorChannelVerified===true&&claim.performerConsentVerified===true,
      'LIVE_INPUT_MONITOR_OR_CONSENT_DENIED');
    if(this.accepted?.proofId===claim.proofId){
      invariant(canonicalJson(this.accepted)===canonicalJson(claim),
        'LIVE_INPUT_PROOF_REPLAY_CONFLICT');
      return {duplicate:true,fieldValidated:false as const};
    }
    invariant(!this.accepted||claim.measuredAtMs>this.accepted.measuredAtMs,
      'LIVE_INPUT_PROOF_NOT_NEWER');
    this.accepted=structuredClone(claim);
    return {duplicate:false,fieldValidated:false as const};
  }
  /** An evidence candidate is not a signed audio output lease. */
  candidate(actor:SceneActor,nowMs:number){
    requireSceneRole(actor,this.scope,['organizer','operator'],nowMs);
    const report=this.accepted;
    if(!report||nowMs<report.measuredAtMs||nowMs>=report.expiresAtMs||
      nowMs-report.measuredAtMs>300000)return null;
    return {inputDeviceId:report.inputDeviceId,monitorRouteId:report.monitorRouteId,
      evidenceExpiresAtMs:report.expiresAtMs,fieldValidated:false as const};
  }
  clear(actor:SceneActor,nowMs:number):void{
    requireSceneRole(actor,this.scope,['organizer','operator'],nowMs);
    this.accepted=null;
  }
}
