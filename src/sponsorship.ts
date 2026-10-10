import { identifier, integer, invariant } from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneSession, SceneActor } from './session.js';

export type SponsorStatus = 'proposed' | 'accepted' | 'cancelled';
export interface SponsorCommitment {
  id: string; sponsorId: string; publicName: string; placement: 'event-page' | 'session-credit';
  committedCents: number; disclosure: string; privateAgreementReference: string;
}
interface SponsorRecord { details: SponsorCommitment; status: SponsorStatus; siteRevision: number; }
export interface PublicSponsorCredit { publicName: string; placement: SponsorCommitment['placement']; disclosure: string }
/** Private, endpoint-owned sponsorship ledger; no charge, payout, or signature operation. */
export class SceneSponsorship {
  private readonly records = new Map<string, SponsorRecord>();
  constructor(private readonly session: SceneSession) {}
  propose(actor: SceneActor, input: SponsorCommitment, nowMs: number): void {
    const state=this.session.snapshot();requireSceneRole(actor,state.scope,['organizer'],nowMs);
    identifier(input.id);identifier(input.sponsorId);identifier(input.privateAgreementReference);
    invariant(typeof input.publicName==='string' && input.publicName.trim().length>0 && input.publicName.length<=120,'INVALID_SPONSOR_NAME');
    invariant(typeof input.disclosure==='string' && input.disclosure.trim().length>0 && input.disclosure.length<=400,'INVALID_SPONSOR_DISCLOSURE');
    invariant(input.placement==='event-page'||input.placement==='session-credit','INVALID_SPONSOR_PLACEMENT');
    integer(input.committedCents,0,100000000000);
    invariant(!this.records.has(input.id)&&state.state!=='cancelled','SPONSOR_COMMITMENT_CONFLICT');
    this.records.set(input.id,{details:structuredClone(input),status:'proposed',siteRevision:state.plan.revision});
  }
  accept(actor: SceneActor, id: string, nowMs: number): void {
    const state=this.session.snapshot();requireSceneRole(actor,state.scope,['organizer'],nowMs);
    const record=this.records.get(id);
    invariant(record && record.status==='proposed'&&record.siteRevision===state.plan.revision&&state.state!=='cancelled','SPONSOR_COMMITMENT_NOT_CURRENT');
    record.status='accepted';
  }
  cancel(actor: SceneActor, id: string, nowMs: number): void {
    requireSceneRole(actor,this.session.snapshot().scope,['organizer'],nowMs);
    const record=this.records.get(id);invariant(record,'UNKNOWN_SPONSOR_COMMITMENT');record.status='cancelled';
  }
  privateRecords(actor: SceneActor, nowMs: number): Array<SponsorRecord> {
    requireSceneRole(actor,this.session.snapshot().scope,['organizer'],nowMs);
    return structuredClone([...this.records.values()]);
  }
  publicCredits(nowMs: number): PublicSponsorCredit[] {
    integer(nowMs);const state=this.session.snapshot();
    if(state.state==='cancelled'||state.state==='stopped'||state.plan.endsAtMs<=nowMs)return [];
    return [...this.records.values()].filter(r=>r.status==='accepted'&&r.siteRevision===state.plan.revision)
      .map(r=>({publicName:r.details.publicName,placement:r.details.placement,disclosure:r.details.disclosure}));
  }
}
