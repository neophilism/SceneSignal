import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneSession, SceneCommerce } from '../src/index.js';
import type { SceneActor, SitePlan } from '../src/index.js';
const scope={tenantId:'label',application:'scenesignal' as const,sessionId:'event'};
const plan:SitePlan={siteId:'site',revision:1,conditionsDigestHex:'a'.repeat(64),startsAtMs:10000,endsAtMs:20000,maximumLinearGain:0.4,publicSummary:'Concert'};
const actor=(id:string,roles:SceneActor['roles']):SceneActor=>({tenantId:'label',sessionId:'event',identityId:id,roles,expiresAtMs:30000});
const organizer=actor('organizer',['organizer']),buyer=actor('buyer',['performer']);
const make=()=>new SceneCommerce(new SceneSession(scope,plan,()=>{}));
const album={id:'offer',artistId:'artist',albumId:'album',publicTitle:'Full Album',priceCents:1200,artistShareBps:7000,privateRightsReference:'secret-rights'};
const intent={id:'purchase',buyerId:'buyer',artistId:'artist',kind:'album' as const,albumId:'album',amountCents:1200,currency:'USD' as const,createdAtMs:1000};
test('published album projection excludes rights and private revenue terms',()=>{
  const c=make();assert.throws(()=>c.addAlbum(buyer,album,500));
  c.addAlbum(organizer,album,500);
  assert.equal(JSON.stringify(c.publicAlbums()).includes('secret-rights'),false);
  assert.equal(JSON.stringify(c.publicAlbums()).includes('artistShareBps'),false);
});
test('payment fulfillment requires trusted matching receipt, never a pending intent',async()=>{
  const c=make();c.addAlbum(organizer,album,500);
  assert.throws(()=>c.startPurchase(actor('wrong',['performer']),intent,1000));
  c.startPurchase(buyer,intent,1000);assert.deepEqual(c.privatePurchases(organizer,1001),[]);
  await assert.rejects(c.confirmPurchase(organizer,'purchase',{verify:async()=>({providerTransactionId:'tx',purchaseId:'purchase',amountCents:1199,currency:'USD',status:'paid',confirmedAtMs:1100})},1200));
  const paid=await c.confirmPurchase(organizer,'purchase',{verify:async()=>({providerTransactionId:'tx',purchaseId:'purchase',amountCents:1200,currency:'USD',status:'paid',confirmedAtMs:1100})},1200);
  assert.equal(paid.intent.id,'purchase');
  await assert.rejects(c.confirmPurchase(organizer,'purchase',{verify:async()=>paid.receipt},1201));
  assert.equal(c.privatePurchases(organizer,1202).length,1);
});
test('support donations require positive amount, album orders require exact offer price',()=>{
  const c=make();c.addAlbum(organizer,album,500);
  assert.throws(()=>c.startPurchase(buyer,{...intent,amountCents:1},1000));
  assert.throws(()=>c.startPurchase(buyer,{...intent,kind:'voluntary-support',albumId:null,amountCents:0},1000));
  c.startPurchase(buyer,{...intent,id:'support',kind:'voluntary-support',albumId:null,amountCents:250},1000);
});
