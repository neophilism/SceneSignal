import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePrivateEvidence, uploadPrivateEvidence } from '../src/index.js';
const scope={tenantId:'t',application:'scenesignal' as const,sessionId:'s'};
const actor={tenantId:'t',sessionId:'s',identityId:'organizer',roles:['organizer' as const],expiresAtMs:10000};
test('permit preparation encrypts at the organizer endpoint and relay receives no filename, private manifest or key',async()=>{
  const plaintext=new TextEncoder().encode('PRIVATE PERMIT REFERENCE AND SITE DETAILS');const a=await preparePrivateEvidence(actor,scope,plaintext,'private-permit.pdf','application/pdf',1000);const b=await preparePrivateEvidence(actor,scope,plaintext,'private-permit.pdf','application/pdf',1000);
  assert.notEqual(a.attachment.privateManifest.attachmentKeyHex,b.attachment.privateManifest.attachmentKeyHex);
  let observed:unknown;let channelCalls=0;const reference=await uploadPrivateEvidence(actor,scope,a,{async put(value){observed=value;}},{async send(manifest,context){channelCalls++;assert.equal(context.parentMessageId,'s');assert.equal(manifest.filename,'private-permit.pdf');}},1000,10000);
  assert.deepEqual(reference,a.reference);assert.equal(channelCalls,1);const relay=observed as Record<string,unknown>;assert.deepEqual(Object.keys(relay).sort(),['application','ciphertextChunks','ciphertextDigestHex','expiresAtMs','objectId','tenantId']);
  assert.equal(JSON.stringify(relay).includes('PRIVATE PERMIT'),false);assert.equal(JSON.stringify(relay).includes(a.attachment.privateManifest.attachmentKeyHex),false);
});
test('tampered, substituted, oversized, cross-role and excessive-retention evidence never reaches relay or manifest channel',async()=>{
  const a=await preparePrivateEvidence(actor,scope,new TextEncoder().encode('private'),'p.pdf','application/pdf',1000);let calls=0;const relay={async put(){calls++;}},channel={async send(){calls++;}};
  a.attachment.ciphertextChunks[0]![0]=a.attachment.ciphertextChunks[0]![0]!^1;await assert.rejects(uploadPrivateEvidence(actor,scope,a,relay,channel,1000,10000));assert.equal(calls,0);
  await assert.rejects(preparePrivateEvidence({...actor,roles:['performer' as const]},scope,new Uint8Array([1]),'p.pdf','application/pdf',1000));
  const b=await preparePrivateEvidence(actor,scope,new Uint8Array([1]),'p.pdf','application/pdf',1000);await assert.rejects(uploadPrivateEvidence(actor,{...scope,sessionId:'other'},b,relay,channel,1000,10000));await assert.rejects(uploadPrivateEvidence(actor,scope,b,relay,channel,1000,1000+31*86400000));
});
