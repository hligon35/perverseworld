import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {legacyRedirects} from '../src/site/routes.js';
const base={PUBLIC_BASE_URL:'https://perverseworld.com',ASSETS:{fetch:async()=>new Response('STATIC',{status:200})}};
test('public site serves static assets',async()=>{
 const res=await worker.fetch(new Request('https://perverseworld.com/'),base);
 assert.equal(res.status,200);assert.equal(await res.text(),'STATIC');
});
test('admin must fail closed without Access configuration',async()=>{
 const res=await worker.fetch(new Request('https://perverseworld.com/admin/'),base);
 assert.equal(res.status,503);assert.match((await res.json()).error,/not configured/);
});
test('public config does not expose secrets',async()=>{
 const res=await worker.fetch(new Request('https://perverseworld.com/api/config'),{...base,TURNSTILE_SITE_KEY:'public-site-key',TURNSTILE_SECRET:'private'});
 assert.deepEqual(await res.json(),{turnstileSiteKey:'public-site-key'});
});
test('rejects cross-origin mutations',async()=>{
 const res=await worker.fetch(new Request('https://perverseworld.com/api/submissions',{method:'POST',headers:{origin:'https://evil.example'}}),base);
 assert.equal(res.status,403);
});
test('unconfigured mailbox is not publicly exposed',async()=>{
 const res=await worker.fetch(new Request('https://perverseworld.com/api/admin/mailbox'),base);
 assert.equal(res.status,503);
});
test('dedicated storefront URLs pass through to their own static document',async()=>{
 for(const pathname of ['/','/shop','/shop/','/contact','/contact/','/missing']){
  let requested='';
  const env={...base,ASSETS:{fetch:async request=>{requested=new URL(request.url).pathname;return new Response('STORE',{status:200})}}};
  const res=await worker.fetch(new Request('https://perverseworld.com'+pathname),env);
  assert.equal(res.status,200,pathname);
  assert.equal(requested,pathname,pathname);
 }
});
test('old About and Collections bookmarks redirect to the consolidated pages',async()=>{
 for(const [path,destination] of Object.entries(legacyRedirects)){
  for(const suffix of ['','/']){
   const response=await worker.fetch(new Request('https://perverseworld.com'+path+suffix),base);
   assert.equal(response.status,301);
   assert.equal(response.headers.get('location'),'https://perverseworld.com'+destination);
  }
 }
});
test('public page routing does not bypass admin authentication',async()=>{
 const res=await worker.fetch(new Request('https://perverseworld.com/admin/'),base);
 assert.equal(res.status,503);
});

test('signed Access identity can load dashboard and JavaScript as separate protected assets',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';
 const issuer='https://asset-tests.cloudflareaccess.com',now=Math.floor(Date.now()/1000);
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:issuer,aud:['test-app'],email:'owner@example.com',iat:now,exp:now+300});
 const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  const env={...base,ADMIN_ACCESS_ISSUER:issuer,ADMIN_ACCESS_AUD:'test-app',ADMIN_ALLOWED_EMAILS:'owner@example.com',ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname)}};
  for(const path of ['/admin','/admin/','/admin/index.html','/admin/admin.js']){
   const response=await worker.fetch(new Request('https://perverseworld.com'+path,{headers:{'cf-access-jwt-assertion':input+'.'+signature}}),env);
   assert.equal(response.status,200);assert.equal(await response.text(),path);
   assert.equal((await worker.fetch(new Request('https://perverseworld.com'+path),env)).status,401);
  }
 }finally{globalThis.fetch=original}
});

const verificationEnv={
 ...base,TURNSTILE_SITE_KEY:'example-site-key',TURNSTILE_SECRET:'example-secret',
 DB:{prepare:()=>({bind(){return this},async run(){return {success:true}}})}
};
const signup=(token)=>new Request('https://perverseworld.com/api/newsletter/subscribe',{
 method:'POST',headers:{'content-type':'application/json',origin:'https://perverseworld.com'},
 body:JSON.stringify({email:'test@example.com',turnstileToken:token})
});
const contact=(token)=>new Request('https://perverseworld.com/api/submissions',{
 method:'POST',headers:{'content-type':'application/json',origin:'https://perverseworld.com'},
 body:JSON.stringify({name:'Customer',email:'test@example.com',subject:'Question',message:'Hello',turnstileToken:token})
});
test('Turnstile fails closed when a credential is missing',async()=>{
 for(const env of [{...verificationEnv,TURNSTILE_SECRET:''},{...verificationEnv,TURNSTILE_SITE_KEY:''}]){
  const r=await worker.fetch(signup('token'),env);
  assert.equal(r.status,503);
 }
});
test('Turnstile requires tokens on both public forms',async()=>{
 for(const req of [signup(''),contact('')]){
  const r=await worker.fetch(req,verificationEnv);
  assert.equal(r.status,403);
 }
});
test('Turnstile validates hostname and purpose before database writes',async()=>{
 const original=globalThis.fetch;
 let writes=0,verifications=0;
 const env={...verificationEnv,DB:{prepare:()=>({bind(){return this},async run(){writes++;return {success:true}}})}};
 try{
  globalThis.fetch=async()=>{verifications++;return Response.json({success:true,hostname:'malicious.example',action:'newsletter'})};
  assert.equal((await worker.fetch(signup('fake-token'),env)).status,403);
  globalThis.fetch=async()=>{verifications++;return Response.json({success:true,hostname:'perverseworld.com',action:'contact'})};
  assert.equal((await worker.fetch(signup('fake-token'),env)).status,403);
  globalThis.fetch=async()=>{verifications++;return Response.json({success:false,hostname:'perverseworld.com',action:'newsletter'})};
  assert.equal((await worker.fetch(signup('fake-token'),env)).status,403);
  assert.equal(writes,0);
  assert.equal(verifications,3);
  globalThis.fetch=async()=>Response.json({success:true,hostname:'perverseworld.com',action:'newsletter'});
  assert.equal((await worker.fetch(signup('verified-token'),env)).status,200);
  globalThis.fetch=async()=>Response.json({success:true,hostname:'perverseworld.com',action:'contact'});
  assert.equal((await worker.fetch(contact('verified-token'),env)).status,200);
  assert.equal(writes,2);
 }finally{globalThis.fetch=original}
});
