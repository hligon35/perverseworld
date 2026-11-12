import {cp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {routes} from '../src/site/routes.js';

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
await write('dist/assets/js/catalog.js',`// Generated from src/site/products.json.\nwindow.PW_CATALOG = ${JSON.stringify(products)};\n`);

for(const route of routes){
  const nav=navigation.map(([label,path])=>`<a href="${path}"${path===route.path?' class="is-current" aria-current="page"':''}>${label}</a>`).join('');
  const category='all', limit=route.page==='home'?3:0;
  const selected=products.filter(p=>category==='all'||p.cat===category).slice(0,limit||undefined);
  const cards=selected.map(p=>`<article class="product"><div class="product-image"><img src="${escapeHTML(p.img)}" alt="${escapeHTML(p.name)}" loading="lazy"><span class="tag">${escapeHTML(p.tag)}</span><button class="add" data-id="${p.id}" aria-label="View ${escapeHTML(p.name)}">+</button></div><div class="product-info"><div><div class="product-name">${escapeHTML(p.name)}</div><div class="product-sub">${escapeHTML(p.sub)}</div></div><div class="price">$${p.price.toFixed(2)}</div></div></article>`).join('');
  const toolbar=route.page==='home'?'':`<div class="toolbar"><div class="filters">${[['all','All pieces'],['tees','T-shirts'],['hoodies','Hoodies'],['sets','Sets & graphics']].map(([value,label])=>`<button class="filter${value==='all'?' active':''}" data-filter="${value}">${label}</button>`).join('')}</div><label class="sort">Sort by <select id="sort"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></label></div>`;
  const catalog=await component('catalog',{category,limit,products:cards,toolbar,catalogHeading:route.page==='home'?'':'<div class="sectionhead"><div><span class="kicker">01 / THE LINEUP</span><h2>FRESH OUT<br>THE WORLD.</h2></div><a class="textlink" href="/#story">THE STORY BEHIND IT</a></div>'});
  const values={catalog,routeHero:route.index?await component('route-hero',Object.fromEntries(Object.entries(route).map(([k,v])=>[k,escapeHTML(v)]))):''};
  for(const name of ['hero','marquee','story','newsletter'])values[name]=await component(name);
  const content=fill(await read(`src/site/pages/${route.page}.html`),values);
  const layout=fill(await read('src/site/layout.html'),{
    ...Object.fromEntries(Object.entries(route).map(([k,v])=>[k,escapeHTML(v)])),
    header:await component('header',{navigation:nav}),footer:await component('footer',{navigation:nav}),bag:await component('bag'),content
  });
  await write(`dist/${route.path==='/'?'index':route.path.slice(1)}.html`,layout);
}
await write('dist/404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — Perverse World</title><link rel="stylesheet" href="/assets/css/storefront.css"><main class="section"><h1>OUTSIDE THIS WORLD.</h1><p>This page could not be found.</p><a class="btn" href="/">BACK HOME</a></main></html>');
console.log(`Built ${routes.length} independent storefront pages in dist/.`);
