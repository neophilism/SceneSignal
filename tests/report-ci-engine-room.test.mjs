import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { candidateEnvelope, signedTelemetryHeaders, telemetryEndpoint, reportGreenCommit } from '../scripts/report-ci-engine-room.mjs';

const sha = 'a'.repeat(40);
const secret = 'this-test-only-value-is-long-enough-for-hmac';
test('candidate telemetry describes a source revision, never a live release or uptime', () => {
  assert.deepEqual(candidateEnvelope(sha), {
    version: 1,
    deliveryId: 'scenesignal.ci.' + sha,
    records: [{ kind: 'release', key: 'scenesignal-source-' + sha, commitSha: sha }]
  });
  assert.throws(() => candidateEnvelope('not-a-commit'));
  const record = candidateEnvelope(sha).records[0];
  assert.deepEqual(Object.keys(record).sort(), ['commitSha', 'key', 'kind']);
  assert.equal(Object.hasOwn(record, 'event'), false);
  assert.equal(Object.hasOwn(record, 'metric'), false);
});
test('Engine Room signature covers exact timestamp and bytes', () => {
  const body = JSON.stringify(candidateEnvelope(sha));
  const ts = '1790000000000';
  const headers = signedTelemetryHeaders('scenesignal-ci', secret, body, ts);
  assert.equal(headers['X-Engine-Room-Signature'],
    'sha256=' + createHmac('sha256', secret).update(ts + '.').update(body).digest('hex'));
  assert.throws(() => signedTelemetryHeaders('scenesignal-ci', 'short', body, ts));
  assert.throws(() => signedTelemetryHeaders('bad key', secret, body, ts));
});
test('no credentials means no network request, partial credentials fail closed', async () => {
  let calls = 0;
  const spy = async () => { calls++; return { ok: true, status: 202 }; };
  assert.deepEqual(await reportGreenCommit({}, spy), { status: 'unconfigured' });
  await assert.rejects(reportGreenCommit({ ENGINE_ROOM_TELEMETRY_URL: 'https://example.com' }, spy));
  assert.equal(calls, 0);
});
test('only HTTPS origin is accepted; no user info, path, query, or insecure scheme', () => {
  assert.equal(telemetryEndpoint('https://engine-room.example'), 'https://engine-room.example/api/telemetry');
  for (const url of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com?q=1','https://example.com/#token']) assert.throws(() => telemetryEndpoint(url));
});
test('the scoped release candidate submits using the prescribed adapter envelope and never includes secret', async () => {
  let received;
  const env = {
    SCENESIGNAL_COMMIT_SHA: sha, GITHUB_REPOSITORY: 'neophilism/SceneSignal',
    ENGINE_ROOM_TELEMETRY_URL: 'https://engine-room.example',
    ENGINE_ROOM_TELEMETRY_KEY_ID: 'scenesignal-ci',
    ENGINE_ROOM_TELEMETRY_SECRET: secret
  };
  const result = await reportGreenCommit(env, async (url, options) => {
    received = { url, options };
    return { ok: true, status: 202 };
  }, () => 1790000000000);
  assert.deepEqual(result, { status: 'submitted', sha });
  assert.equal(received.url, 'https://engine-room.example/api/telemetry');
  assert.deepEqual(JSON.parse(received.options.body), candidateEnvelope(sha));
  assert.equal(received.options.headers['X-Engine-Room-Timestamp'], '1790000000000');
  assert.doesNotMatch(received.options.body, /this-test-only-value/);
  await assert.rejects(reportGreenCommit({ ...env, GITHUB_REPOSITORY: 'other/repo' }, async () => { throw Error('Should never post'); }));
});
