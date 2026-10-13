import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const commitPattern = /^[0-9a-f]{40}$/;
const keyPattern = /^[A-Za-z0-9._-]{1,64}$/;

/** A green GitHub CI commit is a candidate source revision, never proof of service uptime or production release. */
export function candidateEnvelope(commitSha) {
  if (!commitPattern.test(commitSha)) throw new Error('Invalid SceneSignal commit SHA');
  return {
    version: 1,
    deliveryId: 'scenesignal.ci.' + commitSha,
    records: [{ kind: 'release', key: 'scenesignal-source-' + commitSha, commitSha }]
  };
}
export function signedTelemetryHeaders(keyId, secret, jsonBody, timestampMs) {
  if (!keyPattern.test(keyId) || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('Invalid Engine Room scoped credential');
  if (!/^[0-9]{13}$/.test(timestampMs)) throw new Error('Invalid telemetry timestamp');
  const signature = createHmac('sha256', secret).update(timestampMs + '.').update(jsonBody).digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Engine-Room-Key': keyId,
    'X-Engine-Room-Timestamp': timestampMs,
    'X-Engine-Room-Signature': 'sha256=' + signature
  };
}
export function telemetryEndpoint(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search ||
      (url.pathname !== '/' && url.pathname !== '') || !url.hostname || url.port) {
    throw new Error('Expected a dedicated HTTPS Engine Room origin without credentials or paths');
  }
  return new URL('/api/telemetry', url).href;
}
export async function reportGreenCommit(env, fetcher = fetch, now = () => Date.now()) {
  const origin = env.ENGINE_ROOM_TELEMETRY_URL;
  const keyId = env.ENGINE_ROOM_TELEMETRY_KEY_ID;
  const secret = env.ENGINE_ROOM_TELEMETRY_SECRET;
  if (!origin && !keyId && !secret) return { status: 'unconfigured' };
  if (!origin || !keyId || !secret) throw new Error('Engine Room CI telemetry is only partially configured');
  if (env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY !== 'neophilism/SceneSignal') throw new Error('Repository mismatch');
  const envelope = candidateEnvelope(env.SCENESIGNAL_COMMIT_SHA);
  const body = JSON.stringify(envelope);
  const headers = signedTelemetryHeaders(keyId, secret, body, String(now()));
  const response = await fetcher(telemetryEndpoint(origin), {
    method: 'POST', headers, body, signal: AbortSignal.timeout(15000), redirect: 'error'
  });
  if (!response.ok) throw new Error('Engine Room CI telemetry rejected: HTTP ' + response.status);
  return { status: 'submitted', sha: envelope.records[0].commitSha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await reportGreenCommit(process.env);
    if (result.status === 'unconfigured') console.log('Engine Room CI telemetry unconfigured; no claim sent.');
    else console.log('Submitted scoped CI candidate record for ' + result.sha);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Telemetry report failed');
    process.exitCode = 1;
  }
}
