import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
import {routes} from '../src/site/routes.js';
import catalog from '../src/site/products.json' with {type:'json'};
import {seoHead,pageGraph} from '../src/site/seo.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('sitemap lists only the canonical public pages and products, with product image discovery',async()=>{
 const sitemap=await read('dist/sitemap.xml'),urls=[...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
 assert.deepEqual(urls,[...routes.map(route=>'https://perverseworld.com'+route.path),...catalog.map(product=>'https://perverseworld.com/shop/'+product.slug)]);assert.match(sitemap,/<image:loc>/);assert.doesNotMatch(sitemap,/admin|unsubscribe|newsletter\/confirm|collections/);
 const robots=await read('dist/robots.txt');assert.match(robots,/Disallow: \/admin/);assert.match(robots,/Disallow: \/newsletter\//);assert.match(robots,/Sitemap: https:\/\/perverseworld.com\/sitemap.xml/);
 const llms=await read('dist/llms.txt');for(const product of catalog)assert.ok(llms.includes('/shop/'+product.slug));assert.match(llms,/no online payment checkout/);
});
test('metadata is distinct and product schema reflects real separately priced pieces without fabricated reviews or policies',async()=>{
 for(const product of catalog){const html=await read('dist/shop/'+product.slug+'.html'),graph=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);const page=graph['@graph'].find(item=>item['@id']==='https://perverseworld.com/shop/'+product.slug+'#page');assert.match(html,/name="twitter:card" content="summary_large_image"/);assert.ok(page.mainEntity);const items=product.options?page.mainEntity.itemListElement.map(item=>item.item):[page.mainEntity];assert.deepEqual(items.map(item=>Number(item.offers.price)),(product.options||[product]).map(item=>item.price));assert.ok(items.every(item=>item.offers.priceCurrency==='USD'));assert.doesNotMatch(JSON.stringify(graph),/aggregateRating|reviewCount|shippingDetails|hasMerchantReturnPolicy/);}
 const unsafe={...catalog[0],name:'</script><script>bad()</script>',img:'https://example.com/photo.jpg',images:[]};const route={path:'/shop/'+unsafe.slug,page:'product',title:unsafe.name,description:unsafe.name};assert.doesNotMatch(seoHead(route,[unsafe]),/<script>bad/);assert.equal(pageGraph(route,[unsafe])['@graph'][2].mainEntity.image[0],'https://example.com/photo.jpg');
});
test('supplied Perverse icon generates small browser icons and installable web/native app metadata',async()=>{
 const source=await stat(new URL('../public/assets/images/perverseIcon.png',import.meta.url));
 for(const [name,size] of [['favicon-32',32],['apple-touch-icon',180],['icon-192',192],['icon-512',512]]){const path=new URL('../dist/assets/icons/'+name+'.png',import.meta.url),metadata=await sharp(await readFile(path)).metadata();assert.equal(metadata.width,size);assert.equal(metadata.height,size);assert.ok((await stat(path)).size<source.size);}
 assert.ok((await stat(new URL('../dist/assets/icons/favicon-32.png',import.meta.url))).size<source.size/30);
 const manifest=JSON.parse(await read('dist/manifest.webmanifest'));assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512']);const app=JSON.parse(await read('apps/mobile/app.json')).expo;assert.match(app.icon,/perverseIcon.png$/);assert.match(app.web.favicon,/perverseIcon.png$/);assert.ok(app.plugins.includes('expo-router'));
});
test('copyright year refreshes when a page is reopened in a new year',async()=>{
 let year=2032,visible;const nodes=[{textContent:'2026'},{textContent:'2026'}];
 vm.runInNewContext(await read('public/assets/js/site.js'),{Date:class extends Date{getFullYear(){return year;}},document:{querySelectorAll:()=>nodes,hidden:false,addEventListener(name,callback){assert.equal(name,'visibilitychange');visible=callback;}},navigator:{},window:{isSecureContext:false}});
 assert.ok(nodes.every(node=>node.textContent==='2032'));year=2033;visible();assert.ok(nodes.every(node=>node.textContent==='2033'));for(const page of ['index','shop','contact'])assert.match(await read('dist/'+page+'.html'),/data-current-year/);
});
test('offline worker never caches APIs, admin pages, tokens or customer submissions',async()=>{
 const handlers={};let intercepted=0,work;
 vm.runInNewContext(await read('dist/sw.js'),{URL,self:{location:{origin:'https://perverseworld.com'},addEventListener(name,callback){handlers[name]=callback;},clients:{claim:async()=>{}},skipWaiting:async()=>{}},caches:{match:async()=>new Response('OFFLINE SHELL')},fetch:async()=>{throw Error('Offline');}});
 for(const path of ['/api/admin/subscribers','/admin/','/api/products','/unsubscribe?token=private','/newsletter/confirm?token=private'])handlers.fetch({request:{url:'https://perverseworld.com'+path,method:'GET',mode:'navigate'},respondWith(){intercepted++;}});
 handlers.fetch({request:{url:'https://perverseworld.com/api/submissions',method:'POST',mode:'cors'},respondWith(){intercepted++;}});assert.equal(intercepted,0);
 handlers.fetch({request:{url:'https://perverseworld.com/shop',method:'GET',mode:'navigate'},respondWith(promise){work=promise;}});assert.equal(await (await work).text(),'OFFLINE SHELL');
});
