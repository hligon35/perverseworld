import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {newsletterTemplate} from '../public/assets/js/newsletter-template.js';
import {verifyResendWebhook,importResendEmail} from '../src/mail.js';
import {analyticsPeriod} from '../src/analytics.js';

const base={PUBLIC_BASE_URL:'https://perverseworld.com',ADMIN_ACCESS_ISSUER:'https://admin-tests.cloudflareaccess.com',ADMIN_ACCESS_AUD:'test-app',ADMIN_ALLOWED_EMAILS:'owner@example.com',INBOUND_DOMAIN:'perverseworld.com',INBOUND_ADDRESS:'info@perverseworld.com'};
test('admin analytics combines real activity, compares periods and counts set stock once per piece',async()=>{
 await signedAdmin(async(env,request)=>{
  const period=analyticsPeriod('7'),queries=[];
  env.DB={prepare:sql=>({bind(...args){queries.push({sql,args});return this;},async first(){if(sql.includes('MIN(day)'))return {started:period.previousStart};return {total:5,active:4,unsubscribed:1};},async all(){
   if(sql.includes('FROM daily_analytics'))return {results:[{day:period.previousStart,event:'page_view',path:'/',product_id:0,count:4},{day:period.end,event:'page_view',path:'/shop',product_id:0,count:8},{day:period.end,event:'add_to_bag',path:'/shop',product_id:5,count:2}]};
   if(sql.includes('FROM subscribers'))return {results:[{day:period.end,count:3},{day:period.previousStart,count:1}]};
   if(sql.includes('FROM submissions'))return {results:[{day:period.end,count:2}]};
   if(sql.includes('FROM mailbox'))return {results:[{day:period.end,direction:'inbound',count:1},{day:period.end,direction:'outbound',count:2}]};
   if(sql.includes('FROM newsletter_deliveries'))return {results:[{day:period.end,count:2}]};
   if(sql.includes('FROM newsletters'))return {results:[{id:1,subject:'The next drop',status:'sending',sent:2}]};
   if(sql.includes('FROM products'))return {results:[{id:5,name:'World Logo Set',description:'Set',category:'sets',price_cents:4500,image_url:'builtin:5',active:1,sizes_json:'{"M":100}',options_json:'[{"id":"hoodie","price_cents":6500,"sizes":{"M":0}},{"id":"sweats","price_cents":4500,"sizes":{"M":2}}]'}]};throw Error('Unexpected SQL '+sql);
  }})};
  const response=await worker.fetch(request('/api/admin/analytics?days=7'),env);assert.equal(response.status,200);const report=await response.json();assert.equal(report.current.views,8);assert.equal(report.previous.views,4);assert.equal(report.current.bagAdds,2);assert.equal(report.current.signups,3);assert.equal(report.previous.signups,1);assert.equal(report.current.enquiries,2);assert.equal(report.current.inbound,1);assert.equal(report.current.campaignEmails,2);assert.equal(report.daily.length,7);assert.equal(report.daily[0].views,0);assert.deepEqual(report.pages,[{path:'/shop',views:8}]);assert.equal(report.inventory.units,2);assert.equal(report.inventory.low,1);assert.equal(report.inventory.soldOut,1);assert.equal(report.inventory.activeProducts,1);assert.equal(report.inventory.attention[0].name,'World Logo Hoodie');assert.equal(report.products[0].name,'World Logo Set');assert.equal(report.audience.active,4);
  assert.ok(queries.every(query=>!query.sql.includes('SELECT email')));assert.equal((await worker.fetch(request('/api/admin/analytics?days=400'),env)).status,400);assert.equal((await worker.fetch(new Request(base.PUBLIC_BASE_URL+'/api/admin/analytics'),env)).status,401);
 });
});
async function signedAdmin(fn){
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid=crypto.randomUUID();
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),input=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:base.ADMIN_ACCESS_ISSUER,aud:['test-app'],email:'owner@example.com',iat:now,exp:now+300});
 const jwt=input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');const original=globalThis.fetch;
 globalThis.fetch=async url=>{if(String(url).endsWith('/cdn-cgi/access/certs'))return Response.json({keys:[jwk]});throw Error('Unexpected fetch '+url);};
 const request=(path,method='GET',body,headers={})=>new Request('https://perverseworld.com'+path,{method,headers:{origin:base.PUBLIC_BASE_URL,'cf-access-jwt-assertion':jwt,...headers},...(body===undefined?{}:{body:typeof body==='object'&&!(body instanceof Uint8Array)?JSON.stringify(body):body})});
 // Each callback reuses its key; use a unique issuer to avoid another test's JWKS cache.
 const env={...base,ADMIN_ACCESS_ISSUER:'https://'+jwk.kid+'.cloudflareaccess.com'};
 const payload=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:env.ADMIN_ACCESS_ISSUER,aud:['test-app'],email:'owner@example.com',iat:now,exp:now+300});
 const actualJWT=payload+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(payload))).toString('base64url');
 try{await fn(env,(...args)=>{const r=request(...args);r.headers.set('cf-access-jwt-assertion',actualJWT);return r;},original);}finally{globalThis.fetch=original;}
}

test('product uploads require Access, validate content, preserve bytes and serve only public image keys',async()=>{
 await signedAdmin(async(env,request)=>{
  let stored;env.DB={};env.PRODUCT_IMAGES={put:async(key,bytes,metadata)=>{stored={key,bytes,metadata};},get:async key=>stored?.key===key?{body:stored.bytes,httpEtag:'"test"',writeHttpMetadata:headers=>headers.set('content-type',stored.metadata.httpMetadata.contentType)}:null};
  const bytes=new Uint8Array([255,216,255,224,0,1]);
  const res=await worker.fetch(request('/api/admin/media','POST',bytes,{'content-type':'image/jpeg'}),env);assert.equal(res.status,201);const {src}=await res.json();assert.match(src,/^\/media\/products\/[a-f0-9-]{36}\.jpg$/);assert.deepEqual(stored.bytes,bytes);
  const image=await worker.fetch(new Request(base.PUBLIC_BASE_URL+src),env);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),bytes);
  assert.equal((await worker.fetch(new Request(base.PUBLIC_BASE_URL+src,{headers:{'if-none-match':'"test"'}}),env)).status,304);
  assert.equal((await worker.fetch(request('/api/admin/media','POST','<svg/>',{'content-type':'image/svg+xml'}),env)).status,415);
  assert.equal((await worker.fetch(request('/api/admin/media','POST','<script/>',{'content-type':'image/png'}),env)).status,415);
  assert.equal((await worker.fetch(request('/api/admin/media','POST',new Uint8Array(5*1024*1024+1),{'content-type':'image/png'}),env)).status,413);
  assert.equal((await worker.fetch(new Request(base.PUBLIC_BASE_URL+'/api/admin/media',{method:'POST',body:bytes}),env)).status,401);
  assert.equal((await worker.fetch(new Request(base.PUBLIC_BASE_URL+'/media/private/mail.eml'),env)).status,404);
 });
});

test('custom ordered galleries and option sizes survive saves and public catalog projection',async()=>{
 await signedAdmin(async(env,request)=>{
  const images=[{src:'/media/products/11111111-1111-4111-8111-111111111111.png',label:'Shop'},{src:'/assets/images/world-logo-hoodie-back.jpeg',label:'Back',optionId:'hoodie'},{src:'/assets/images/world-logo-hoodie-front.jpeg',label:'Front',optionId:'hoodie'}];
  let saved;const row={id:5,name:'World Logo Set',description:'Set',category:'sets',price_cents:4500,image_url:'builtin:5',active:1};
  env.DB={prepare:sql=>({bind(...values){saved={sql,values};return this;},async run(){return {meta:{changes:1}};},async all(){return {results:[row]};}})};
  const payload={name:row.name,category:'sets',price_cents:4500,image_url:'builtin:5',sizes:{XS:3,XL:0},images,option_prices:[{id:'hoodie',price_cents:6500},{id:'sweats',price_cents:4500}],option_sizes:{hoodie:{XS:2,XL:0},sweats:{XS:8}}};
  assert.equal((await worker.fetch(request('/api/admin/products/5','PUT',payload),env)).status,200);assert.deepEqual(JSON.parse(saved.values[9]),images);row.sizes_json=saved.values[6];row.options_json=saved.values[7];row.images_json=saved.values[9];
  const response=await worker.fetch(new Request(base.PUBLIC_BASE_URL+'/api/products'),env),product=(await response.json()).products[0];assert.equal(product.img,images[0].src);assert.equal(product.options[0].images[0].label,'Back');assert.equal(product.options[0].sizes.XS,2);assert.equal(product.options[1].sizes.XS,8);
  assert.equal((await worker.fetch(request('/api/admin/products/5','PUT',{...payload,images:[{src:'javascript:alert(1)',label:'Bad'}]}),env)).status,400);
  assert.equal((await worker.fetch(request('/api/admin/products/5','PUT',{...payload,option_sizes:{hoodie:{XL:-1}}}),env)).status,400);
 });
});

test('mailbox folders search with bound parameters and return paginated snippets, then full messages',async()=>{
 await signedAdmin(async(env,request)=>{
  const queries=[];env.DB={prepare:sql=>({bind(...values){queries.push({sql,values});return this;},async first(){return sql.includes('COUNT')?{count:61}:{id:9,body_text:'Full email body',status:'unread'};},async all(){return {results:[{id:9,snippet:'Hello'}]};}})};
  const response=await worker.fetch(request('/api/admin/mailbox?folder=unread&q=50%25&page=1'),env),result=await response.json();assert.equal(response.status,200);assert.equal(result.page,1);assert.equal(result.total,61);assert.match(queries[0].sql,/direction='inbound' AND status='unread'/);assert.equal(queries[0].values[0],'%50\\%%');assert.equal(queries[1].values.at(-1),50);assert.doesNotMatch(queries[1].sql,/SELECT \*/);
  assert.equal((await worker.fetch(request('/api/admin/mailbox?folder=invalid'),env)).status,400);const full=await worker.fetch(request('/api/admin/mailbox/9'),env);assert.equal((await full.json()).item.body_text,'Full email body');
 });
});

test('newsletter delivery uses the same branded renderer as the preview and a personal unsubscribe link',async()=>{
 await signedAdmin(async(env,request)=>{
  const letter={id:1,subject:'New drop',preheader:'First access',body_html:'<h1>Wear your world</h1>'},person={id:2,email:'reader@example.com',unsub_token:'a'.repeat(48)};let delivered;
  env.FROM_EMAIL='updates@perverseworld.com';env.RESEND_API_KEY='test-key';env.DB={prepare:sql=>({bind(){return this;},async first(){return sql.includes('FROM newsletters')?letter:{n:0};},async all(){return {results:[person]};},async run(){return {meta:{changes:1}};}})};
  const previous=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url)==='https://api.resend.com/emails'?(delivered=JSON.parse(options.body),Response.json({id:'sent-1'})):previous(url,options);
  const response=await worker.fetch(request('/api/admin/newsletters/1/send','POST',{}),env);assert.equal(response.status,200);assert.equal((await response.json()).sent,1);assert.equal(delivered.html,newsletterTemplate({...letter,baseURL:base.PUBLIC_BASE_URL,unsubscribeURL:base.PUBLIC_BASE_URL+'/unsubscribe?token='+person.unsub_token}));assert.match(delivered.html,/perverse-world-logo.png/);assert.match(delivered.html,/First access/);assert.match(delivered.text,/Wear your world/);assert.match(newsletterTemplate({subject:'<unsafe>'}),/&lt;unsafe&gt;/);
 });
});

test('Cloudflare mail ingestion decodes MIME subjects and base64 text, rejecting other recipients',async()=>{
 let values;const env={...base,DB:{prepare:()=>({bind(...args){values=args;return this;},async run(){return {meta:{changes:1}};}})}};
 const raw='From: buyer@example.com\r\nTo: info@perverseworld.com\r\nSubject: =?UTF-8?B?SGVsbG8g8J+Riw==?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Buffer.from('Hello!\nQuestion about sizes.').toString('base64');
 const make=to=>({to,from:'buyer@example.com',raw:new Response(raw).body,headers:new Headers({'message-id':'<mail-1@example.com>'}),setReject(reason){this.rejected=reason;}});
 await worker.email(make('info@perverseworld.com'),env);assert.equal(values[2],'Hello 👋');assert.equal(values[3],'Hello!\nQuestion about sizes.');const rejected=make('other@perverseworld.com');await worker.email(rejected,env);assert.match(rejected.rejected,/Recipient/);
});

test('Resend receiving verifies raw signatures and timestamps, imports only info mail and deduplicates retries',async()=>{
 const secret=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']),timestamp=String(Math.floor(Date.now()/1000)),payload=JSON.stringify({type:'email.received',data:{email_id:'11111111-1111-4111-8111-111111111111'}}),id='msg_test';
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+'.'+timestamp+'.'+payload))).toString('base64');const env={...base,RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from(secret).toString('base64'),RESEND_API_KEY:'test'};
 const request=(body=payload,time=timestamp)=>new Request(base.PUBLIC_BASE_URL+'/api/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':time,'svix-signature':'v1,'+signature},body});
 assert.equal((await verifyResendWebhook(request(),env)).event.type,'email.received');assert.equal((await verifyResendWebhook(request(payload+' '),env)).status,401);assert.equal((await verifyResendWebhook(request(payload,'1'),env)).status,401);
 let row=null,calls=0;env.DB={prepare:()=>({bind(...values){this.values=values;return this;},async first(){return row;},async run(){row={id:1,values:this.values};return {meta:{changes:1}};}})};
 const previous=globalThis.fetch;try{globalThis.fetch=async()=>{calls++;return Response.json({from:'Customer <buyer@example.com>',to:['info@perverseworld.com'],subject:'Sizing',text:'Do you have XL?',message_id:'<mail2@example.com>',created_at:'2026-11-12T12:00:00Z'});};assert.equal(await importResendEmail(env,'11111111-1111-4111-8111-111111111111'),true);assert.equal(await importResendEmail(env,'11111111-1111-4111-8111-111111111111'),false);assert.equal(calls,1);assert.equal(row.values[0],'buyer@example.com');assert.equal(row.values[3],'Do you have XL?');}finally{globalThis.fetch=previous;}
});
