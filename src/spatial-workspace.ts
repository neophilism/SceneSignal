import { PlacementRegistry, validateScene, validatePosition, createMixPlan, applyAnchor, renderSpatialChunk, finite, identifier, integer, invariant } from '@neophilism/distributed-audio-engine';
import type { SpatialScene, SpatialSpeaker, Position, PositionObservation, MixPlan, Scope } from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneActor, SceneSession } from './session.js';
import type { SpatialAutomation } from './spatial-automation.js';

export interface ContributorSpeaker {
  id: string; ownerId: string; outputId: string; consentUntilMs: number;
  maximumLinearGain: number; roleWeights: Record<string, number>;
  placement: 'fixed' | 'tracked'; position: Position; trackerId: string | null;
}
export interface Spime {
  id: string; sourceId: string; controllerId: string; trackingObjectId: string;
  trackerId: string; calibrationId: string; calibrationUntilMs: number;
  method: 'validated-coordinate';
}
/** Private scene/source/speaker positions stay at authorized endpoints. Plan simulations are never route qualification. */
export class SpatialWorkspace {
  private scene: SpatialScene;
  private readonly speakers = new Map<string, ContributorSpeaker>();
  private readonly spimes = new Map<string, Spime>();
  private readonly placements = new PlacementRegistry({ maxAgeMs: 3000, maxUncertaintyMeters: 0.5, minConfidence: 0.9 });
  private readonly scope: Scope;
  private lastAutomationAtMs = -1;
  constructor(private readonly session: SceneSession, scene: SpatialScene, private readonly rightsAllowSource: (assetId: string, nowMs: number) => boolean) {
    validateScene(scene); this.scene = structuredClone(scene); this.scope = session.snapshot().scope;
  }
  snapshot(): { scene: SpatialScene; speakers: ContributorSpeaker[]; spimes: Spime[] } { return structuredClone({ scene: this.scene, speakers: [...this.speakers.values()], spimes: [...this.spimes.values()] }); }
  compose(actor: SceneActor, scene: SpatialScene, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['organizer','operator'], nowMs); validateScene(scene);
    invariant(scene.id === this.scene.id && scene.revision === this.scene.revision + 1 && scene.sampleRate === this.scene.sampleRate && scene.frames === this.scene.frames, 'SCENE_REVISION_OR_ALIGNMENT_CONFLICT');
    invariant(scene.sources.every(s => this.rightsAllowSource(s.assetId, nowMs) === true), 'SPATIAL_SOURCE_RIGHTS_DENIED');
    invariant([...this.spimes.values()].every(s => scene.sources.some(source => source.id === s.sourceId)), 'BOUND_SPIME_SOURCE_REMOVED');
    this.scene = structuredClone(scene);
  }
  /** Apply an admitted endpoint timeline through the same role, revision and rights checks as manual edits. */
  applyAutomation(actor: SceneActor, automation: SpatialAutomation, nowMs: number): boolean {
    requireSceneRole(actor, this.scope, ['organizer','operator'], nowMs);
    integer(nowMs, this.lastAutomationAtMs + 1);
    // Spime control is live positional authority: do not silently override it.
    invariant(this.spimes.size === 0, 'SPIME_AUTOMATION_CONFLICT');
    const sampled = automation.sample(nowMs);
    if (!sampled) return false;
    invariant(sampled.sources.length === this.scene.sources.length &&
      sampled.sources.every((source, index) =>
        source.id === this.scene.sources[index]!.id &&
        source.assetId === this.scene.sources[index]!.assetId &&
        source.role === this.scene.sources[index]!.role),
      'AUTOMATION_SOURCE_CONFLICT');
    this.compose(actor, {...sampled, revision: this.scene.revision + 1}, nowMs);
    this.lastAutomationAtMs = nowMs;
    return true;
  }
  joinSpeaker(actor: SceneActor, speaker: ContributorSpeaker, nowMs: number): void {
    integer(nowMs); identifier(actor.identityId); integer(actor.expiresAtMs, nowMs + 1);
    invariant(actor.tenantId === this.scope.tenantId && actor.sessionId === this.scope.sessionId && speaker.ownerId === actor.identityId, 'SPEAKER_CONSENT_SCOPE_MISMATCH');
    invariant(Object.keys(speaker).sort().join(',') === 'consentUntilMs,id,maximumLinearGain,outputId,ownerId,placement,position,roleWeights,trackerId', 'UNKNOWN_SPEAKER_FIELDS');
    identifier(speaker.id); identifier(speaker.outputId); validatePosition(speaker.position); integer(speaker.consentUntilMs, nowMs + 1); finite(speaker.maximumLinearGain, 0, 1);
    invariant(Object.keys(speaker.roleWeights).length > 0 && Object.keys(speaker.roleWeights).length <= 256, 'INVALID_SPEAKER_ROLES');
    for (const [role, weight] of Object.entries(speaker.roleWeights)) { identifier(role); finite(weight, 0, 1); }
    invariant(this.speakers.size < 4096 && !this.speakers.has(speaker.id) && ![...this.spimes.values()].some(s => s.trackingObjectId === speaker.id) && ![...this.speakers.values()].some(s => s.outputId === speaker.outputId), 'DUPLICATE_PHYSICAL_OUTPUT');
    if (speaker.placement === 'fixed') { invariant(speaker.trackerId === null, 'FIXED_SPEAKER_HAS_TRACKER'); this.placements.setFixed(speaker.id, speaker.position, nowMs); }
    else { invariant(speaker.placement === 'tracked' && speaker.trackerId !== null, 'TRACKED_SPEAKER_WITHOUT_TRACKER'); this.placements.bindTracked(speaker.id, speaker.trackerId); }
    this.speakers.set(speaker.id, structuredClone(speaker));
  }
  leaveSpeaker(actor: SceneActor, speakerId: string, nowMs: number): void {
    const s = this.speakers.get(speakerId); invariant(s, 'UNKNOWN_SPEAKER');
    integer(actor.expiresAtMs, nowMs + 1); invariant(actor.tenantId === this.scope.tenantId && actor.sessionId === this.scope.sessionId && (s.ownerId === actor.identityId || actor.roles.some(r => ['organizer','operator','steward'].includes(r))), 'SPEAKER_LEAVE_DENIED');
    this.speakers.delete(speakerId); this.placements.unbind(speakerId);
  }
  setFixedPosition(actor: SceneActor, speakerId: string, position: Position, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['organizer','operator'], nowMs); const s = this.speakers.get(speakerId); invariant(s?.placement === 'fixed', 'SPEAKER_NOT_FIXED');
    validatePosition(position); this.placements.setFixed(speakerId, position, nowMs); s.position = structuredClone(position);
  }
  observeSpeaker(actor: SceneActor, observation: PositionObservation, nowMs: number): void {
    const s = this.speakers.get(observation.objectId); invariant(s && s.ownerId === actor.identityId && actor.tenantId === this.scope.tenantId && actor.sessionId === this.scope.sessionId && actor.expiresAtMs > nowMs, 'SPEAKER_TRACKING_DENIED');
    this.placements.observe(observation, nowMs);
  }
  bindSpime(actor: SceneActor, spime: Spime, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['organizer','operator'], nowMs);
    invariant(Object.keys(spime).sort().join(',') === 'calibrationId,calibrationUntilMs,controllerId,id,method,sourceId,trackerId,trackingObjectId', 'UNKNOWN_SPIME_FIELDS');
    for (const id of [spime.id,spime.sourceId,spime.controllerId,spime.trackingObjectId,spime.trackerId,spime.calibrationId]) identifier(id);
    integer(spime.calibrationUntilMs, nowMs + 1); invariant(spime.method === 'validated-coordinate', 'BLE_PRESENCE_IS_NOT_SPIME_POSITION');
    invariant(this.spimes.size < 256 && this.scene.sources.some(s => s.id === spime.sourceId) && !this.spimes.has(spime.id) && ![...this.spimes.values()].some(s => s.sourceId === spime.sourceId || s.trackingObjectId === spime.trackingObjectId) && !this.speakers.has(spime.trackingObjectId), 'SPIME_OBJECT_OR_SOURCE_CONFLICT');
    this.placements.bindTracked(spime.trackingObjectId, spime.trackerId); this.spimes.set(spime.id, structuredClone(spime));
  }
  observeSpime(actor: SceneActor, spimeId: string, observation: PositionObservation, nowMs: number): void {
    const spime = this.spimes.get(spimeId); invariant(spime && spime.controllerId === actor.identityId && actor.tenantId === this.scope.tenantId && actor.sessionId === this.scope.sessionId && actor.expiresAtMs > nowMs && spime.calibrationUntilMs > nowMs, 'SPIME_TRACKING_DENIED');
    invariant(observation.objectId === spime.trackingObjectId, 'SPIME_OBJECT_MISMATCH'); this.placements.observe(observation, nowMs);
    this.scene = applyAnchor(this.scene, { id: spime.id, sourceId: spime.sourceId, position: observation.position, positionAtMs: observation.atMs, confidence: observation.confidence, method: 'validated-position' }, nowMs, 3000, 0.9);
  }
  removeSpime(actor: SceneActor, spimeId: string, nowMs: number): void { requireSceneRole(actor, this.scope, ['organizer','operator'], nowMs); const s = this.spimes.get(spimeId); invariant(s, 'UNKNOWN_SPIME'); this.placements.unbind(s.trackingObjectId); this.spimes.delete(spimeId); }
  mixPlan(nowMs: number, mode: 'audition' | 'authorized-session'): { plan: MixPlan; simulation: boolean; unavailableSpimeIds: string[]; fieldValidated: false } {
    integer(nowMs); const scene = structuredClone(this.scene); const unavailableSpimeIds: string[] = [];
    for (const spime of this.spimes.values()) if (spime.calibrationUntilMs <= nowMs || !this.placements.positionAt(spime.trackingObjectId, nowMs)) { unavailableSpimeIds.push(spime.id); scene.sources.find(s => s.id === spime.sourceId)!.gain = 0; }
    invariant(scene.sources.every(s => this.rightsAllowSource(s.assetId, nowMs) === true), 'SPATIAL_SOURCE_RIGHTS_DENIED');
    const ceiling = mode === 'authorized-session' ? this.session.operatingLimits(nowMs).maximumLinearGain : this.session.snapshot().plan.maximumLinearGain;
    invariant(mode === 'audition' || mode === 'authorized-session', 'UNKNOWN_MIX_MODE');
    const speakers: SpatialSpeaker[] = [];
    for (const s of this.speakers.values()) {
      if (s.consentUntilMs <= nowMs) continue; const placement = this.placements.positionAt(s.id, nowMs); if (!placement) continue;
      speakers.push({ id: s.id, position: placement.position, roleWeights: s.roleWeights, maxLinearGain: Math.min(s.maximumLinearGain, ceiling), placement: s.placement, positionAtMs: nowMs, confidence: 1 });
    }
    return { plan: createMixPlan(scene, speakers, { nowMs, maxAgeMs: 3000, minConfidence: 0.9 }), simulation: mode === 'audition', unavailableSpimeIds, fieldValidated: false };
  }
  audition(stems: Readonly<Record<string, Float32Array>>, nowMs: number): { samples: Record<string, Float32Array>; simulation: true; fieldValidated: false } {
    const { plan } = this.mixPlan(nowMs, 'audition'); return { samples: renderSpatialChunk(plan, stems), simulation: true, fieldValidated: false };
  }
}
