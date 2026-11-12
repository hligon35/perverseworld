import {cp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {routes} from '../src/site/routes.js';
import {retiredProductIds,homeProductId,homeOptionId} from '../src/site/catalog-policy.js';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const write = async (path, value) => {const url=new URL(path,root);await mkdir(new URL('.',url),{recursive:true});await writeFile(url,value);};
const fill = (template, values) => template.replace(/{{(\w+)}}/g, (_, key) => {
  if(!(key in values)) throw Error(`Missing template value: ${key}`);
  return values[key];
});
const products=JSON.parse(await read('src/site/products.json'));
const component=async(name,values={})=>fill(await read(`src/site/components/${name}.html`),values);
const navigation=[['Home','/'],['Shop','/shop'],['Contact','/contact']];
// Only remove the fixed generated directory inside this checkout, never a supplied path.
const output = new URL('dist/',root);
if(output.href!==root.href+'dist/')throw Error('Unexpected output directory');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(new URL('public/',root),new URL('dist/',root),{recursive:true});
await write('dist/assets/js/catalog.js',`// Generated from src/site/products.json and catalog-policy.js.\nwindow.PW_CATALOG = ${JSON.stringify(products)};\nwindow.PW_CATALOG_CONFIG = ${JSON.stringify({retiredProductIds,homeProductId,homeOptionId})};\n`);

const navigationHTML=route=>{
 const icons={Home:'home',Shop:'storefront',Contact:'mail'};
 return navigation.map(([label,path])=>`<a href="${path}" class="pw-nav-link${path===route.path||(path==='/shop'&&route.page==='product')?' is-current':''}"${path===route.path||(path==='/shop'&&route.page==='product')?' aria-current="page"':''} data-pw-icon="${icons[label]}"><span class="material-symbols-outlined" aria-hidden="true">${icons[label]}</span><span>${label}</span></a>`).join('');
};
async function writePage(route,content){
 const nav=navigationHTML(route);
 const layout=fill(await read('src/site/layout.html'),{
  ...Object.fromEntries(Object.entries(route).map(([k,v])=>[k,escapeHTML(v)])),
  header:await component('header',{navigation:nav}),footer:await component('footer',{navigation:nav}),bag:await component('bag'),launch:await component('launch'),content
 });
 await write(`dist/${route.path==='/'?'index':route.path.slice(1)}.html`,layout);
}

for(const route of routes){
  const category='all', limit=route.page==='home'?1:0;
  const featuredId=route.page==='home'?homeProductId:'';
  const selected=products.filter(p=>!retiredProductIds.includes(p.id)&&(!featuredId||p.id===featuredId)).map(p=>featuredId&&p.options?{...p,...p.options.find(o=>o.id===homeOptionId),id:p.id,options:undefined,optionId:homeOptionId}:p).slice(0,limit||undefined);
  const cards=selected.map(p=>{
   const url='/shop/'+p.slug+(p.optionId?'?item='+p.optionId:'');
   const action=p.options?`<a class="add" href="${url}" aria-label="View ${escapeHTML(p.name)}">+</a>`:`<button class="add" data-id="${p.id}" aria-label="View ${escapeHTML(p.name)}">+</button>`;
   return `<article class="product"><div class="product-image"><a href="${url}" class="product-open"><img src="${escapeHTML(p.img)}" alt="${escapeHTML(p.name)}" loading="lazy"></a><span class="tag">${escapeHTML(p.tag)}</span>${action}</div><div class="product-info"><div><a class="product-name" href="${url}">${escapeHTML(p.name)}</a><div class="product-sub">${escapeHTML(p.sub)}</div></div><div class="price">${p.options?'From ':''}$${p.price.toFixed(2)}</div></div></article>`;
  }).join('');
  const toolbar=route.page==='home'?'':`<div class="toolbar"><div class="filters">${[['all','All pieces'],['tees','T-shirts'],['hoodies','Hoodies'],['sets','Sets & graphics']].map(([value,label])=>`<button class="filter${value==='all'?' active':''}" data-filter="${value}">${label}</button>`).join('')}</div><label class="sort">Sort by <select id="sort"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label></div>`;
  const catalog=await component('catalog',{category,limit,featuredId,products:cards,toolbar,catalogHeading:route.page==='home'?'':'<div class="sectionhead"><div><span class="kicker">01 / THE LINEUP</span><h2>FRESH OUT<br>THE WORLD.</h2></div><a class="textlink" href="/#story">THE STORY BEHIND IT</a></div>'});
  const values={catalog,routeHero:route.index?await component('route-hero',Object.fromEntries(Object.entries(route).map(([k,v])=>[k,escapeHTML(v)]))):''};
  for(const name of ['hero','marquee','story','newsletter'])values[name]=await component(name);
  const content=fill(await read(`src/site/pages/${route.page}.html`),values);
  await writePage(route,content);
}
for(const p of products){
 const first=p.options?.[0]||p;
 const options=p.options?`<fieldset class="detail-options" id="detailOptions"><legend>Choose your piece</legend>${p.options.map((option,index)=>`<button type="button" data-option="${option.id}" aria-pressed="${index===0}"><span>${escapeHTML(option.name)}</span><strong>$${option.price.toFixed(2)}</strong></button>`).join('')}<p>Build your set: add each piece in your preferred size.</p></fieldset>`:'';
 const views=first.images.map((view,index)=>`<button type="button" data-view="${index}" aria-pressed="${index===0}">${escapeHTML(view.label)}</button>`).join('');
 const content=await component('product-detail',{id:p.id,name:escapeHTML(p.name),sub:escapeHTML(p.sub),img:escapeHTML(first.img),selectedName:escapeHTML(first.name),price:first.price.toFixed(2),options,views});
 await writePage({path:'/shop/'+p.slug,page:'product',title:p.name+' — Perverse World',description:p.sub},content);
}
await write('dist/404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — Perverse World</title><link rel="stylesheet" href="/assets/css/storefront.css"><main class="section"><h1>OUTSIDE THIS WORLD.</h1><p>This page could not be found.</p><a class="btn" href="/">BACK HOME</a></main></html>');
console.log(`Built ${routes.length} main pages and ${products.length} product pages in dist/.`);
