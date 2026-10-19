import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessibleVisitorGuide} from '../src/index.js';
import type {PublicSessionPage} from '../src/index.js';
const page:PublicSessionPage={sessionId:'event',summary:'A free show',startsAtMs:1000,
 endsAtMs:2000,freeAdmission:true,lineup:[],accessibilitySummary:null,eventArea:null,listingRevision:1};
test('printable non-device guidance includes only known public facts',()=>{
 const guide=accessibleVisitorGuide(page);
 assert.match(guide,/free/i);assert.match(guide,/do not need a phone or an account/i);
 assert.match(guide,/not yet been published/i);
 assert.ok(!guide.includes('Private permit'));
});
test('public copy strips control characters and rejects invalid schedules',()=>{
 const text=accessibleVisitorGuide({...page,summary:'A\nB\u0000C',accessibilitySummary:'Quiet rest zone is at the marked gate.'});
 assert.match(text,/A B C/);
 assert.match(text,/marked gate/);
 assert.ok(!text.includes('\u0000'));
 assert.throws(()=>accessibleVisitorGuide({...page,endsAtMs:1000}));
});

test('invalid date ranges cannot produce a misleading public event guide',()=>{
 assert.throws(()=>accessibleVisitorGuide({...page,startsAtMs:9000000000000000,
   endsAtMs:9000000000001000}),/INVALID_PUBLIC_EVENT_TIME/);
});
