import { canonicalJson, identifier, integer, invariant, finite } from '@neophilism/distributed-audio-engine';
import type { ControlVerifier, SignedControl, ControlPayloadDecoder, Scope } from '@neophilism/distributed-audio-engine';

export type SceneRole = 'organizer' | 'performer' | 'operator' | 'steward';
/** Supplied by a trusted identity adapter, not chosen by a browser role selector. */
export interface SceneActor { tenantId: string; sessionId: string; identityId: string; roles: readonly SceneRole[]; expiresAtMs: number }
export interface SitePlan {
  siteId: string; revision: number; conditionsDigestHex: string; startsAtMs: number; endsAtMs: number;
  maximumLinearGain: number; publicSummary: string;
}
export interface SessionAuthorization {
  kind: 'permit-verified' | 'organizer-attested'; siteId: string; siteRevision: number;
  conditionsDigestHex: string; validFromMs: number; validUntilMs: number;
  authorizerId: string; encryptedEvidenceObjectId: string; evidenceDigestHex: string;
  maximumLinearGain: number;
}
export interface SessionSnapshot { scope: Scope; revision: number; plan: SitePlan; state: 'planning' | 'authorized' | 'active' | 'stopped' | 'cancelled'; authorization: SessionAuthorization | null; stopReason: string | null }
const hash = (v: string) => invariant(/^[0-9a-f]{64}$/.test(v), 'INVALID_PRIVATE_CONDITIONS_DIGEST');
function validatePlan(p: SitePlan): void {
  invariant(Object.keys(p).sort().join(',') === 'conditionsDigestHex,endsAtMs,maximumLinearGain,publicSummary,revision,siteId,startsAtMs', 'UNKNOWN_SITE_FIELDS');
  identifier(p.siteId); integer(p.revision, 1); hash(p.conditionsDigestHex); integer(p.startsAtMs); integer(p.endsAtMs, p.startsAtMs + 1);
  finite(p.maximumLinearGain, 0, 1); invariant(typeof p.publicSummary === 'string' && p.publicSummary.trim().length > 0 && p.publicSummary.length <= 2000, 'INVALID_PUBLIC_SUMMARY');
}
export function requireSceneRole(actor: SceneActor, scope: Scope, allowed: readonly SceneRole[], nowMs: number): void {
  integer(nowMs); identifier(actor.identityId); integer(actor.expiresAtMs);
  invariant(actor.tenantId === scope.tenantId && actor.sessionId === scope.sessionId && actor.expiresAtMs > nowMs && actor.roles.some(r => allowed.includes(r)), 'SCENE_ACCESS_DENIED');
}
/** Lives at an authorized endpoint. Persist its private plan only through the E2EE storage/channel boundary. */
export class SceneSession {
  private value: SessionSnapshot;
  private generation = 0;
  private lastNowMs = 0;
  constructor(scope: Scope, plan: SitePlan, private readonly stopOutput: (reason: string) => void) {
    identifier(scope.tenantId); identifier(scope.sessionId); invariant(scope.application === 'scenesignal', 'INVALID_SCENE_APPLICATION'); validatePlan(plan);
    this.value = { scope: structuredClone(scope), plan: structuredClone(plan), revision: 1, state: 'planning', authorization: null, stopReason: null };
  }
  private time(nowMs: number): void { integer(nowMs, this.lastNowMs); this.lastNowMs = nowMs; }
  snapshot(): SessionSnapshot { return structuredClone(this.value); }
  revise(actor: SceneActor, plan: SitePlan, nowMs: number): void {
    this.time(nowMs); requireSceneRole(actor, this.value.scope, ['organizer'], nowMs); validatePlan(plan);
    invariant(this.value.state !== 'cancelled' && plan.revision === this.value.plan.revision + 1, 'SITE_REVISION_CONFLICT');
    this.generation++; this.stopOutput('SITE_CHANGED'); this.value = { ...this.value, revision: this.value.revision + 1, plan: structuredClone(plan), state: 'planning', authorization: null, stopReason: 'SITE_CHANGED' };
  }
  async authorize(actor: SceneActor, signed: SignedControl, verifier: ControlVerifier, decode: ControlPayloadDecoder, nowMs: number): Promise<void> {
    this.time(nowMs); requireSceneRole(actor, this.value.scope, ['organizer'], nowMs);
    invariant(verifier.matchesScope(this.value.scope) && signed.body.action === 'session-authorize', 'AUTHORIZATION_SCOPE_OR_ACTION_MISMATCH');
    const generation = this.generation; const plan = this.value.plan;
    invariant(this.value.state !== 'cancelled', 'SESSION_CANCELLED');
    const body = await verifier.accept(signed, nowMs); const decoded = await decode(body);
    invariant(generation === this.generation && nowMs >= this.lastNowMs, 'AUTHORIZATION_SUPERSEDED');
    invariant(decoded && typeof decoded === 'object', 'INVALID_SESSION_AUTHORIZATION'); const a = structuredClone(decoded) as SessionAuthorization;
    invariant(Object.keys(a).sort().join(',') === 'authorizerId,conditionsDigestHex,encryptedEvidenceObjectId,evidenceDigestHex,kind,maximumLinearGain,siteId,siteRevision,validFromMs,validUntilMs', 'UNKNOWN_AUTHORIZATION_FIELDS');
    invariant(a.kind === 'permit-verified' || a.kind === 'organizer-attested', 'INVALID_AUTHORIZATION_KIND');
    identifier(a.authorizerId); identifier(a.encryptedEvidenceObjectId); hash(a.evidenceDigestHex); hash(a.conditionsDigestHex);
    integer(a.validFromMs); integer(a.validUntilMs, a.validFromMs + 1); finite(a.maximumLinearGain, 0, plan.maximumLinearGain);
    invariant(a.siteId === plan.siteId && a.siteRevision === plan.revision && a.conditionsDigestHex === plan.conditionsDigestHex && a.authorizerId === actor.identityId, 'AUTHORIZATION_SITE_OR_ACTOR_MISMATCH');
    invariant(a.validFromMs <= plan.startsAtMs && a.validUntilMs >= plan.endsAtMs && a.validUntilMs > nowMs && body.expiresAtMs > nowMs, 'AUTHORIZATION_DOES_NOT_COVER_SESSION');
    this.generation++; if (this.value.state === 'active') this.stopOutput('AUTHORIZATION_REPLACED');
    this.value = { ...this.value, revision: this.value.revision + 1, state: 'authorized', authorization: a, stopReason: null };
  }
  activate(actor: SceneActor, nowMs: number): SessionSnapshot {
    this.time(nowMs); requireSceneRole(actor, this.value.scope, ['organizer','operator'], nowMs);
    invariant(this.value.state === 'authorized' && this.value.authorization && this.value.authorization.validFromMs <= nowMs && nowMs < this.value.authorization.validUntilMs && this.value.plan.startsAtMs <= nowMs && nowMs < this.value.plan.endsAtMs, 'SESSION_NOT_CURRENTLY_AUTHORIZED');
    this.generation++; this.value.state = 'active'; this.value.revision++; return this.snapshot();
  }
  tick(nowMs: number): SessionSnapshot {
    this.time(nowMs);
    if (this.value.state === 'active' && (!this.value.authorization || nowMs >= Math.min(this.value.plan.endsAtMs, this.value.authorization.validUntilMs))) this.stopInternal('AUTHORIZATION_EXPIRED', false);
    return this.snapshot();
  }
  private stopInternal(reason: string, cancelled: boolean): void {
    this.generation++; this.stopOutput(reason); this.value.state = cancelled ? 'cancelled' : 'stopped'; this.value.revision++; this.value.stopReason = reason;
    if (cancelled) this.value.authorization = null;
  }
  stop(actor: SceneActor, nowMs: number, reason = 'OPERATOR_STOP'): void { this.time(nowMs); requireSceneRole(actor, this.value.scope, ['organizer','operator','steward'], nowMs); identifier(reason); this.stopInternal(reason, false); }
  cancel(actor: SceneActor, nowMs: number, reason = 'ORGANIZER_CANCELLED'): void { this.time(nowMs); requireSceneRole(actor, this.value.scope, ['organizer'], nowMs); identifier(reason); this.stopInternal(reason, true); }
  /** Bind an expiring core audio lease. A session record never bypasses the separate signed playback authority. */
  operatingLimits(nowMs: number): { maximumLinearGain: number; stopAtMs: number } {
    this.tick(nowMs); invariant(this.value.state === 'active' && this.value.authorization, 'SESSION_NOT_ACTIVE');
    return { maximumLinearGain: Math.min(this.value.plan.maximumLinearGain, this.value.authorization.maximumLinearGain), stopAtMs: Math.min(this.value.plan.endsAtMs, this.value.authorization.validUntilMs) };
  }
  publicListing(nowMs: number): { sessionId: string; summary: string; startsAtMs: number; endsAtMs: number; freeAdmission: true; state: SessionSnapshot['state'] } {
    this.tick(nowMs); const p = this.value.plan;
    return { sessionId: this.value.scope.sessionId, summary: p.publicSummary, startsAtMs: p.startsAtMs, endsAtMs: p.endsAtMs, freeAdmission: true, state: this.value.state };
  }
}

/** Hash canonical private site conditions locally; do not send their plaintext to an operations relay. */
export async function privateConditionsDigest(conditions: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(conditions)); const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}
