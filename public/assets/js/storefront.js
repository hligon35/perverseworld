/* Shared catalog and session bag. Each document owns its page content. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => '$' + Number(n).toFixed(2);
  const image = value => /^https:\/\//.test(value || '') || /^\/assets\/images\/[\w.-]+$/.test(value || '') || /^\/media\/products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(value || '') ? value : '';
  const builtins = window.PW_CATALOG || [];
  const retired = window.PW_CATALOG_CONFIG?.retiredProductIds || [];
  let products = [...builtins], cart = [], current = null, size = 'S';
  let filter = $('shop')?.dataset.category || 'all';
  const limit = Number($('shop')?.dataset.limit) || 0;
  const featuredId = Number($('shop')?.dataset.featuredId) || 0;
  const featuredOption = featuredId?window.PW_CATALOG_CONFIG?.homeOptionId||'':'';
  function saleItem(product,optionId){
    const option=product.options?.find(item=>item.id===optionId);
    return option?{...product,...option,id:product.id,optionId:option.id,options:undefined}:product;
  }
  function persist() { try { sessionStorage.setItem('pw-cart', JSON.stringify(cart)); } catch {} }
  function toast(text) {
    $('toast').textContent = text; $('toast').classList.add('visible');
    setTimeout(() => $('toast').classList.remove('visible'), 2200);
  }
  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('pw-cart') || '[]');
      if (!Array.isArray(saved)) return;
      cart = saved.slice(0, 40).flatMap(item => {
        // Migrate old id/size sessions; snapshots retain API-only products on every page.
        if(retired.includes(Number(item.id)))return [];
        const original=builtins.find(p=>p.id===Number(item.id));
        const optionId=item.optionId||(original?.options?'hoodie':'');
        const known=original?saleItem(original,optionId):null;
        const p = known?{...item,...known}:item.name?item:null;
        return p && Number.isInteger(Number(p.id)) && Number.isFinite(Number(p.price)) && Number(p.price) >= 0 && typeof item.size==='string' && /^[A-Za-z0-9 -]{1,16}$/.test(item.size)
          ? [{id:Number(p.id),...(optionId?{optionId}:{}),name:known?.optionId?known.name:String(p.name).slice(0,150),price:Number(p.price),img:known&&String(p.img||'').startsWith('/assets/images/')?known.img:image(p.img),size:item.size}] : [];
      });
    } catch { cart = []; }
  }
  function renderProducts() {
    if (!$('products')) return;
    let items = products.filter(p => !retired.includes(p.id)&&(!featuredId||p.id===featuredId)&&(filter === 'all' || p.cat === filter||p.options?.some(option=>option.cat===filter))).map(p=>featuredOption?saleItem(p,featuredOption):p);
    if ($('sort')?.value === 'low') items.sort((a,b) => a.price-b.price);
    if ($('sort')?.value === 'high') items.sort((a,b) => b.price-a.price);
    if (limit) items = items.slice(0,limit);
    $('products').innerHTML = items.length ? items.map(p => {
      const url=p.slug?'/shop/'+encodeURIComponent(p.slug)+(p.optionId?'?item='+encodeURIComponent(p.optionId):''):'';
      const action=p.options?`<a class="add" href="${url}" aria-label="View ${esc(p.name)}">+</a>`:`<button class="add" data-id="${p.id}" aria-label="View ${esc(p.name)}">+</button>`;
      const open=url?`<a class="product-open" href="${url}">`:`<button class="product-open" data-id="${p.id}" aria-label="View ${esc(p.name)}">`;
      const name=url?`<a class="product-name" href="${url}">${esc(p.name)}</a>`:`<button class="product-name" data-id="${p.id}">${esc(p.name)}</button>`;
      return `<article class="product"><div class="product-image">${open}<img src="${esc(image(p.img))}" alt="${esc(p.name)}" loading="lazy">${url?'</a>':'</button>'}<span class="tag">${esc(p.tag)}</span>${action}</div><div class="product-info"><div>${name}<div class="product-sub">${esc(p.sub)}</div></div><div class="price">${p.options?'From ':''}${money(p.price)}</div></div></article>`;
    }).join('') : `<p class="empty">${featuredId?'The World Logo Hoodie is currently unavailable. Explore the shop for more pieces.':'No pieces in this collection yet. Check back for the next drop.'}</p>`;
    $('products').querySelectorAll('button.add,button.product-open,button.product-name').forEach(b => b.onclick = () => openProduct(Number(b.dataset.id)));
  }
  function closeOverlay() { if (!$('drawer').classList.contains('open') && !$('modal').classList.contains('open')) $('overlay').classList.remove('open'); }
  function openProduct(id) {
    current = products.find(p => p.id === id); if (!current) return;
    if(featuredOption)current=saleItem(current,featuredOption);
    size = 'S';
    const views=Array.isArray(current.images)&&current.images.length?current.images:[{src:current.img,label:'Front'}];
    function showView(index){
      $('modalImg').src=image(views[index].src);$('modalImg').alt=current.name+' — '+views[index].label;
      $('productViews')?.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.view)===index)));
    }
    if($('productViews')){
      $('productViews').innerHTML=views.map((view,index)=>`<button type="button" data-view="${index}" aria-pressed="${index===0}">${esc(view.label)}</button>`).join('');
      $('productViews').querySelectorAll('button').forEach(button=>button.onclick=()=>showView(Number(button.dataset.view)));
    }
    showView(0);
    $('modalName').textContent = current.name; $('modalPrice').textContent = money(current.price);
    const sizes=current.sizes||{S:10,M:10,L:10,XL:10,'2XL':10};size=Object.keys(sizes).find(key=>sizes[key]>0)||'';
    $('sizes').replaceChildren(...Object.entries(sizes).map(([key,quantity])=>{const button=document.createElement('button');button.type='button';button.textContent=key;button.dataset.size=key;button.disabled=quantity===0;button.classList.toggle('selected',key===size);button.onclick=()=>{size=key;$('sizes').querySelectorAll('button').forEach(node=>node.classList.toggle('selected',node===button))};return button}));
    $('modalAdd').disabled=!size;
    $('modal').classList.add('open'); $('overlay').classList.add('open');
  }
  const closeProduct = () => { $('modal').classList.remove('open'); closeOverlay(); };
  const closeCart = () => { $('drawer').classList.remove('open'); closeOverlay(); };
  function renderCart() {
    $('cartCount').textContent = cart.length; $('subtotal').textContent = money(cart.reduce((sum,p) => sum + p.price,0));
    $('cartItems').innerHTML = cart.length ? cart.map((p,i) => `<div class="cart-item"><img src="${esc(image(p.img))}" alt="${esc(p.name)}"><div><h3>${esc(p.name)}</h3><small>Size ${esc(p.size)} / ${money(p.price)}</small><br><button data-remove="${i}">Remove</button></div></div>`).join('') : '<p class="empty">Your bag is empty.<br>Find your next statement piece.</p>';
    $('cartItems').querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {cart.splice(Number(b.dataset.remove),1); persist(); renderCart();});
  }
  document.querySelectorAll('.filter').forEach(b => b.onclick = () => {filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderProducts();});
  if ($('sort')) $('sort').onchange = renderProducts;
  $('sizes').querySelectorAll('button').forEach(b => b.onclick = () => {size=b.dataset.size;$('sizes').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));});
  function addItem(product,selectedSize){
    if(!product||!selectedSize)return false;
    if(product.sizes){const quantity=product.sizes[selectedSize]||0,already=cart.filter(item=>item.id===product.id&&(item.optionId||'')===(product.optionId||'')&&item.size===selectedSize).length;if(already>=quantity){toast('THIS SIZE IS SOLD OUT');return false;}}
    if(cart.length>=40){toast('YOUR BAG IS FULL');return false;}
    cart.push({id:product.id,...(product.optionId?{optionId:product.optionId}:{}),name:product.name,price:product.price,img:image(product.img),size:selectedSize});
    persist();renderCart();toast('ADDED TO YOUR BAG +');return true;
  }
  $('modalAdd').onclick=()=>{if(addItem(current,size))closeProduct();};
  $('cartBtn').onclick = () => {renderCart();$('drawer').classList.add('open');$('overlay').classList.add('open');};
  $('closeCart').onclick=closeCart; $('closeModal').onclick=closeProduct;
  $('overlay').onclick=()=>{closeProduct();closeCart();};
  $('checkout').onclick=()=>{window.location.href='/contact?enquiry=bag';};
  const closeMenu=()=>{$('mobileMenu').classList.remove('open');$('menuBtn').setAttribute('aria-expanded','false');};
  $('menuBtn').setAttribute('aria-controls','mobileMenu'); closeMenu();
  $('menuBtn').onclick=()=>{const open=$('mobileMenu').classList.toggle('open');$('menuBtn').setAttribute('aria-expanded',String(open));};
  $('mobileMenu').querySelectorAll('a').forEach(a=>a.onclick=closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeProduct();closeCart();closeMenu();}});
  window.PWStore={getProduct:id=>products.find(p=>p.id===Number(id)),saleItem,addItem,updateCatalog(rows){
    products=rows.filter(p=>!retired.includes(Number(p.id))).map(p=>{
      const builtin=p.img?.startsWith('builtin:')?builtins.find(x=>x.id===Number(p.img.slice(8))):null;
      const img=builtin?.img||image(p.img);
      const views=(Array.isArray(p.images)&&p.images.length?p.images:builtin?.images||[{src:img,label:'Front'}]).map(view=>({src:image(view.src),label:String(view.label||'View').slice(0,60)})).filter(view=>view.src);
      const source=builtin||builtins.find(item=>item.id===Number(p.id));
      const options=(Array.isArray(p.options)?p.options:builtin?.options)?.map(option=>({...option,img:image(option.img),images:option.images?.map(view=>({src:image(view.src),label:String(view.label||'View').slice(0,60)})).filter(view=>view.src)}));
      return {...p,slug:p.slug||source?.slug,id:Number(p.id),price:Number(p.price)||0,img,images:views,...(options?{options}:{})};
    });
    cart=cart.map(item=>{const parent=products.find(p=>p.id===item.id);const p=parent?saleItem(parent,item.optionId||(parent.options?'hoodie':'')):null;return p?{id:p.id,...(p.optionId?{optionId:p.optionId}:{}),name:p.name,price:p.price,img:p.img,size:item.size}:item;});
    persist();renderProducts();renderCart();
    if($('productDetail'))document.dispatchEvent(new Event('pw:catalog-updated'));
  }};
  restore();renderProducts();renderCart();
})();
