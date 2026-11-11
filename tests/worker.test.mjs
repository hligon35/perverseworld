import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
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