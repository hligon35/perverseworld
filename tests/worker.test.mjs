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
test('public catalog excludes retired rows even before the archive migration runs',async()=>{
 const row=id=>({id,name:'Item '+id,description:'Product',category:'hoodies',price_cents:6500,image_url:'builtin:'+id,active:1});
 const env={...base,DB:{prepare:()=>({all:async()=>({results:[1,2,3,4,5,6].map(row)})})}};
 const response=await worker.fetch(new Request('https://perverseworld.com/api/products'),env);
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).products.map(p=>p.id),[2,3,4,5]);
});
test('built-in catalog supplies new images, galleries and approved set prices to old and migrated rows',async()=>{
 const records=[
  {id:2,name:'Worldscape Tee',description:'White / landscape print',category:'tees',price_cents:3800,image_url:'builtin:2',active:1},
  {id:3,name:'Green Flame Set',description:'Gray / matching streetwear',category:'sets',price_cents:7800,image_url:'builtin:3',active:1},
  {id:5,name:'World Logo Set',description:'Set',category:'sets',price_cents:4500,image_url:'builtin:5',active:1,options_json:'[{"id":"hoodie","price_cents":6500},{"id":"sweats","price_cents":4500}]'}
 ];
 const env={...base,DB:{prepare:()=>({all:async()=>({results:records})})}};
 const rows=(await (await worker.fetch(new Request('https://perverseworld.com/api/products'),env)).json()).products;
 assert.equal(rows[0].price,28);assert.equal(rows[1].price,28);assert.equal(rows[1].name,'Perverse Puppeteer Tee');
 assert.match(rows[0].img,/worldscape-tee-front\.jpeg$/);assert.equal(rows[0].images.length,3);
 assert.equal(rows[2].price,45);assert.deepEqual(rows[2].options.map(p=>p.price),[65,45]);
 assert.match(rows[2].options[1].img,/world-logo-sweats-front\.jpeg$/);
 records[2].image_url='https://example.com/custom-set.jpg';
 const custom=(await (await worker.fetch(new Request('https://perverseworld.com/api/products'),env)).json()).products[2];
 assert.equal(custom.img,'https://example.com/custom-set.jpg');assert.equal(custom.options.length,2);assert.equal(custom.slug,'world-logo-set');
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
  for(const path of ['/admin/','/admin/index.html','/admin/admin.js']){
   const response=await worker.fetch(new Request('https://perverseworld.com'+path,{headers:{'cf-access-jwt-assertion':input+'.'+signature}}),env);
   assert.equal(response.status,200);assert.equal(await response.text(),path==='/admin/'?'/admin':path);
   assert.equal((await worker.fetch(new Request('https://perverseworld.com'+path),env)).status,401);
  }
  let saved=null,writes=0;
  env.DB={prepare:sql=>({bind(...values){saved={sql,values};return this;},async run(){writes++;return {meta:{changes:1}};}})};
  const body={name:'World Logo Set',category:'sets',price_cents:4500,image_url:'builtin:5',sizes:{M:10},option_prices:[{id:'hoodie',price_cents:6500},{id:'sweats',price_cents:4500}]};
  const save=payload=>worker.fetch(new Request('https://perverseworld.com/api/admin/products/5',{method:'PUT',headers:{'content-type':'application/json',origin:'https://perverseworld.com','cf-access-jwt-assertion':input+'.'+signature},body:JSON.stringify(payload)}),env);
  assert.equal((await save(body)).status,200);assert.match(saved.sql,/options_json/);
  assert.deepEqual(JSON.parse(saved.values[7]),body.option_prices);
  assert.equal((await save({...body,option_prices:[{id:'sweats',price_cents:-1}]})).status,400);
  assert.equal(writes,1);
 }finally{globalThis.fetch=original}
});

test('admin entry URLs reach the apex Access-protected path before authentication',async()=>{
 let assets=0;
 const env={...base,ASSETS:{fetch:async()=>{assets++;return new Response('PRIVATE')}}};
 for(const [input,location] of [
  ['https://perverseworld.com/admin','https://perverseworld.com/admin/'],
  ['https://www.perverseworld.com/admin','https://perverseworld.com/admin/'],
  ['https://www.perverseworld.com/admin/','https://perverseworld.com/admin/'],
  ['https://www.perverseworld.com/admin/admin.js','https://perverseworld.com/admin/admin.js']
 ]){
  const response=await worker.fetch(new Request(input),env);
  assert.equal(response.status,308);assert.equal(response.headers.get('location'),location);
 }
 assert.equal(assets,0);
 assert.equal((await worker.fetch(new Request('https://perverseworld.com/admin/'),env)).status,503);
 assert.equal((await worker.fetch(new Request('https://www.perverseworld.com/api/admin/session'),env)).status,503);
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
