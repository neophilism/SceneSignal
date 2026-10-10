import { identifier, integer, invariant } from '@neophilism/distributed-audio-engine';
import { requireSceneRole } from './session.js';
import type { SceneActor, SceneSession } from './session.js';

export interface AlbumOffer {
  id: string; artistId: string; albumId: string; publicTitle: string;
  priceCents: number; artistShareBps: number; privateRightsReference: string;
}
export type PurchaseKind = 'album' | 'voluntary-support';
export interface PurchaseIntent {
  id: string; buyerId: string; artistId: string; kind: PurchaseKind;
  albumId: string | null; amountCents: number; currency: 'USD'; createdAtMs: number;
}
export interface VerifiedPaymentReceipt {
  providerTransactionId: string; purchaseId: string; amountCents: number;
  currency: 'USD'; status: 'paid'; confirmedAtMs: number;
}
export interface PaymentVerifier {
  /** Trusted verifier uses provider credentials SERVER-SIDE, not a browser acknowledgement. */
  verify(purchaseId: string): Promise<VerifiedPaymentReceipt>;
}
export interface PurchaseResult { intent: PurchaseIntent; receipt: VerifiedPaymentReceipt }
/**
 * Portable album commerce ledger, not a payment gateway. Never issue download
 * keys or credits for pending intents or unverifiable client callbacks.
 * Actual fulfillment also checks rights and verified payment entitlements.
 */
export class SceneCommerce {
  private readonly offers=new Map<string,AlbumOffer>();
  private readonly pending=new Map<string,PurchaseIntent>();
  private readonly paid=new Map<string,PurchaseResult>();
  private readonly transactionIds=new Set<string>();
  constructor(private readonly session:SceneSession){}
  addAlbum(actor:SceneActor,offer:AlbumOffer,nowMs:number):void {
    requireSceneRole(actor,this.session.snapshot().scope,['organizer'],nowMs);
    for(const id of [offer.id,offer.artistId,offer.albumId,offer.privateRightsReference])identifier(id);
    invariant(typeof offer.publicTitle==='string'&&offer.publicTitle.trim().length>0&&offer.publicTitle.length<=180,'INVALID_ALBUM_TITLE');
    integer(offer.priceCents,0,1000000000);integer(offer.artistShareBps,0,10000);
    invariant(!this.offers.has(offer.id),'DUPLICATE_ALBUM_OFFER');
    this.offers.set(offer.id,structuredClone(offer));
  }
  publicAlbums():Array<{id:string;artistId:string;albumId:string;publicTitle:string;priceCents:number;currency:'USD'}>{
    return [...this.offers.values()].map(o=>({id:o.id,artistId:o.artistId,albumId:o.albumId,publicTitle:o.publicTitle,priceCents:o.priceCents,currency:'USD'}));
  }
  startPurchase(actor:SceneActor,intent:PurchaseIntent,nowMs:number):void {
    requireSceneRole(actor,this.session.snapshot().scope,['performer','organizer','operator','steward'],nowMs);
    for(const id of [intent.id,intent.buyerId,intent.artistId])identifier(id);
    invariant(intent.buyerId===actor.identityId && intent.currency==='USD' && intent.createdAtMs===nowMs,'PURCHASE_IDENTITY_OR_CURRENCY');
    invariant(!this.pending.has(intent.id) && !this.paid.has(intent.id),'DUPLICATE_PURCHASE');
    integer(intent.amountCents,0,1000000000);integer(nowMs);
    if(intent.kind==='album'){
      invariant(typeof intent.albumId==='string','MISSING_ALBUM_ID');
      const album=[...this.offers.values()].find(o=>o.albumId===intent.albumId&&o.artistId===intent.artistId);
      invariant(album&&album.priceCents===intent.amountCents,'INVALID_ALBUM_PURCHASE');
    } else {
      invariant(intent.kind==='voluntary-support'&&intent.albumId===null&&intent.amountCents>0,'INVALID_VOLUNTARY_SUPPORT');
    }
    this.pending.set(intent.id,structuredClone(intent));
  }
  async confirmPurchase(actor:SceneActor,id:string,verifier:PaymentVerifier,nowMs:number):Promise<PurchaseResult>{
    requireSceneRole(actor,this.session.snapshot().scope,['organizer','operator'],nowMs);
    const pending=this.pending.get(id);invariant(pending,'UNKNOWN_PENDING_PURCHASE');
    const receipt=await verifier.verify(id);
    invariant(receipt.status==='paid'&&receipt.purchaseId===id&&receipt.amountCents===pending.amountCents&&receipt.currency==='USD'&&receipt.confirmedAtMs<=nowMs,'PAYMENT_RECEIPT_INVALID');
    identifier(receipt.providerTransactionId);integer(receipt.confirmedAtMs);
    invariant(!this.transactionIds.has(receipt.providerTransactionId),'PAYMENT_REPLAY');
    // A pending record might be cancelled or concurrently finalized while awaiting verification.
    invariant(this.pending.get(id)===pending && !this.paid.has(id),'PAYMENT_CONFIRMATION_SUPERSEDED');
    const result={intent:structuredClone(pending),receipt:structuredClone(receipt)};
    this.transactionIds.add(receipt.providerTransactionId);this.paid.set(id,result);this.pending.delete(id);
    return structuredClone(result);
  }
  privatePurchases(actor:SceneActor,nowMs:number):PurchaseResult[]{
    requireSceneRole(actor,this.session.snapshot().scope,['organizer'],nowMs);
    return structuredClone([...this.paid.values()]);
  }
}
