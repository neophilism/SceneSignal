import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Engine Room approved manifest names this repository and agrees with its planned PR grouping', () => {
  const text = readFileSync('.exechub/project.yml', 'utf8');
  const repo = text.match(/^  repository: (.+)$/m)?.[1];
  const approved = text.match(/^  approved: (.+)$/m)?.[1];
  const planned = Number(text.match(/^  planned_prs: (\d+)$/m)?.[1]);
  const counts = [...text.matchAll(/^    prs: (\d+)$/gm)].map(match => Number(match[1]));
  assert.equal(repo, 'neophilism/SceneSignal');
  assert.equal(approved, 'true');
  assert.equal(planned, 16);
  assert.deepEqual(counts, [4,4,4,4]);
  assert.equal(counts.reduce((a,b)=>a+b,0), planned);
  const roadmap = JSON.parse(readFileSync('docs/roadmap.json', 'utf8'));
  assert.equal(roadmap.items.filter(item => item.id.startsWith('SS-')).length, 32);
  assert.equal(roadmap.counts.SceneSignal, 32);
});
