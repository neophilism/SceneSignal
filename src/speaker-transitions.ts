import { finite, identifier, integer, invariant } from '@neophilism/distributed-audio-engine';
import type { MixPlan } from '@neophilism/distributed-audio-engine';

function validate(plan: MixPlan): void {
  identifier(plan.sceneId); integer(plan.revision, 1);
  invariant(plan.sourceIds.length > 0 && plan.sourceIds.length <= 256 &&
    plan.speakerIds.length <= 4096, 'INVALID_SCENE_MIX');
  invariant(new Set(plan.sourceIds).size === plan.sourceIds.length &&
    new Set(plan.speakerIds).size === plan.speakerIds.length, 'DUPLICATE_MIX_ID');
  for (const id of [...plan.sourceIds, ...plan.speakerIds]) identifier(id);
  invariant(Object.keys(plan.gains).length === plan.speakerIds.length &&
    Object.keys(plan.ceilings).length === plan.speakerIds.length, 'INVALID_MIX_TOPOLOGY');
  for (const speaker of plan.speakerIds) {
    const row = Object.hasOwn(plan.gains, speaker) ? plan.gains[speaker] : undefined;
    const ceiling = plan.ceilings[speaker];
    invariant(row && Object.keys(row).length === plan.sourceIds.length, 'INVALID_MIX_ROW');
    finite(ceiling!, 0, 1);
    let sum = 0;
    for (const source of plan.sourceIds) {
      invariant(Object.hasOwn(row, source), 'MISSING_SOURCE_GAIN');
      const gain = row[source]!; finite(gain, 0, 1); sum += gain;
    }
    invariant(sum <= ceiling! + 1e-12, 'MIX_EXCEEDS_CEILING');
  }
}
function compatible(current: MixPlan, next: MixPlan): void {
  invariant(current.sceneId === next.sceneId &&
    JSON.stringify(current.sourceIds) === JSON.stringify(next.sourceIds), 'SCENE_SOURCE_TOPOLOGY_CHANGED');
}
/** At a topology change, audio is never routed to removed/consent-revoked outputs. */
export class SceneSpeakerTransition {
  private target: MixPlan | undefined;
  private previous: MixPlan | undefined;
  private startMs = 0;
  private latestMs = 0;
  constructor(private readonly durationMs = 1500) { integer(durationMs, 1, 10000); }
  private observe(nowMs: number): void { integer(nowMs, this.latestMs); this.latestMs = nowMs; }
  private silent(plan: MixPlan): MixPlan {
    const copy = structuredClone(plan);
    for (const speaker of copy.speakerIds) for (const source of copy.sourceIds) copy.gains[speaker]![source] = 0;
    return copy;
  }
  /** Source changes need a separate authorized timeline revision, not an implicit topology fade. */
  setTarget(next: MixPlan, nowMs: number): void {
    this.observe(nowMs); validate(next);
    const baseline = this.target ? this.sampleInternal(nowMs).plan : this.silent(next);
    compatible(baseline, next);
    this.previous = structuredClone(baseline);
    this.target = structuredClone(next);
    this.startMs = nowMs;
  }
  private sampleInternal(nowMs: number): {
    plan: MixPlan; progress: number; transitioning: boolean; fieldValidated: false
  } {
    const target = this.target; invariant(target, 'NO_MIX_TARGET');
    const previous = this.previous;
    if (!previous) return { plan: structuredClone(target), progress: 1, transitioning: false, fieldValidated: false };
    const progress = Math.min(1, (nowMs - this.startMs) / this.durationMs);
    finite(progress, 0, 1);
    // Target is the authoritative list: revoked or absent speakers disappear immediately.
    const plan = structuredClone(target);
    for (const speaker of plan.speakerIds) {
      const oldRow = previous.gains[speaker];
      const row = plan.gains[speaker]!;
      let sum = 0;
      for (const source of plan.sourceIds) {
        const prior = oldRow?.[source] ?? 0;
        row[source] = prior * (1 - progress) + row[source]! * progress;
        sum += row[source]!;
      }
      // The NEW ceiling is authoritative, including when it was reduced mid-transition.
      const ceiling = plan.ceilings[speaker]!;
      if (sum > ceiling && sum > 0) for (const source of plan.sourceIds) row[source] = row[source]! * ceiling / sum;
    }
    validate(plan);
    return { plan, progress, transitioning: progress < 1, fieldValidated: false };
  }
  at(nowMs: number): { plan: MixPlan; progress: number; transitioning: boolean; fieldValidated: false } {
    this.observe(nowMs);
    return this.sampleInternal(nowMs);
  }
  clear(): void { this.previous = undefined; this.target = undefined; }
}
