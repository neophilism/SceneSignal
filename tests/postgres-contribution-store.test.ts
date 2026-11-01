import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PostgresSessionContributionStore,SessionContributionLedger} from '../src/index.js';
import type {ContributionSqlPool,VerifiedSessionContribution} from '../src/index.js';

const scope={tenantId:'tenant',sessionId:'session',application:'scenesignal' as const};
const fact:VerifiedSessionContribution={eventId:'event-1',tenantId:'tenant',sessionId:'session',
  speakerId:'speaker',contributorId:'contributor',seconds:30,verifiedAtMs:1000};

/** Contract fixture only. Real PostgreSQL isolation/rollback require a
 * database integration test before enabling contribution-backed rewards. */
function sqlFixture(){
  const committed=new Map<string,VerifiedSessionContribution>();
  const calls:Array<{sql:string;params?:readonly unknown[]}>=[];let releases=0;
  const key=(tenant:string,session:string,event:string)=>JSON.stringify([tenant,session,event]);
  const pool={async connect(){
    let pending:VerifiedSessionContribution[]=[];
    return {async query(sql:string,params:readonly unknown[]=[]){
      calls.push({sql,params});
      let rows:unknown[]=[];
      if(sql==='COMMIT'){for(const item of pending)committed.set(key(item.tenantId,item.sessionId,item.eventId),item);pending=[];}
      else if(sql==='ROLLBACK')pending=[];
      else if(sql.startsWith('SELECT speaker_id')){
        const saved=committed.get(key(String(params[0]),String(params[1]),String(params[2])));
        if(saved)rows=[{speaker_id:saved.speakerId,contributor_id:saved.contributorId,
          seconds:String(saved.seconds),verified_at_ms:String(saved.verifiedAtMs)}];
      }else if(sql.startsWith('SELECT (SELECT COUNT')){
        const items=[...committed.values()].filter(x=>x.tenantId===params[0]&&x.sessionId===params[1]);
        rows=[{record_count:String(items.length),credited:String(items.filter(x=>x.contributorId===params[2])
          .reduce((sum,x)=>sum+x.seconds,0))}];
      }else if(sql.startsWith('INSERT INTO scene_contribution_events')){
        pending.push({tenantId:String(params[0]),sessionId:String(params[1]),eventId:String(params[2]),
          speakerId:String(params[3]),contributorId:String(params[4]),seconds:Number(params[5]),
          verifiedAtMs:Number(params[6])});
      }else if(sql.startsWith('SELECT contributor_id')){
        const totals=new Map<string,number>();
        for(const item of committed.values())if(item.tenantId===params[0]&&item.sessionId===params[1])
          totals.set(item.contributorId,(totals.get(item.contributorId)??0)+item.seconds);
        rows=[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([contributor_id,credited])=>
          ({contributor_id,credited:String(credited)}));
      }
      return {rows,rowCount:rows.length};
    },release(){releases++;}};
  }} as unknown as ContributionSqlPool;
  return {pool,calls,committed,releases:()=>releases};
}
test('durable adapter persists scoped receipt and deduplicates across instances',async()=>{
  const f=sqlFixture();
  const first=new PostgresSessionContributionStore(f.pool);
  const second=new PostgresSessionContributionStore(f.pool);
  assert.deepEqual(await first.admit(scope,fact,60,10000),{creditedSeconds:30,duplicate:false});
  assert.deepEqual(await second.admit(scope,fact,60,10000),{creditedSeconds:30,duplicate:true});
  assert.deepEqual(await second.summary(scope),[{contributorId:'contributor',creditedSeconds:30}]);
  assert.equal(f.committed.size,1);
  assert.equal(f.calls.filter(q=>q.sql.includes('pg_advisory_xact_lock')).length,2);
  assert.equal(f.releases(),3);
});
test('durable adapter denies replay mutation and keeps source scope isolated',async()=>{
  const f=sqlFixture(),store=new PostgresSessionContributionStore(f.pool);
  await store.admit(scope,fact,60,10000);
  await assert.rejects(store.admit(scope,{...fact,seconds:31},60,10000),/CONTRIBUTION_REPLAY_CONFLICT/);
  assert.equal(f.committed.size,1);
  const other={...scope,sessionId:'other-session'};
  assert.deepEqual(await store.admit(other,{...fact,sessionId:'other-session'},60,10000),
    {creditedSeconds:30,duplicate:false});
  assert.deepEqual(await store.summary(scope),[{contributorId:'contributor',creditedSeconds:30}]);
  assert.equal(f.committed.size,2);
});
test('durable cap and record-limit rejections roll back without credit',async()=>{
  const f=sqlFixture(),store=new PostgresSessionContributionStore(f.pool);
  await store.admit(scope,fact,60,1);
  await assert.rejects(store.admit(scope,{...fact,eventId:'second-event'},60,1),/CONTRIBUTION_CREDIT_LIMIT/);
  await assert.rejects(store.admit(scope,{...fact,eventId:'third-event',seconds:31},60,100),
    /CONTRIBUTION_CREDIT_LIMIT/);
  assert.equal(f.committed.size,1);
  assert.ok(f.calls.filter(q=>q.sql==='ROLLBACK').length>=2);
});
test('ledger delegates only verified scoped facts and never falls back on storage failures',async()=>{
  const f=sqlFixture(),store=new PostgresSessionContributionStore(f.pool);
  const ledger=new SessionContributionLedger(scope,async()=>fact,60,store);
  assert.deepEqual(await ledger.admit('opaque-secret-receipt',1100),{creditedSeconds:30,duplicate:false});
  assert.throws(()=>ledger.summary(),/PERSISTED_SUMMARY_REQUIRES_ASYNC/);
  assert.deepEqual(await ledger.summaryAuthoritative(),[{contributorId:'contributor',creditedSeconds:30}]);
  assert.equal(JSON.stringify(f.calls).includes('opaque-secret-receipt'),false);
  const failing=new SessionContributionLedger(scope,async()=>fact,60,{
    admit:async()=>{throw Error('DB_UNAVAILABLE');},summary:async()=>[]});
  await assert.rejects(failing.admit('opaque-secret-receipt',1100),/DB_UNAVAILABLE/);
  assert.throws(()=>failing.summary(),/PERSISTED_SUMMARY_REQUIRES_ASYNC/);
});
