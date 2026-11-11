/* Perverse World multi-page storefront — shared branded shell, dedicated URLs. */
(() => {
  'use strict';
  const pathname = location.pathname.replace(/\/+$/,'') || '/';
  const matches = {
    '/':'home','/shop':'shop','/collections':'collections','/collections/tees':'tees',
    '/collections/hoodies':'hoodies','/collections/sets':'sets',
    '/about':'about','/contact':'contact'
  };
  const page=matches[pathname];
  if(!page)return;
  const $=s=>document.querySelector(s);
  const main=$('main');
  if(!main)return;
  document.body.dataset.sitePage=page;
  const meta={
    home:['Perverse World — Wear the Chaos','Independent streetwear for the outsiders. Explore statement graphics and original drops.'],
    shop:['Shop All — Perverse World','Shop graphic tees, hoodies and sets from Perverse World.'],
    collections:['Collections — Perverse World','Find your lane: graphic tees, hoodies and sets by Perverse World.'],
    tees:['Graphic Tees — Perverse World','Shop Perverse World graphic T-shirts.'],
    hoodies:['Hoodies — Perverse World','Shop Perverse World hoodies.'],
    sets:['Sets & Graphics — Perverse World','Explore Perverse World sets and graphic pieces.'],
    about:['Our World — Perverse World','About the outsiders, art, and expressive streetwear behind Perverse World.'],
    contact:['Contact — Perverse World','Questions about the brand, orders or collaborations? Contact Perverse World.']
  };
  document.title=meta[page][0];
  let description=$('meta[name="description"]');if(!description){description=document.createElement('meta');description.name='description';document.head.append(description)}description.content=meta[page][1];
  let canonical=$('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical)}canonical.href='https://perverseworld.com'+pathname;

  const linkMap={ '#top':'/', '#shop':'/shop', '#featured':'/collections', '#story':'/about' };
  document.querySelectorAll('a[href]').forEach(a=>{
    const href=a.getAttribute('href');
    if(linkMap[href])a.href=linkMap[href];
    if(a.textContent.trim().toLowerCase()==='contact' && a.closest('footer')){a.removeAttribute('onclick');a.href='/contact'}
  });
  const navigation=[['Home','/'],['Shop','/shop'],['Collections','/collections'],['Our World','/about'],['Contact','/contact']];
  for(const selector of ['.navlinks','#mobileMenu']){
    const nav=$(selector);if(!nav)continue;
    const social=nav.querySelector('a[href*="instagram.com"]');
    nav.replaceChildren(...navigation.map(([label,url])=>{
      const a=document.createElement('a');a.href=url;a.textContent=label;
      if(url===pathname || (page==='tees'||page==='hoodies'||page==='sets')&&url==='/collections'){
        a.classList.add('is-current');a.setAttribute('aria-current','page');
      }return a;
    }));
    if(social)nav.append(social);
  }
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
  const routeHero=(number,title,copy)=>{
    const section=make('section','pw-route-hero');
    const inner=make('div','pw-route-inner');
    inner.append(make('span','pw-route-index',number));
    const heading=make('h1','',title);inner.append(heading);
    inner.append(make('p','',copy));
    const crumbs=make('div','pw-breadcrumb');
    const home=make('a','','HOME');home.href='/';crumbs.append(home,make('span','',' / '),make('span','',page==='tees'?'GRAPHIC TEES':page==='hoodies'?'HOODIES':page==='sets'?'SETS & GRAPHICS':title));
    inner.append(crumbs);section.append(inner);main.prepend(section);
  };
  const routeTitles={
    shop:['01 / THE SHOP','ALL PIECES. ZERO RULES.','Every statement starts somewhere. Explore the entire Perverse World lineup.'],
    collections:['02 / FIND YOUR LANE','CHOOSE YOUR CHAOS.','Different looks. Same attitude. Find the collection that fits your world.'],
    tees:['02 / THE COLLECTION','GRAPHIC TEES.','Make a statement without saying a word.'],
    hoodies:['02 / THE COLLECTION','HOODIES.','Layer up. Stand out. Stay unapologetic.'],
    sets:['02 / THE COLLECTION','SETS & GRAPHICS.','Full looks. Loud energy. Your world, your rules.'],
    about:['03 / THE MOVEMENT','NOT MADE TO FIT IN.','Independent streetwear for the ones who refuse to follow the crowd.'],
    contact:['04 / STAY CONNECTED','MAKE CONTACT.','Questions about drops, sizing, or collaborations? Send us a message.']
  };
  if(routeTitles[page])routeHero(...routeTitles[page]);

  if(page==='home'){
    const intro=make('div','pw-home-intro');
    intro.append(make('span','pw-route-index','01 / CURRENT DROP'),make('h2','','THE WORLD IS JUST GETTING STARTED.'));
    const lead=make('p','','Explore selected pieces from the lineup, or see everything in the shop.');intro.append(lead);
    const cta=make('a','pw-page-button','SHOP ALL PIECES ↗');cta.href='/shop';intro.append(cta);
    $('#shop')?.prepend(intro);
    const storyCta=make('a','pw-page-button','OUR STORY ↗');storyCta.href='/about';$('.story')?.append(storyCta);
  }
  if(page==='shop'){
    const banner=$('.collection-banner');if(banner)banner.remove();
  }
  if(page==='collections'){
    const section=make('section','pw-collection-cards');
    const variants=[
      ['tees','GRAPHIC TEES','Graphic statements. Everyday rebellion.'],
      ['hoodies','HOODIES','Dark layers for the outside world.'],
      ['sets','SETS & GRAPHICS','Built to make an entrance.']
    ];
    variants.forEach(([category,title,subtitle])=>{
      const a=make('a','pw-collection-card');a.href='/collections/'+category;
      a.append(make('span','pw-collection-count','0'+(variants.findIndex(v=>v[0]===category)+1)+' / COLLECTION'));
      a.append(make('h2','',title),make('p','',subtitle));
      const foot=make('span','pw-collection-go','EXPLORE COLLECTION ↗');a.append(foot);
      section.append(a);
    });
    const target=$('.pw-route-hero');target?.after(section);
    const banner=$('.collection-banner');if(banner){banner.classList.add('pw-collection-feature');section.after(banner)}
  }
  if(['tees','hoodies','sets'].includes(page)){
    const b=$('.filter[data-filter="'+page+'"]');
    if(b)b.click();
    const link=make('a','pw-return-link','← VIEW ALL COLLECTIONS');link.href='/collections';
    $('#shop')?.prepend(link);
    $('.collection-banner')?.remove();
  }
  if(page==='about'){
    const note=make('section','pw-about-notes');
    const inner=make('div','pw-about-inner');inner.append(make('span','pw-route-index','THE PERVERSE WORLD MINDSET'));
    inner.append(make('h2','','LOUD BY DESIGN. DIFFERENT BY NATURE.'));
    inner.append(make('p','','Built around original graphics, individual expression, and the freedom to dress outside the rules. The world looks better when nobody is trying to fit into the same mold.'));
    const shop=make('a','pw-page-button','EXPLORE THE SHOP ↗');shop.href='/shop';inner.append(shop);note.append(inner);
    $('.story')?.after(note);
  }
  if(page==='contact'){
    const moveContact=()=>{const contact=$('#contact');if(contact&&contact.parentElement!==main){contact.classList.add('pw-contact-page');main.append(contact);return true}return !!contact};
    if(!moveContact()){
      const observer=new MutationObserver(()=>{if(moveContact())observer.disconnect()});
      observer.observe(document.body,{childList:true,subtree:true});
    }
    const note=make('div','pw-contact-note');
    note.append(make('span','pw-route-index','FOLLOW THE WORLD'));
    const p=make('p','','See new artwork, upcoming pieces, and updates on Instagram.');
    const a=make('a','pw-page-button','VISIT @PERVERSEWORLD_ ↗');a.href='https://www.instagram.com/perverseworld_/';a.target='_blank';a.rel='noopener noreferrer';
    note.append(p,a);main.append(note);
  }
  // Preserve the bag across full-page navigations without storing large data-URI images.
  try {
    const saved=JSON.parse(sessionStorage.getItem('pw-cart')||'[]');
    if(Array.isArray(saved)&&typeof products!=='undefined'&&typeof cart!=='undefined'){
      cart.splice(0,cart.length,...saved.slice(0,40).map(item=>{
        const p=products.find(x=>x.id===Number(item.id));
        return p&&['S','M','L','XL','2XL'].includes(item.size)?{...p,size:item.size}:null;
      }).filter(Boolean));
      if(typeof renderCart==='function')renderCart();
    }
    const bag=$('#cartItems');
    if(bag&&typeof cart!=='undefined'){
      const persist=()=>{try{sessionStorage.setItem('pw-cart',JSON.stringify(cart.map(p=>({id:p.id,size:p.size}))))}catch{}};
      new MutationObserver(persist).observe(bag,{childList:true,subtree:true});
    }
  }catch{}
  // Keep all original storefront nodes in the DOM: the built-in product, cart and
  // newsletter scripts still find their anchors even when the sections are hidden.
  const mobile=$('#mobileMenu');if(mobile)mobile.querySelectorAll('a').forEach(a=>a.onclick=()=>mobile.classList.remove('open'));
  const bag=$('#cartBtn');if(bag)bag.setAttribute('aria-label','Open shopping bag');
})();