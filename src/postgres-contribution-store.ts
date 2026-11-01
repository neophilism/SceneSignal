import type {Scope} from '@neophilism/distributed-audio-engine';
import type {VerifiedSessionContribution,DurableContributionStore} from './session-contribution.js';

/** Minimal adapter surface; an authorized endpoint supplies a real PostgreSQL
 * pool. This module never opens a connection or handles credentials itself. */
export interface ContributionSqlResult<T> {rows: T[];rowCount: number | null}
export interface ContributionSqlClient {
  query<T=Record<string,unknown>>(sql: string, params?: readonly unknown[]): Promise<ContributionSqlResult<T>>;
  release(): void;
}
export interface ContributionSqlPool {connect(): Promise<ContributionSqlClient>}
type Saved = {speaker_id:string;contributor_id:string;seconds:string;verified_at_ms:string};
type Counts = {record_count:string;credited:string};
const whole=(value:unknown):number=>{
  const parsed=Number(value);
  if(!Number.isSafeInteger(parsed)||parsed<0)throw Error('INVALID_CONTRIBUTION_STORE_RESULT');
  return parsed;
};

/** Transactional, scoped and idempotent across endpoint instances sharing
 * PostgreSQL. An advisory transaction lock serializes even absent-row races.
 * No raw receipt, identity token or measurement payload is persisted. */
export class PostgresSessionContributionStore implements DurableContributionStore {
  constructor(private readonly pool:ContributionSqlPool) {}
  async admit(scope:Scope,claim:VerifiedSessionContribution,capSeconds:number,maxRecords:number){
    const db=await this.pool.connect();
    try{
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [JSON.stringify([scope.tenantId,scope.sessionId])]);
      const keys=[scope.tenantId,scope.sessionId,claim.eventId];
      const existing=await db.query<Saved>(
        'SELECT speaker_id,contributor_id,seconds::text,verified_at_ms::text FROM scene_contribution_events '+
        'WHERE tenant_id=$1 AND session_id=$2 AND event_id=$3 FOR UPDATE',keys);
      const totals=await db.query<Counts>(
        'SELECT (SELECT COUNT(*)::text FROM scene_contribution_events WHERE tenant_id=$1 AND session_id=$2) AS record_count, '+
        '(SELECT COALESCE(SUM(seconds),0)::bigint::text FROM scene_contribution_events '+
        'WHERE tenant_id=$1 AND session_id=$2 AND contributor_id=$3) AS credited',
        [scope.tenantId,scope.sessionId,claim.contributorId]);
      const counts=totals.rows[0];
      if(!counts)throw Error('INVALID_CONTRIBUTION_STORE_RESULT');
      const count=whole(counts.record_count),credited=whole(counts.credited);
      const prior=existing.rows[0];
      if(prior){
        if(prior.speaker_id!==claim.speakerId||
           prior.contributor_id!==claim.contributorId||
           whole(prior.seconds)!==claim.seconds||
           whole(prior.verified_at_ms)!==claim.verifiedAtMs)
          throw Error('CONTRIBUTION_REPLAY_CONFLICT');
        await db.query('COMMIT');
        return {creditedSeconds:credited,duplicate:true};
      }
      if(count>=maxRecords||credited+claim.seconds>capSeconds)
        throw Error('CONTRIBUTION_CREDIT_LIMIT');
      await db.query('INSERT INTO scene_contribution_events '+
        '(tenant_id,session_id,event_id,speaker_id,contributor_id,seconds,verified_at_ms) '+
        'VALUES($1,$2,$3,$4,$5,$6,$7)',
        [...keys,claim.speakerId,claim.contributorId,claim.seconds,claim.verifiedAtMs]);
      await db.query('COMMIT');
      return {creditedSeconds:credited+claim.seconds,duplicate:false};
    }catch(error){
      try{await db.query('ROLLBACK');}catch{ /* preserve original error */ }
      throw error;
    }finally{db.release();}
  }
  async summary(scope:Scope){
    const db=await this.pool.connect();
    try{
      const result=await db.query<{contributor_id:string;credited:string}>(
        'SELECT contributor_id,COALESCE(SUM(seconds),0)::bigint::text AS credited FROM scene_contribution_events '+
        'WHERE tenant_id=$1 AND session_id=$2 GROUP BY contributor_id ORDER BY contributor_id',
        [scope.tenantId,scope.sessionId]);
      return result.rows.map(row=>({contributorId:row.contributor_id,
        creditedSeconds:whole(row.credited)}));
    }finally{db.release();}
  }
}
