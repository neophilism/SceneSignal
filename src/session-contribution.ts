import {identifier, integer, invariant} from '@neophilism/distributed-audio-engine';
import type {Scope} from '@neophilism/distributed-audio-engine';

/** Claim created only by an authenticated core contribution verifier. */
export interface VerifiedSessionContribution {
  eventId: string;
  tenantId: string;
  sessionId: string;
  speakerId: string;
  contributorId: string;
  seconds: number;
  verifiedAtMs: number;
}
export type ContributionVerifier =
  (opaqueReceipt: string) => Promise<VerifiedSessionContribution | null>;

/** Endpoint-only contribution facts; not an asset, payout or token economy. */
export class SessionContributionLedger {
  private readonly scope: Scope;
  private readonly records = new Map<string, VerifiedSessionContribution>();
  private readonly seconds = new Map<string, number>();
  constructor(scope: Scope, private readonly verify: ContributionVerifier,
    private readonly perContributorCapSeconds = 3600) {
    invariant(scope.application === 'scenesignal', 'INVALID_SCENE_APPLICATION');
    identifier(scope.tenantId);identifier(scope.sessionId);
    integer(perContributorCapSeconds,1,86400);
    this.scope=structuredClone(scope);
  }
  async admit(opaqueReceipt: string, nowMs: number) {
    invariant(typeof opaqueReceipt === 'string' && opaqueReceipt.length>0 &&
      opaqueReceipt.length<=8192,'INVALID_CONTRIBUTION_RECEIPT');
    integer(nowMs);
    const claim=await this.verify(opaqueReceipt);
    invariant(claim && typeof claim === 'object', 'CONTRIBUTION_UNVERIFIED');
    identifier(claim.eventId);identifier(claim.speakerId);identifier(claim.contributorId);
    integer(claim.seconds,1,300);integer(claim.verifiedAtMs);
    invariant(claim.tenantId===this.scope.tenantId &&
      claim.sessionId===this.scope.sessionId,'CONTRIBUTION_SCOPE_DENIED');
    invariant(claim.verifiedAtMs<=nowMs && nowMs-claim.verifiedAtMs<=300000,
      'CONTRIBUTION_EVIDENCE_STALE');
    const saved=structuredClone(claim);
    const prior=this.records.get(saved.eventId);
    if(prior){
      invariant(JSON.stringify(prior)===JSON.stringify(saved),'CONTRIBUTION_REPLAY_CONFLICT');
      return { creditedSeconds:this.seconds.get(saved.contributorId)??0,duplicate:true };
    }
    const credited=this.seconds.get(saved.contributorId)??0;
    invariant(this.records.size<10000 && credited+saved.seconds<=this.perContributorCapSeconds,
      'CONTRIBUTION_CREDIT_LIMIT');
    this.records.set(saved.eventId,saved);
    this.seconds.set(saved.contributorId,credited+saved.seconds);
    return { creditedSeconds:credited+saved.seconds,duplicate:false };
  }
  /** Pseudonymous private projection: never reveal receipt strings or source measurements. */
  summary() {return [...this.seconds.entries()].map(([contributorId,creditedSeconds])=>
    ({contributorId,creditedSeconds})).sort((a,b)=>a.contributorId.localeCompare(b.contributorId));}
}
