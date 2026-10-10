import {
  CoordinatorMonitor, CoordinatorChunkTransport, identifier, invariant
} from '@neophilism/distributed-audio-engine';
import type {
  ControlVerifier, ControlPayloadDecoder, SignedControl, ChunkRequest,
  CiphertextChunkTransport, CoordinatorTransportOptions
} from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneActor, SceneSession } from './session.js';

/**
 * SS-12 portable local-site setup. A selected coordinator transports ONLY
 * ciphertext. Real endpoint identity, signed authority, E2EE channels and
 * native speaker output come from independent trusted adapters.
 *
 * The coordinator is bound to one immutable session/site revision. Changes
 * fail closed and require a fresh instance and freshly signed control.
 */
export class SceneSiteCoordinator {
  private readonly monitor: CoordinatorMonitor;
  private readonly transport: CoordinatorChunkTransport;
  private readonly revision: number;
  private closed = false;

  constructor(
    private readonly session: SceneSession,
    programId: string,
    verifier: ControlVerifier,
    decode: ControlPayloadDecoder,
    localTransports: ReadonlyMap<string, CiphertextChunkTransport>,
    fallbackTransport: CiphertextChunkTransport,
    options: CoordinatorTransportOptions
  ) {
    identifier(programId);
    const snapshot = session.snapshot();
    this.revision = snapshot.plan.revision;
    this.monitor = new CoordinatorMonitor(snapshot.scope, programId, verifier, decode);
    this.transport = new CoordinatorChunkTransport(this.monitor, localTransports, fallbackTransport, options);
  }
  private requireCurrent(): void {
    const current = this.session.snapshot();
    if (this.closed || current.plan.revision !== this.revision ||
      current.state === 'cancelled' || current.state === 'stopped') {
      this.disconnect();
      throw new Error('SITE_COORDINATOR_NOT_CURRENT');
    }
  }
  /** A signed primary-endpoint lease is the only basis for using local routing. */
  async acceptLease(actor: SceneActor, control: SignedControl, nowMs: number): Promise<void> {
    requireSceneRole(actor, this.session.snapshot().scope, ['organizer', 'operator'], nowMs);
    this.requireCurrent();
    try {
      await this.monitor.accept(control, nowMs);
      this.requireCurrent();
    } catch (error) {
      // Invalidation after an asynchronous acceptance can never restore the lease.
      if (this.closed || this.session.snapshot().plan.revision !== this.revision) this.disconnect();
      throw error;
    }
  }
  /** The coordinator cannot decrypt, approve rights, mint rewards or start a speaker. */
  async readCiphertext(actor: SceneActor, request: ChunkRequest, nowMs: number, signal?: AbortSignal): Promise<Uint8Array> {
    requireSceneRole(actor, this.session.snapshot().scope, ['organizer', 'operator'], nowMs);
    this.requireCurrent();
    const result = await this.transport.read(request, signal);
    this.requireCurrent();
    return result;
  }
  diagnostics(actor: SceneActor, nowMs: number): {
    localLease: 'signed-active' | 'none'; coordinatorId: string | null; siteRevision: number;
    nativeDeviceReady: false; fieldValidated: false
  } {
    requireSceneRole(actor, this.session.snapshot().scope, ['organizer', 'operator'], nowMs);
    this.requireCurrent();
    const lease = this.monitor.activeAt(nowMs);
    return {
      localLease: lease ? 'signed-active' : 'none',
      coordinatorId: lease?.coordinatorId ?? null,
      siteRevision: this.revision,
      nativeDeviceReady: false,
      fieldValidated: false
    };
  }
  disconnect(): void {
    if (this.closed) return;
    this.closed = true;
    this.monitor.disconnect();
    this.transport.close();
  }
}
