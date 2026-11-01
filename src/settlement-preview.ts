import {identifier,integer,invariant} from '@neophilism/distributed-audio-engine';
import type {Scope} from '@neophilism/distributed-audio-engine';
import {requireSceneRole} from './session.js';
import type {SceneActor} from './session.js';

export interface SettlementPaymentFact {
  transactionId:string;artistId:string;grossCents:number;
  currency:'USD';confirmedAtMs:number;
}
export interface SettlementCostFact {
  expenseId:string;category:'SITE'|'EQUIPMENT'|'SAFETY'|'OTHER';
  amountCents:number;currency:'USD';approved:boolean;
}
export interface SettlementParticipationFact {
  eventId:string;contributorId:string;verifiedSeconds:number;
}
export interface VerifiedSettlementBatch {
  tenantId:string;sessionId:string;asOfMs:number;
  payments:SettlementPaymentFact[];
  costs:SettlementCostFact[];
  participation:SettlementParticipationFact[];
}
/** Trusted server verifier binds actual payment, expense and contribution
 * evidence to this session. Browser-provided estimates are not accepted. */
export type SettlementBatchVerifier=(scope:Scope,nowMs:number)=>
  Promise<VerifiedSettlementBatch|null>;

/** Endpoint-only financial RECONCILIATION PREVIEW. Does not settle, transfer,
 * distribute money, mint credits, or infer earnings from participations. */
export class SessionSettlementPreview {
  private readonly scope:Scope;
  constructor(scope:Scope,private readonly verify:SettlementBatchVerifier){
    invariant(scope.application==='scenesignal','INVALID_SCENE_APPLICATION');
    identifier(scope.tenantId);identifier(scope.sessionId);
    this.scope=structuredClone(scope);
  }
  async report(actor:SceneActor,nowMs:number){
    requireSceneRole(actor,this.scope,['organizer'],nowMs);
    const facts=await this.verify(structuredClone(this.scope),nowMs);
    invariant(facts&&typeof facts==='object'&&!Array.isArray(facts)&&
      Object.keys(facts).sort().join(',')===
      'asOfMs,costs,participation,payments,sessionId,tenantId',
      'SETTLEMENT_EVIDENCE_UNVERIFIED');
    invariant(facts.tenantId===this.scope.tenantId&&facts.sessionId===this.scope.sessionId,
      'SETTLEMENT_SCOPE_DENIED');
    integer(facts.asOfMs);
    invariant(facts.asOfMs<=nowMs&&nowMs-facts.asOfMs<=300000,
      'SETTLEMENT_EVIDENCE_STALE');
    invariant(Array.isArray(facts.payments)&&facts.payments.length<=10000&&
      Array.isArray(facts.costs)&&facts.costs.length<=10000&&
      Array.isArray(facts.participation)&&facts.participation.length<=10000,
      'SETTLEMENT_EVIDENCE_TOO_LARGE');
    const transactions=new Set<string>(),expenses=new Set<string>(),observations=new Set<string>();
    const perArtist=new Map<string,number>();
    let grossCents=0,costCents=0,verifiedParticipationSeconds=0;
    for(const p of facts.payments){
      invariant(p&&typeof p==='object'&&!Array.isArray(p)&&
        Object.keys(p).sort().join(',')==='artistId,confirmedAtMs,currency,grossCents,transactionId',
        'INVALID_SETTLEMENT_PAYMENT');
      identifier(p.transactionId);identifier(p.artistId);
      invariant(p.currency==='USD'&&!transactions.has(p.transactionId),'SETTLEMENT_PAYMENT_REPLAY');
      transactions.add(p.transactionId);
      integer(p.grossCents,0,1000000000);
      integer(p.confirmedAtMs,0,nowMs);
      grossCents+=p.grossCents;
      perArtist.set(p.artistId,(perArtist.get(p.artistId)??0)+p.grossCents);
      invariant(Number.isSafeInteger(grossCents)&&grossCents<=1000000000000,
        'SETTLEMENT_TOTAL_OVERFLOW');
    }
    for(const cost of facts.costs){
      invariant(cost&&typeof cost==='object'&&!Array.isArray(cost)&&
        Object.keys(cost).sort().join(',')==='amountCents,approved,category,currency,expenseId',
        'INVALID_SETTLEMENT_COST');
      identifier(cost.expenseId);
      invariant(!expenses.has(cost.expenseId)&&cost.currency==='USD'&&cost.approved===true&&
        ['SITE','EQUIPMENT','SAFETY','OTHER'].includes(cost.category),
        'SETTLEMENT_COST_NOT_APPROVED');
      expenses.add(cost.expenseId);
      integer(cost.amountCents,0,1000000000);
      costCents+=cost.amountCents;
      invariant(Number.isSafeInteger(costCents)&&costCents<=1000000000000,
        'SETTLEMENT_TOTAL_OVERFLOW');
    }
    for(const item of facts.participation){
      invariant(item&&typeof item==='object'&&!Array.isArray(item)&&
        Object.keys(item).sort().join(',')==='contributorId,eventId,verifiedSeconds',
        'INVALID_SETTLEMENT_PARTICIPATION');
      identifier(item.eventId);identifier(item.contributorId);
      invariant(!observations.has(item.eventId),'SETTLEMENT_PARTICIPATION_REPLAY');
      observations.add(item.eventId);
      integer(item.verifiedSeconds,1,300);
      verifiedParticipationSeconds+=item.verifiedSeconds;
      invariant(Number.isSafeInteger(verifiedParticipationSeconds)&&
        verifiedParticipationSeconds<=3000000,'SETTLEMENT_TOTAL_OVERFLOW');
    }
    return {scope:{tenantId:this.scope.tenantId,sessionId:this.scope.sessionId},
      asOfMs:facts.asOfMs,currency:'USD' as const,grossCents,costCents,
      netBeforeDistributionCents:grossCents-costCents,
      artistGross:[...perArtist.entries()].map(([artistId,grossCents])=>({artistId,grossCents}))
        .sort((a,b)=>a.artistId.localeCompare(b.artistId)),
      verifiedParticipationSeconds,
      distributionExecuted:false as const,fieldValidated:false as const};
  }
}
