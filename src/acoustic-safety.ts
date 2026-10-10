import { finite, identifier, integer, invariant } from '@neophilism/distributed-audio-engine';
import type { ControlVerifier, SignedControl, ControlPayloadDecoder } from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneActor, SceneSession } from './session.js';

export interface AcousticSafetyPolicy {
  /** The site authority sets this bound; it is NOT a regulatory determination. */
  maxDbA: number;
  maxStalenessMs: number;
}
export interface AcousticObservation {
  sensorId: string; calibrationReference: string; siteRevision: number;
  observedAtMs: number; calibrationValidUntilMs: number; measuredDbA: number;
}
export interface AcousticStatus {
  state: 'no-observation' | 'adapter-reported-below-limit' | 'halted' | 'stale';
  siteRevision: number;
  mostRecentLevelDbA: number | null;
  verifiedPhysicalEvidence: false;
  safeForProductionRelease: false;
}
/**
 * A signed observation is proof of authenticated reporting, not proof that a
 * sensor was independently calibrated. Never turn it into a release approval.
 */
export class SceneAcousticMonitor {
  private readonly siteRevision: number;
  private current: AcousticObservation | null = null;
  private halted = false;
  private generation = 0;
  private lastNowMs = 0;

  constructor(
    private readonly session: SceneSession,
    private readonly verifier: ControlVerifier,
    private readonly decode: ControlPayloadDecoder,
    private readonly policy: AcousticSafetyPolicy
  ) {
    finite(policy.maxDbA, 30, 130); integer(policy.maxStalenessMs, 100, 60_000);
    invariant(verifier.matchesScope(session.snapshot().scope), 'ACOUSTIC_SCOPE_MISMATCH');
    this.siteRevision = session.snapshot().plan.revision;
  }

  private observeTime(nowMs: number): void { integer(nowMs, this.lastNowMs); this.lastNowMs = nowMs; }
  private requireCurrent(): void {
    const state = this.session.snapshot();
    invariant(state.plan.revision === this.siteRevision && !this.halted &&
      state.state !== 'cancelled' && state.state !== 'stopped', 'ACOUSTIC_MONITOR_NOT_CURRENT');
  }
  /** Operator-facing private status. No raw observation is ever a public safety seal. */
  status(nowMs: number): AcousticStatus {
    this.observeTime(nowMs);
    const current = this.session.snapshot();
    const stale = !this.current || nowMs - this.current.observedAtMs > this.policy.maxStalenessMs
      || this.current.calibrationValidUntilMs <= nowMs;
    return {
      state: this.halted || current.state === 'cancelled' || current.state === 'stopped'
        ? 'halted' : !this.current ? 'no-observation' : stale || current.plan.revision !== this.siteRevision
        ? 'stale' : 'adapter-reported-below-limit',
      siteRevision: this.siteRevision, mostRecentLevelDbA: this.current?.measuredDbA ?? null,
      verifiedPhysicalEvidence: false, safeForProductionRelease: false
    };
  }
  /** The trusted primary signing authority supplies an encrypted, signed, replay-checked payload. */
  async accept(actor: SceneActor, control: SignedControl, nowMs: number): Promise<AcousticStatus> {
    this.observeTime(nowMs);
    requireSceneRole(actor, this.session.snapshot().scope, ['organizer','operator','steward'], nowMs);
    this.requireCurrent();
    invariant(control.body.action === 'acoustic-observation', 'ACOUSTIC_CONTROL_ACTION');
    const generation = this.generation;
    const signedBody = await this.verifier.accept(control, nowMs);
    const decoded = await this.decode(signedBody);
    invariant(generation === this.generation && nowMs >= this.lastNowMs, 'ACOUSTIC_OBSERVATION_SUPERSEDED');
    this.requireCurrent();
    invariant(decoded && typeof decoded === 'object', 'INVALID_ACOUSTIC_OBSERVATION');
    const observation = structuredClone(decoded) as AcousticObservation;
    invariant(Object.keys(observation).sort().join(',') ===
      'calibrationReference,calibrationValidUntilMs,measuredDbA,observedAtMs,sensorId,siteRevision', 'UNKNOWN_ACOUSTIC_FIELDS');
    identifier(observation.sensorId); identifier(observation.calibrationReference);
    integer(observation.siteRevision, 1); integer(observation.observedAtMs);
    integer(observation.calibrationValidUntilMs, nowMs + 1);
    finite(observation.measuredDbA, 0, 160);
    invariant(observation.siteRevision === this.siteRevision &&
      observation.observedAtMs <= nowMs && nowMs - observation.observedAtMs <= this.policy.maxStalenessMs,
      'ACOUSTIC_OBSERVATION_STALE_OR_WRONG_SITE');
    invariant(!this.current || observation.observedAtMs > this.current.observedAtMs,
      'ACOUSTIC_OBSERVATION_REPLAY');
    this.current = observation;
    if (observation.measuredDbA > this.policy.maxDbA) {
      this.halted = true; this.generation++;
      this.session.stop(actor, nowMs, 'ACOUSTIC_LIMIT_EXCEEDED');
    }
    return this.status(nowMs);
  }
  /** Explicit emergency stop is available without any meter data. */
  emergencyStop(actor: SceneActor, nowMs: number): void {
    this.observeTime(nowMs);
    requireSceneRole(actor, this.session.snapshot().scope, ['organizer','operator','steward'], nowMs);
    this.halted = true; this.generation++;
    this.session.stop(actor, nowMs, 'ACOUSTIC_EMERGENCY_STOP');
  }
  /** A missing or stale trusted observation stops active output; it does not infer a safe sound level. */
  tick(actor: SceneActor, nowMs: number): AcousticStatus {
    this.observeTime(nowMs);
    requireSceneRole(actor, this.session.snapshot().scope, ['organizer','operator','steward'], nowMs);
    if (!this.halted && this.session.snapshot().state === 'active') {
      const status = this.status(nowMs);
      if (status.state !== 'adapter-reported-below-limit') {
        this.halted = true; this.generation++;
        this.session.stop(actor, nowMs, 'ACOUSTIC_MONITOR_STALE');
      }
    }
    return this.status(nowMs);
  }
}
