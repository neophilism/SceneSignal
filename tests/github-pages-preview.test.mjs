import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('public Pages deploy builds only the approved static draft and requires checks', () => {
  const workflow=readFileSync('.github/workflows/deploy-pages.yml','utf8');
  const vite=readFileSync('vite.config.mjs','utf8');
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/SCENESIGNAL_STATIC_BASE_PATH: \/SceneSignal\//);
  assert.match(workflow,/npm run core:prepare/);
  assert.match(workflow,/npm ci --ignore-scripts/);
  assert.match(workflow,/npm run check/);
  assert.match(workflow,/path: web-dist/);
  assert.match(workflow,/needs: build/);
  assert.match(workflow,/pages: write/);
  assert.match(workflow,/id-token: write/);
  assert.match(vite,/\['\/', '\/SceneSignal\/'\]/);
  assert.doesNotMatch(workflow,/ENGINE_ROOM_TELEMETRY_SECRET|DATABASE_URL|privateKey|API_KEY/);
});
test('both private server authorization and real speaker activation remain absent from public preview', () => {
  const page=readFileSync('web/app.ts','utf8');
  assert.match(page,/Local drafting actor has no remote identity/);
  assert.match(page,/This local draft cannot activate a public session/);
  assert.match(page,/Draft data produces no live reporting or contribution rewards/);
});
