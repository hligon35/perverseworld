import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {routes} from '../src/site/routes.js';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import catalog from '../src/site/products.json' with {type:'json'};
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('admin build includes analytics component and both protected and public analytics modules',async()=>{
 const html=await read('dist/admin/index.html');assert.match(html,/data-page="analytics"/);assert.match(html,/data-view="analytics"/);assert.match(html,/id="analyticsRange"/);assert.doesNotMatch(html,/<!-- admin-analytics -->/);
 for(const path of ['dist/admin/analytics.js','dist/assets/js/analytics.js'])assert.ok((await stat(new URL('../'+path,import.meta.url))).size>0,path);
 for(const name of ['index','shop','contact'])assert.match(await read('dist/'+name+'.html'),/src="\/assets\/js\/analytics.js"/);
});
test('all routes contain complete, distinct static content without page-switching scripts',async()=>{
  assert.deepEqual(routes.map(route=>route.path),['/','/shop','/contact']);
  const sizes=[];
  for(const route of routes){
    const html=await read(`dist/${route.path==='/'?'index':route.path.slice(1)}.html`);
    assert.match(html,new RegExp(`data-site-page="${route.page}"`));
    assert.equal((html.match(/<h1[ >]/g)||[]).length,2,route.path); // Launch and storefront, only one surface is visible.
    assert.match(html,new RegExp(`rel="canonical" href="https://perverseworld.com${route.path}"`));
    assert.match(html,/alphazonelabs\.com/);assert.match(html,/brand-ui\.css/);
    assert.doesNotMatch(html,/data:image|site-pages|onclick=|style=|{{\w+}}|<style>|<script>/);
    assert.equal(html.includes('id="contactForm"'),route.page==='contact');
    assert.equal(html.includes('id="signup"'),route.page==='home');
    assert.equal(html.includes('id="story"'),route.page==='home');
    assert.doesNotMatch(html,/instagram|[↗→←↑]|href="\/(?:about|collections)/i);
    assert.doesNotMatch(html.replace(/<head>[\s\S]*?<\/head>/,''),/concept|preview|demo|placeholders|not a live store|WORLD<\/span>_/i);
    assert.match(html,/<div id="storefront" hidden>/);
    assert.match(html,/id="launchCloud"/);
    for(const label of ['Main navigation','Mobile navigation','Footer navigation']){
      const nav=html.match(new RegExp(`<nav[^>]+aria-label="${label}"[^>]*>([\\s\\S]*?)</nav>`))?.[1];
      assert.ok(nav,label);
      assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(match=>match[1]),['/','/shop','/contact']);
      assert.match(nav,/>home<\/span>/);assert.match(nav,/>storefront<\/span>/);
    }
    const cards=html.match(/<article class="product">/g)||[];
    assert.equal(cards.length,route.page==='home'?1:route.page==='shop'?4:0,route.path);
    assert.doesNotMatch(html,/Otherworld Graphic Tee|Possessed Hand Graphic/);
    if(route.page==='home'){
      const card=html.match(/<article class="product">[\s\S]*?<\/article>/)?.[0];
      assert.match(card,/World Logo Hoodie/);
      assert.doesNotMatch(card,/Worldscape Tee|Green Flame Set|Midnight Riot Hoodie/);
    }
    for(const [,asset] of html.matchAll(/(?:src|href)="(\/(?:assets\/|brand-ui)[^"]*)"/g))assert.ok((await stat(new URL('../dist'+asset,import.meta.url))).isFile(),asset);
    sizes.push(html.length);
  }
  assert.ok(Math.max(...sizes)<25000,'Pages must not duplicate embedded image data');
});
test('unknown URLs use a 404 document and protected routes always execute the Worker',async()=>{
  const config=await read('wrangler.toml');
  assert.match(config,/not_found_handling = "404-page"/);
  assert.match(config,/run_worker_first = \["\/api\/\*", "\/admin", "\/admin\/\*", "\/unsubscribe",/);
  assert.doesNotMatch(await read('public/assets/css/pages.css'),/body\[data-site-page[^\{]*\{[^}]*display:\s*none/);
});
test('all product galleries and product URLs resolve; approved prices are visible on product pages',async()=>{
  for(const p of catalog){
    const html=await read('dist/shop/'+p.slug+'.html');
    assert.match(html,/id="productDetail"/);assert.match(html,/id="launchCloud"/);
    for(const item of [p,...(p.options||[])]){
      for(const view of item.images){assert.ok((await stat(new URL('../public'+view.src,import.meta.url))).size>0,view.src);}
    }
  }
  const shop=await read('dist/shop.html'),home=await read('dist/index.html');
  assert.match(shop,/From \$45\.00/);assert.doesNotMatch(shop,/Green Flame Set|Midnight Riot Hoodie/);
  const set=await read('dist/shop/world-logo-set.html');
  assert.match(set,/World Logo Hoodie<\/span><strong>\$65\.00/);
  assert.match(set,/World Logo Sweatpants<\/span><strong>\$45\.00/);
  assert.match(home,/World Logo Hoodie/);assert.doesNotMatch(home,/From \$45\.00/);
  assert.deepEqual(catalog.filter(p=>p.cat==='tees').map(p=>p.price),[28,28]);
});
test('automatic Cloudflare releases fail before bundling with unverified production configuration',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/prepare-worker.mjs',import.meta.url))],{env:{...process.env,WORKERS_CI:'1',CLOUDFLARE_CONFIGURATION_VERIFIED:''},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Deployment blocked/);
  assert.doesNotMatch(result.stdout,/Built \d+ independent/);
});
