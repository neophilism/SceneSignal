import { identifier, integer, invariant } from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneActor, SceneSession } from './session.js';

export interface ArtistCall {
  id: string; title: string; publicDescription: string; opensAtMs: number; closesAtMs: number; maxApplications: number;
}
export interface ArtistApplication {
  id: string; callId: string; performerId: string; stageName: string; privatePitch: string; requestedMinutes: number;
}
export interface PerformanceTerms {
  id: string; performerId: string; stageName: string; beginsAtMs: number; endsAtMs: number;
  guaranteedFeeCents: number; artistShareBps: number; rightsReferenceId: string;
}
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export interface PerformanceOffer {
  terms: PerformanceTerms; status: OfferStatus; siteRevision: number; publiclyListed: boolean;
}
export interface PublicPerformer { stageName: string; beginsAtMs: number; endsAtMs: number }
const label = (value: string, limit: number): void => {
  invariant(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit, 'INVALID_ARTIST_TEXT');
};
const inRange = (v: number, min: number, max: number): void => { integer(v, min, max); };
/**
 * Portable endpoint-owned artist roster. Actor claims must come from a trusted
 * identity adapter. Terms, pitches, and financial details are PRIVATE; callers
 * must encrypt their persistence and transport with an authenticated E2EE channel.
 * A recorded acceptance is NOT an electronic signature or enforceable contract.
 */
export class SceneLineup {
  private readonly scope: ReturnType<SceneSession['snapshot']>['scope'];
  private readonly calls = new Map<string, { value: ArtistCall; siteRevision: number }>();
  private readonly applications = new Map<string, ArtistApplication>();
  private readonly offers = new Map<string, PerformanceOffer>();
  constructor(private readonly session: SceneSession) { this.scope = session.snapshot().scope; }
  private revision(): number { return this.session.snapshot().plan.revision; }
  publishCall(actor: SceneActor, call: ArtistCall, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['organizer'], nowMs);
    identifier(call.id); label(call.title, 120); label(call.publicDescription, 1000);
    integer(call.opensAtMs); integer(call.closesAtMs, call.opensAtMs + 1);
    inRange(call.maxApplications, 1, 1000);
    const plan = this.session.snapshot().plan;
    invariant(call.closesAtMs <= plan.startsAtMs && nowMs < call.closesAtMs && !this.calls.has(call.id), 'INVALID_ARTIST_CALL');
    this.calls.set(call.id, { value: structuredClone(call), siteRevision: plan.revision });
  }
  publicCalls(nowMs: number): ArtistCall[] {
    integer(nowMs);
    return [...this.calls.values()].filter(c => c.siteRevision === this.revision() && c.value.opensAtMs <= nowMs && nowMs < c.value.closesAtMs)
      .map(c => structuredClone(c.value));
  }
  apply(actor: SceneActor, application: ArtistApplication, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['performer'], nowMs);
    identifier(application.id); identifier(application.callId); identifier(application.performerId);
    label(application.stageName, 120); label(application.privatePitch, 3000); inRange(application.requestedMinutes, 1, 240);
    const call = this.calls.get(application.callId);
    invariant(call && call.siteRevision === this.revision() && call.value.opensAtMs <= nowMs && nowMs < call.value.closesAtMs, 'ARTIST_CALL_NOT_OPEN');
    invariant(application.performerId === actor.identityId && !this.applications.has(application.id), 'ARTIST_APPLICATION_IDENTITY_CONFLICT');
    invariant([...this.applications.values()].filter(a => a.callId === application.callId).length < call.value.maxApplications, 'ARTIST_CALL_FULL');
    invariant(![...this.applications.values()].some(a => a.callId === application.callId && a.performerId === actor.identityId), 'ARTIST_APPLICATION_DUPLICATE');
    this.applications.set(application.id, structuredClone(application));
  }
  privateApplications(actor: SceneActor, nowMs: number): ArtistApplication[] {
    requireSceneRole(actor, this.scope, ['organizer', 'performer'], nowMs);
    return [...this.applications.values()].filter(a => actor.roles.includes('organizer') || a.performerId === actor.identityId)
      .map(a => structuredClone(a));
  }
  offer(actor: SceneActor, terms: PerformanceTerms, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['organizer'], nowMs);
    identifier(terms.id); identifier(terms.performerId); identifier(terms.rightsReferenceId);
    label(terms.stageName, 120); integer(terms.beginsAtMs); integer(terms.endsAtMs, terms.beginsAtMs + 1);
    inRange(terms.guaranteedFeeCents, 0, 100000000000); inRange(terms.artistShareBps, 0, 10000);
    const plan = this.session.snapshot().plan;
    invariant(terms.beginsAtMs >= plan.startsAtMs && terms.endsAtMs <= plan.endsAtMs && terms.beginsAtMs > nowMs, 'ARTIST_SLOT_OUTSIDE_SESSION');
    invariant(!this.offers.has(terms.id), 'ARTIST_OFFER_DUPLICATE');
    this.offers.set(terms.id, { terms: structuredClone(terms), status: 'pending', siteRevision: plan.revision, publiclyListed: false });
  }
  respond(actor: SceneActor, offerId: string, response: 'accept' | 'decline', publiclyListed: boolean, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['performer'], nowMs);
    const offer = this.offers.get(offerId);
    invariant(offer && offer.terms.performerId === actor.identityId && offer.status === 'pending', 'ARTIST_OFFER_NOT_PENDING');
    invariant(offer.siteRevision === this.revision() && nowMs < offer.terms.beginsAtMs, 'ARTIST_OFFER_STALE');
    invariant(response === 'accept' || response === 'decline', 'ARTIST_RESPONSE_INVALID');
    invariant(typeof publiclyListed === 'boolean', 'ARTIST_PUBLIC_CONSENT_INVALID');
    if (response === 'accept') {
      invariant(![...this.offers.values()].some(o =>
        o !== offer && o.status === 'accepted' && o.siteRevision === this.revision() &&
        o.terms.performerId === actor.identityId && o.terms.beginsAtMs < offer.terms.endsAtMs && offer.terms.beginsAtMs < o.terms.endsAtMs
      ), 'ARTIST_SCHEDULE_CONFLICT');
    }
    offer.status = response === 'accept' ? 'accepted' : 'declined';
    offer.publiclyListed = response === 'accept' && publiclyListed;
  }
  cancel(actor: SceneActor, offerId: string, nowMs: number): void {
    const offer = this.offers.get(offerId); invariant(offer, 'UNKNOWN_ARTIST_OFFER');
    requireSceneRole(actor, this.scope, ['organizer', 'performer'], nowMs);
    invariant(actor.roles.includes('organizer') || offer.terms.performerId === actor.identityId, 'ARTIST_OFFER_CANCEL_DENIED');
    offer.status = 'cancelled'; offer.publiclyListed = false;
  }
  privateOffers(actor: SceneActor, nowMs: number): PerformanceOffer[] {
    requireSceneRole(actor, this.scope, ['organizer', 'performer'], nowMs);
    return [...this.offers.values()].filter(o => actor.roles.includes('organizer') || o.terms.performerId === actor.identityId)
      .map(o => structuredClone(o));
  }
  /** The only unauthenticated roster projection: no financial terms, IDs or private pitches. */
  publicLineup(nowMs: number): PublicPerformer[] {
    integer(nowMs);
    return [...this.offers.values()].filter(o => o.siteRevision === this.revision() && o.status === 'accepted' && o.publiclyListed && o.terms.endsAtMs > nowMs)
      .map(o => ({ stageName: o.terms.stageName, beginsAtMs: o.terms.beginsAtMs, endsAtMs: o.terms.endsAtMs }))
      .sort((a, b) => a.beginsAtMs - b.beginsAtMs || a.stageName.localeCompare(b.stageName));
  }
}
