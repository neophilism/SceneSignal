import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('producer runbook contains every real-world role and explicit denial gates',async()=>{
 const text=await readFile('docs/producer-runbook.md','utf8');
 for(const heading of ['## Organizer','## Operator','## Performer',
   '## Contributor','## Release evidence ledger','## Rehearsal versus release'])
   assert.ok(text.includes(heading),'Missing '+heading);
 assert.match(text,/NOT QUALIFIED FOR PUBLIC LIVE SPEAKER DEPLOYMENT/);
 assert.match(text,/SS-30 10–20-output pilot/);
 assert.match(text,/SS-31 staged scale acoustic qualification/);
 assert.match(text,/successful current-head CI/);
 assert.match(text,/human owner signs the release record/i);
 assert.match(text,/never certify hardware/i);
 assert.ok(!/^- \[x\]/m.test(text),'No unevidenced gate may be marked passed');
});
