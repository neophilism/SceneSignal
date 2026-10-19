import {integer, invariant} from '@neophilism/distributed-audio-engine';
import type {PublicSessionPage} from './discovery.js';

/** Printable and screen-reader text built ONLY from already-authorized public projection fields. */
export function accessibleVisitorGuide(page: PublicSessionPage): string {
  invariant(page.freeAdmission === true, 'VISITOR_GUIDE_NOT_FREE');
  integer(page.startsAtMs);integer(page.endsAtMs,page.startsAtMs+1);
  invariant(Number.isFinite(new Date(page.startsAtMs).getTime()) &&
    Number.isFinite(new Date(page.endsAtMs).getTime()), 'INVALID_PUBLIC_EVENT_TIME');
  invariant(Array.isArray(page.lineup) && page.lineup.length<=100,
    'VISITOR_GUIDE_TOO_MANY_PERFORMERS');
  const safe=(value:string)=>value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
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
