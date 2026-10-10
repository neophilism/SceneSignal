import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Render draft preview publishes the Vite output only after repository checks', () => {
  const spec = readFileSync('render.yaml','utf8');
  const vite = readFileSync('vite.config.mjs','utf8');
  assert.match(spec, /runtime: static/);
  assert.match(spec, /branch: main/);
  assert.match(spec, /staticPublishPath: web-dist/);
  assert.match(spec, /npm run core:prepare && npm ci --ignore-scripts && npm run check/);
  assert.match(vite, /outDir: '\.\.\/web-dist'/);
  assert.match(spec, /NODE_VERSION\s*\n\s*value: 24\.19\.0/);
  assert.doesNotMatch(spec, /DATABASE_URL|GITHUB_APP_PRIVATE_KEY|SECRET|privateKey|apiKey/);
});
