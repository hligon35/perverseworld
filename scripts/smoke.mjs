// Run against `npm run dev` after `npm run db:local`. No production writes.
import assert from 'node:assert/strict';
import {routes} from '../src/site/routes.js';
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
for(const path of ['/admin','/admin/','/admin/admin.js','/api/admin/products']){
  assert.ok([401,503].includes((await fetch(base+path)).status),path);
}
const config=await (await fetch(base+'/api/config')).json();
assert.deepEqual(Object.keys(config),['turnstileSiteKey']);
const products=await (await fetch(base+'/api/products')).json();assert.equal(products.products.length,6);
console.log('Local Worker smoke checks passed: eight routes, trailing slashes, 404, protected admin assets/API, config and seeded D1 catalog.');
