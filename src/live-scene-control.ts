import {identifier, integer, invariant} from '@neophilism/distributed-audio-engine';
import type {SpatialScene, Scope} from '@neophilism/distributed-audio-engine';
import {requireSceneRole} from './session.js';
import type {SceneActor, SceneSession} from './session.js';
import {SpatialWorkspace} from './spatial-workspace.js';

/** Endpoint-local authority for authoring scene edits, not a signed playback lease. */
export class LiveSceneControl {
  private readonly scope: Scope;
  private holderId: string | null = null;
  private epoch = 0;
  private lastChangeMs = -1;
  constructor(session: SceneSession, private readonly workspace: SpatialWorkspace) {
    this.scope = session.snapshot().scope;
  }
  snapshot() {
    return { holderId: this.holderId, epoch: this.epoch };
  }
  private actor(actor: SceneActor, nowMs: number): void {
    requireSceneRole(actor, this.scope, ['organizer','operator'], nowMs);
    integer(nowMs, this.lastChangeMs + 1);
  }
  /** The first controller is assigned only by a trusted organizer identity. */
  grant(organizer: SceneActor, recipient: SceneActor, nowMs: number) {
    requireSceneRole(organizer, this.scope, ['organizer'], nowMs);
    this.actor(recipient, nowMs);
    invariant(this.holderId === null, 'SCENE_CONTROLLER_ALREADY_ASSIGNED');
    this.holderId = recipient.identityId;
    this.epoch++;
    this.lastChangeMs = nowMs;
    return this.snapshot();
  }
  private verifyCurrent(actor: SceneActor, expectedEpoch: number, nowMs: number): void {
    this.actor(actor, nowMs);
    integer(expectedEpoch, 1);
    invariant(actor.identityId === this.holderId && expectedEpoch === this.epoch,
      'SCENE_CONTROL_LEASE_STALE');
  }
  edit(actor: SceneActor, expectedEpoch: number, scene: SpatialScene, nowMs: number) {
    this.verifyCurrent(actor, expectedEpoch, nowMs);
    this.workspace.compose(actor, scene, nowMs);
    this.lastChangeMs = nowMs;
    return { ...this.snapshot(), sceneRevision: this.workspace.snapshot().scene.revision };
  }
  /** Transfer never lets the former operator edit using an older epoch. */
  transfer(actor: SceneActor, expectedEpoch: number, recipient: SceneActor, nowMs: number) {
    this.verifyCurrent(actor, expectedEpoch, nowMs);
    this.actor(recipient, nowMs);
    invariant(recipient.identityId !== this.holderId, 'SCENE_CONTROL_SAME_HOLDER');
    this.holderId = recipient.identityId;
    this.epoch++;
    this.lastChangeMs = nowMs;
    return this.snapshot();
  }
  relinquish(actor: SceneActor, expectedEpoch: number, nowMs: number) {
    this.verifyCurrent(actor, expectedEpoch, nowMs);
    this.holderId = null;
    this.epoch++;
    this.lastChangeMs = nowMs;
    return this.snapshot();
  }
}
