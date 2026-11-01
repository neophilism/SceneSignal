import {integer, invariant} from '@neophilism/distributed-audio-engine';
import type {PublicSessionPage} from './discovery.js';

/** Printable and screen-reader text built ONLY from already-authorized public projection fields. */
export function accessibleVisitorGuide(page: PublicSessionPage): string {
  invariant(page.freeAdmission === true, 'VISITOR_GUIDE_NOT_FREE');
  integer(page.startsAtMs);integer(page.endsAtMs,page.startsAtMs+1);
  invariant(Number.isFinite(new Date(page.startsAtMs).getTime()) &&
    Number.isFinite(new Date(page.endsAtMs).getTime()), 'INVALID_PUBLIC_EVENT_TIME');
  invariant(Array.isArray(page.lineup) && page.lineup.length<=100 &&
    page.lineup.every(item=>typeof item.stageName==='string'&&item.stageName.length<=160),
    'VISITOR_GUIDE_TOO_MANY_PERFORMERS');
  invariant(typeof page.summary==='string'&&page.summary.length<=2000 &&
    (page.eventArea===null||(typeof page.eventArea==='string'&&page.eventArea.length<=180)) &&
    (page.accessibilitySummary===null||(typeof page.accessibilitySummary==='string'&&page.accessibilitySummary.length<=700)),
    'INVALID_PUBLIC_VISITOR_COPY');
  const safe=(value:string)=>value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/[\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim();
  const lines=[
    'Free SceneSignal event',
    safe(page.summary),
    'Starts (UTC): '+new Date(page.startsAtMs).toISOString(),
    'Ends (UTC): '+new Date(page.endsAtMs).toISOString(),
    'Admission is free. You do not need a phone or an account to attend.'
  ];
  if(page.eventArea)lines.push('Public event area: '+safe(page.eventArea));
  if(page.lineup.length)lines.push('Performers: '+page.lineup.map(item=>safe(item.stageName)).join(', '));
  if(page.accessibilitySummary)lines.push('Accessibility information: '+safe(page.accessibilitySummary));
  else lines.push('Accessibility details have not yet been published; do not assume a quiet route or accessible path is available.');
  return lines.join('\n');
}

/** Portable static large-print/no-script guide. Only already-authorized
 * public copy enters the DOM; every value is HTML-escaped after normalization. */
export function accessibleVisitorHtml(page: PublicSessionPage): string {
  const lines=accessibleVisitorGuide(page).split('\n');
  const escape=(value:string)=>value.replace(/[&<>"']/g,character=>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
  const summary=escape(lines[1]!);
  const details=lines.slice(2).map(line=>'<li>'+escape(line)+'</li>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>SceneSignal public visitor guide</title>'+
    '<style>html{font-size:22px}body{font-family:system-ui,Arial,sans-serif;'+
    'color:#111;background:white;line-height:1.65;margin:0;padding:1.5rem;'+
    'overflow-wrap:anywhere}main{max-width:48rem;margin:auto}h1{font-size:1.6rem;line-height:1.25}'+
    'li{margin-block:0.7rem}a:focus{outline:3px solid #111}'+
    '@media print{html{font-size:18pt}body{padding:0}main{max-width:none}}</style>'+
    '</head><body><main id="guide"><h1>'+escape(lines[0]!)+'</h1>'+
    '<p>'+summary+'</p><h2>Event details and access</h2><ul>'+details+
    '</ul><p>Ask an event organizer about any unpublished accessibility arrangements.</p>'+
    '</main></body></html>';
}
