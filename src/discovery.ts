import { identifier, integer, invariant } from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneActor, SceneSession } from './session.js';
import {accessibleVisitorGuide} from './accessible-event.js';
import type { SceneLineup, PublicPerformer } from './lineup.js';

export interface PublicSessionPage {
  sessionId: string;
  summary: string;
  startsAtMs: number;
  endsAtMs: number;
  freeAdmission: true;
  lineup: PublicPerformer[];
  accessibilitySummary: string | null;
  eventArea: string | null;
  listingRevision: number;
}
interface RecordEntry {
  session: SceneSession; lineup: SceneLineup;
  siteRevision: number; listingRevision: number;
  accessibilitySummary: string | null; eventArea: string | null;
}
/**
 * Endpoint-authorized public projections. The publisher explicitly chooses
 * public event-area copy; private site IDs, permit evidence, conditions, and
 * exact contributor coordinates are never part of the public API.
 *
 * Integration must authenticate the owner and publish only this projection.
 * This in-memory registry is not a deployed service or a permission to host events.
 */
export class SceneDiscovery {
  private readonly sessions = new Map<string, RecordEntry>();
  publish(actor: SceneActor, session: SceneSession, lineup: SceneLineup, options: {
    eventArea: string | null; accessibilitySummary: string | null;
  }, nowMs: number): void {
    const snap = session.snapshot();
    requireSceneRole(actor, snap.scope, ['organizer'], nowMs);
    invariant(snap.state === 'authorized' || snap.state === 'active', 'PUBLIC_SESSION_NOT_AUTHORIZED');
    invariant(snap.authorization !== null && snap.authorization.validUntilMs > nowMs, 'PUBLIC_AUTHORIZATION_EXPIRED');
    const limited = (s: string | null, max: number): void => {
      invariant(s === null || (typeof s === 'string' && s.length > 0 && s.length <= max), 'INVALID_PUBLIC_DISCLOSURE');
    };
    limited(options.eventArea, 180); limited(options.accessibilitySummary, 700);
    identifier(snap.scope.sessionId);
    const old = this.sessions.get(snap.scope.sessionId);
    invariant(!old || old.session === session, 'PUBLIC_SESSION_ID_CONFLICT');
    this.sessions.set(snap.scope.sessionId, {
      session, lineup, siteRevision: snap.plan.revision, listingRevision: (old?.listingRevision ?? 0) + 1,
      eventArea: options.eventArea, accessibilitySummary: options.accessibilitySummary
    });
  }
  unpublish(actor: SceneActor, session: SceneSession, nowMs: number): void {
    requireSceneRole(actor, session.snapshot().scope, ['organizer', 'operator'], nowMs);
    const entry = this.sessions.get(session.snapshot().scope.sessionId);
    invariant(!entry || entry.session === session, 'PUBLIC_SESSION_ID_CONFLICT');
    this.sessions.delete(session.snapshot().scope.sessionId);
  }
  private page(entry: RecordEntry, nowMs: number): PublicSessionPage | null {
    const state = entry.session.snapshot();
    if (state.plan.revision !== entry.siteRevision || (state.state !== 'active' && state.state !== 'authorized') ||
        !state.authorization || state.authorization.validUntilMs <= nowMs || state.plan.endsAtMs <= nowMs) return null;
    const listing = entry.session.publicListing(nowMs);
    return {
      sessionId: listing.sessionId, summary: listing.summary, startsAtMs: listing.startsAtMs,
      endsAtMs: listing.endsAtMs, freeAdmission: true, lineup: entry.lineup.publicLineup(nowMs),
      eventArea: entry.eventArea, accessibilitySummary: entry.accessibilitySummary, listingRevision: entry.listingRevision
    };
  }
  detail(sessionId: string, nowMs: number): PublicSessionPage | null {
    identifier(sessionId); integer(nowMs);
    const entry = this.sessions.get(sessionId);
    return entry ? structuredClone(this.page(entry, nowMs)) : null;
  }
  printableGuide(sessionId: string, nowMs: number): string | null {
    const page = this.detail(sessionId, nowMs);
    return page ? accessibleVisitorGuide(page) : null;
  }
  discover(nowMs: number, query = ''): PublicSessionPage[] {
    integer(nowMs); invariant(typeof query === 'string' && query.length <= 120, 'INVALID_DISCOVERY_QUERY');
    const needle = query.trim().toLocaleLowerCase();
    return [...this.sessions.values()].map(entry => this.page(entry, nowMs))
      .filter((page): page is PublicSessionPage => page !== null)
      .filter(page => !needle || [page.summary, page.eventArea ?? '', ...page.lineup.map(a => a.stageName)]
        .some(v => v.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => a.startsAtMs - b.startsAtMs || a.sessionId.localeCompare(b.sessionId))
      .map(page => structuredClone(page));
  }
}
