import { encryptAttachment, decryptAttachment, identifier, integer, invariant, canonicalJson } from '@neophilism/distributed-audio-engine';
import type { EncryptedAttachment, AttachmentContext, PrivateManifest, Scope } from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneActor } from './session.js';

export interface PrivateEvidenceReference { encryptedEvidenceObjectId: string; evidenceDigestHex: string }
export interface PreparedEvidence { reference: PrivateEvidenceReference; attachment: EncryptedAttachment; context: AttachmentContext }
/** This narrow relay interface can receive ciphertext only. Private manifest/key distribution uses a separate authenticated E2EE channel. */
export interface CiphertextEvidenceRelay { put(object: { objectId: string; tenantId: string; application: 'scenesignal'; expiresAtMs: number; ciphertextChunks: readonly Uint8Array[]; ciphertextDigestHex: string }): Promise<void> }
export interface AuthenticatedManifestChannel { send(manifest: PrivateManifest, expected: AttachmentContext): Promise<void> }
async function ciphertextDigest(chunks: readonly Uint8Array[]): Promise<string> {
  const length = chunks.reduce((n, c) => n + c.byteLength, 0); invariant(length <= 21 * 1024 * 1024, 'EVIDENCE_CIPHERTEXT_TOO_LARGE');
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}
export async function preparePrivateEvidence(actor: SceneActor, scope: Scope, plaintext: Uint8Array<ArrayBuffer>, filename: string, mediaType: string, nowMs: number): Promise<PreparedEvidence> {
  requireSceneRole(actor, scope, ['organizer'], nowMs); invariant(scope.application === 'scenesignal', 'INVALID_SCENE_APPLICATION');
  invariant(plaintext.byteLength > 0 && plaintext.byteLength <= 20 * 1024 * 1024, 'PRIVATE_EVIDENCE_SIZE_LIMIT');
  invariant(['application/pdf','image/png','image/jpeg','application/json'].includes(mediaType), 'UNSUPPORTED_EVIDENCE_TYPE');
  const context: AttachmentContext = { tenantId: scope.tenantId, application: 'scenesignal', parentMessageId: scope.sessionId };
  const attachment = await encryptAttachment(new Uint8Array(plaintext), { ...context, filename, mediaType, chunkSizeBytes: 65536 });
  return { context, attachment, reference: { encryptedEvidenceObjectId: attachment.privateManifest.storageObjectId, evidenceDigestHex: await ciphertextDigest(attachment.ciphertextChunks) } };
}
export async function uploadPrivateEvidence(actor: SceneActor, scope: Scope, prepared: PreparedEvidence, relay: CiphertextEvidenceRelay, channel: AuthenticatedManifestChannel, nowMs: number, expiresAtMs: number): Promise<PrivateEvidenceReference> {
  requireSceneRole(actor, scope, ['organizer'], nowMs); integer(expiresAtMs, nowMs + 1, nowMs + 30 * 86400000);
  const p = structuredClone(prepared); identifier(p.reference.encryptedEvidenceObjectId);
  invariant(canonicalJson(p.context) === canonicalJson({ tenantId: scope.tenantId, application: 'scenesignal', parentMessageId: scope.sessionId }), 'EVIDENCE_SCOPE_MISMATCH');
  // Authenticate the local object before either channel is invoked. Decrypted verification bytes are wiped.
  const checked = await decryptAttachment(p.attachment.privateManifest, p.attachment.ciphertextChunks, p.context, 20 * 1024 * 1024); checked.fill(0);
  invariant(p.reference.encryptedEvidenceObjectId === p.attachment.privateManifest.storageObjectId && p.reference.evidenceDigestHex === await ciphertextDigest(p.attachment.ciphertextChunks), 'EVIDENCE_REFERENCE_MISMATCH');
  await relay.put({ objectId: p.reference.encryptedEvidenceObjectId, tenantId: scope.tenantId, application: 'scenesignal', expiresAtMs, ciphertextChunks: p.attachment.ciphertextChunks, ciphertextDigestHex: p.reference.evidenceDigestHex });
  await channel.send(p.attachment.privateManifest, p.context);
  return { ...p.reference };
}
