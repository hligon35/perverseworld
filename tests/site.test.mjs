import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {routes} from '../src/site/routes.js';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('all routes contain complete, distinct static content without page-switching scripts',async()=>{
  const sizes=[];
  for(const route of routes){
    const html=await read(`dist/${route.path==='/'?'index':route.path.slice(1)}.html`);
    assert.match(html,new RegExp(`data-site-page="${route.page}"`));
    assert.equal((html.match(/<h1[ >]/g)||[]).length,1,route.path);
    assert.match(html,new RegExp(`rel="canonical" href="https://perverseworld.com${route.path}"`));
    assert.match(html,/alphazonelabs\.com/);assert.match(html,/brand-ui\.css/);
    assert.doesNotMatch(html,/data:image|site-pages|onclick=|style=|{{\w+}}|<style>|<script>/);
    assert.equal(html.includes('id="contactForm"'),route.page==='contact');
    assert.equal(html.includes('id="signup"'),['home','about'].includes(route.page));
    const cards=html.match(/<article class="product">/g)||[];
    assert.equal(cards.length,route.page==='home'?3:route.page==='shop'?6:route.category?2:0,route.path);
    if(route.category){
      const data=JSON.parse(await read('src/site/products.json'));
      for(const p of data)assert.equal(html.includes(`<div class="product-name">${p.name}</div>`),p.cat===route.category);
    }
    for(const [,asset] of html.matchAll(/(?:src|href)="(\/(?:assets\/|brand-ui)[^"]*)"/g))assert.ok((await stat(new URL('../dist'+asset,import.meta.url))).isFile(),asset);
    sizes.push(html.length);
  }
  assert.ok(Math.max(...sizes)<25000,'Pages must not duplicate embedded image data');
});
test('unknown URLs use a 404 document and protected routes always execute the Worker',async()=>{
  const config=await read('wrangler.toml');
  assert.match(config,/not_found_handling = "404-page"/);
  assert.match(config,/run_worker_first = \["\/api\/\*", "\/admin", "\/admin\/\*", "\/unsubscribe"\]/);
  assert.doesNotMatch(await read('public/assets/css/pages.css'),/display:none/);
});
test('automatic Cloudflare releases fail before bundling with unverified production configuration',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/prepare-worker.mjs',import.meta.url))],{env:{...process.env,WORKERS_CI:'1',CLOUDFLARE_CONFIGURATION_VERIFIED:''},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Deployment blocked/);
  assert.doesNotMatch(result.stdout,/Built 8/);
});
