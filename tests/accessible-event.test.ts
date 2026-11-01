import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessibleVisitorGuide,accessibleVisitorHtml} from '../src/index.js';
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

test('public directions cannot contain bidirectional override control characters',()=>{
 const text=accessibleVisitorGuide({...page,eventArea:'West\u202e entrance'});
 assert.ok(!text.includes('\u202e'));
 assert.match(text,/West entrance/);
});

test('static large-print HTML requires no device or JavaScript and escapes untrusted public copy',()=>{
 const html=accessibleVisitorHtml({...page,summary:'Free <img src=x onerror=alert(1)>',
   eventArea:'North & east',accessibilitySummary:'No quiet route published.'});
 assert.match(html,/<!doctype html><html lang="en">/);
 assert.match(html,/<main id="guide">/);
 assert.match(html,/<h1>Free SceneSignal event<\/h1>/);
 assert.match(html,/font-size:22px/);
 assert.match(html,/@media print/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/North &amp; east/);
 assert.ok(!html.includes('<script'));
 assert.ok(!html.includes('<img'));
});
test('public guide bounds oversized or non-string details before rendering',()=>{
 assert.throws(()=>accessibleVisitorHtml({...page,summary:'A'.repeat(2001)}),/INVALID_PUBLIC_VISITOR_COPY/);
 assert.throws(()=>accessibleVisitorGuide({...page,lineup:[{stageName:'A'.repeat(161)}] as PublicSessionPage['lineup']}),/VISITOR_GUIDE_TOO_MANY_PERFORMERS/);
});
