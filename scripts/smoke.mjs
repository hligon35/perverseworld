// Run against `npm run dev` after `npm run db:local`. No production writes.
import assert from 'node:assert/strict';
import {routes,legacyRedirects} from '../src/site/routes.js';
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:8787';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('Smoke checks must target a local preview.');
for(const route of routes){
  for(const suffix of route.path==='/'?['']:['','/']){
    const response=await fetch(base+route.path+suffix);
    assert.equal(response.status,200,route.path+suffix);
    assert.ok((await response.text()).includes(`data-site-page="${route.page}"`),route.path);
  }
}
assert.equal((await fetch(base+'/not-a-real-page')).status,404);
for(const [path,destination] of Object.entries(legacyRedirects)){
  const response=await fetch(base+path,{redirect:'manual'});
  assert.equal(response.status,301,path);
  assert.equal(response.headers.get('location'),base+destination,path);
}
const adminEntry=await fetch(base+'/admin',{redirect:'manual'});
assert.equal(adminEntry.status,308);
// Wrangler may rewrite the canonical production redirect to the local dev origin.
assert.ok([base+'/admin/','https://perverseworld.com/admin/'].includes(adminEntry.headers.get('location')));
for(const path of ['/admin/','/admin/admin.js','/api/admin/products']){
  const response=await fetch(base+path,{redirect:'manual'});
  if(response.status===308&&path.startsWith('/admin/')){
    // The public-origin canonical redirect also applies to local admin visits.
    assert.ok([base+path,'https://perverseworld.com'+path].includes(response.headers.get('location')),path);
  }else assert.ok([401,503].includes(response.status),path);
}
const config=await (await fetch(base+'/api/config')).json();
assert.deepEqual(Object.keys(config),['turnstileSiteKey']);
const products=await (await fetch(base+'/api/products')).json();assert.equal(products.products.length,4);
assert.ok(products.products.every(product=>![1,6].includes(product.id)));
console.log('Local Worker smoke checks passed: three pages, legacy redirects, trailing slashes, 404, protected admin assets/API, config and seeded D1 catalog.');
