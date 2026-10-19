import {identifier, integer, invariant} from '@neophilism/distributed-audio-engine';
import type {Scope} from '@neophilism/distributed-audio-engine';
import {requireSceneRole} from './session.js';
import type {SceneActor} from './session.js';

/** Private endpoint manifest. Never publish source IDs, digests or decoder results. */
export interface CompositionAsset {
  id: string;
  encryptedObjectId: string;
  role: string;
  sampleRate: number;
  frames: number;
  channels: 1 | 2;
  pcmSha256: string;
  encrypted: true;
}
export interface CompositionManifest {
  id: string;
  revision: number;
  sampleRate: number;
  frames: number;
  stems: CompositionAsset[];
  completeMix: CompositionAsset;
}
export interface DecodedAssetEvidence {
  sampleRate: number;
  frames: number;
  channels: 1 | 2;
  pcmSha256: string;
}
/** Probe decrypts and hashes at an authorized endpoint. It must not return keys or plaintext. */
export type EndpointAssetProbe = (encryptedObjectId: string) => Promise<DecodedAssetEvidence>;

const digest = (value: string): void =>
  invariant(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'INVALID_PCM_DIGEST');
function assetShape(asset: CompositionAsset): void {
  invariant(asset && typeof asset === 'object' && !Array.isArray(asset) &&
    Object.keys(asset).sort().join(',') ===
      'channels,encrypted,encryptedObjectId,frames,id,pcmSha256,role,sampleRate',
    'INVALID_COMPOSITION_ASSET_SHAPE');
  identifier(asset.id); identifier(asset.encryptedObjectId); identifier(asset.role);
  integer(asset.sampleRate, 8000); invariant(asset.sampleRate <= 192000, 'INVALID_SAMPLE_RATE');
  integer(asset.frames, 1); invariant(asset.frames <= 2_147_483_647, 'INVALID_FRAME_COUNT');
  invariant(asset.channels === 1 || asset.channels === 2, 'INVALID_CHANNEL_COUNT');
  invariant(asset.encrypted === true, 'PLAINTEXT_ASSET_DENIED');
  digest(asset.pcmSha256);
}
/**
 * Validate source alignment, permission and independently decoded PCM evidence.
 * The returned manifest is admitted for private authoring, not for public release
 * or hardware playback. Recheck current rights before subsequent use.
 */
export async function ingestCompositionManifest(input: {
  actor: SceneActor;
  scope: Scope;
  manifest: CompositionManifest;
  nowMs: () => number;
  rightsAllowAsset: (encryptedObjectId: string, nowMs: number) => boolean;
  probe: EndpointAssetProbe;
  signal?: AbortSignal;
}): Promise<CompositionManifest> {
  const {actor, scope, manifest, nowMs, rightsAllowAsset, probe, signal} = input;
  const checkCancellation = () => invariant(!signal?.aborted, 'COMPOSITION_INGEST_CANCELLED');
  checkCancellation();
  const startedAt = nowMs();
  requireSceneRole(actor, scope, ['organizer', 'operator'], startedAt);
  invariant(manifest && typeof manifest === 'object' && !Array.isArray(manifest) &&
    Object.keys(manifest).sort().join(',') ===
      'completeMix,frames,id,revision,sampleRate,stems',
    'INVALID_COMPOSITION_MANIFEST_SHAPE');
  // Freeze the caller's value before the first asynchronous probe. Every
  // authorization and decoded-byte comparison must use this same snapshot.
  const privateCopy = structuredClone(manifest);
  identifier(privateCopy.id); integer(privateCopy.revision, 1);
  integer(privateCopy.sampleRate, 8000);
  invariant(privateCopy.sampleRate <= 192000, 'INVALID_SAMPLE_RATE');
  integer(privateCopy.frames, 1);
  invariant(privateCopy.frames <= 2_147_483_647, 'INVALID_FRAME_COUNT');
  invariant(Array.isArray(privateCopy.stems) && privateCopy.stems.length > 0 &&
    privateCopy.stems.length <= 64 && privateCopy.completeMix !== undefined,
    'INCOMPLETE_COMPOSITION');
  const assets = [...privateCopy.stems, privateCopy.completeMix];
  const ids = new Set<string>(), objects = new Set<string>();
  for (const asset of assets) {
    assetShape(asset);
    invariant(asset.sampleRate === privateCopy.sampleRate &&
      asset.frames === privateCopy.frames, 'UNALIGNED_COMPOSITION_ASSET');
    invariant(!ids.has(asset.id) && !objects.has(asset.encryptedObjectId),
      'DUPLICATE_COMPOSITION_ASSET');
    ids.add(asset.id); objects.add(asset.encryptedObjectId);
  }
  invariant(privateCopy.completeMix.role === 'complete-mix', 'COMPLETE_MIX_REQUIRED');
  invariant(privateCopy.stems.every(asset => asset.role !== 'complete-mix'),
    'STEM_ROLE_INVALID');
  for (const asset of assets) {
    checkCancellation();
    invariant(rightsAllowAsset(asset.encryptedObjectId, startedAt) === true,
      'COMPOSITION_RIGHTS_DENIED');
    const evidence = await probe(asset.encryptedObjectId);
    checkCancellation();
    invariant(evidence && evidence.sampleRate === asset.sampleRate &&
      evidence.frames === asset.frames && evidence.channels === asset.channels &&
      evidence.pcmSha256 === asset.pcmSha256,
      'DECODED_ASSET_EVIDENCE_MISMATCH');
  }
  checkCancellation();
  const completedAt = nowMs();
  requireSceneRole(actor, scope, ['organizer', 'operator'], completedAt);
  invariant(assets.every(asset =>
    rightsAllowAsset(asset.encryptedObjectId, completedAt) === true),
    'COMPOSITION_RIGHTS_DENIED');
  return privateCopy;
}
