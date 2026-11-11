/* Shared catalog and session bag. Each document owns its page content. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => '$' + Number(n).toFixed(2);
  const image = value => /^https:\/\//.test(value || '') || /^\/assets\/images\/[\w.-]+$/.test(value || '') ? value : '';
  const builtins = window.PW_CATALOG || [];
  let products = [...builtins], cart = [], current = null, size = 'S';
  let filter = $('shop')?.dataset.category || 'all';
  const limit = Number($('shop')?.dataset.limit) || 0;
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
        const p = item.name ? item : builtins.find(p => p.id === Number(item.id));
        return p && Number.isInteger(Number(p.id)) && Number.isFinite(Number(p.price)) && Number(p.price) >= 0 && ['S','M','L','XL','2XL'].includes(item.size)
          ? [{id:Number(p.id),name:String(p.name).slice(0,150),price:Number(p.price),img:image(p.img),size:item.size}] : [];
      });
    } catch { cart = []; }
  }
  function renderProducts() {
    if (!$('products')) return;
    let items = products.filter(p => filter === 'all' || p.cat === filter);
    if ($('sort')?.value === 'low') items.sort((a,b) => a.price-b.price);
    if ($('sort')?.value === 'high') items.sort((a,b) => b.price-a.price);
    if (limit) items = items.slice(0,limit);
    $('products').innerHTML = items.length ? items.map(p => `<article class="product"><div class="product-image"><img src="${esc(image(p.img))}" alt="${esc(p.name)}" loading="lazy"><span class="tag">${esc(p.tag)}</span><button class="add" data-id="${p.id}" aria-label="View ${esc(p.name)}">+</button></div><div class="product-info"><div><div class="product-name">${esc(p.name)}</div><div class="product-sub">${esc(p.sub)}</div></div><div class="price">${money(p.price)}</div></div></article>`).join('') : '<p class="empty">No pieces in this collection yet. Check back for the next drop.</p>';
    $('products').querySelectorAll('.add').forEach(b => b.onclick = () => openProduct(Number(b.dataset.id)));
  }
  function closeOverlay() { if (!$('drawer').classList.contains('open') && !$('modal').classList.contains('open')) $('overlay').classList.remove('open'); }
  function openProduct(id) {
    current = products.find(p => p.id === id); if (!current) return;
    size = 'S'; $('modalImg').src = image(current.img); $('modalImg').alt = current.name;
    $('modalName').textContent = current.name; $('modalPrice').textContent = money(current.price);
    $('sizes').querySelectorAll('button').forEach(b => b.classList.toggle('selected',b.dataset.size === size));
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
  $('modalAdd').onclick = () => {
    if (!current) return; if (cart.length >= 40) return toast('YOUR BAG IS FULL');
    cart.push({id:current.id,name:current.name,price:current.price,img:image(current.img),size});
    persist(); closeProduct(); renderCart(); toast('ADDED TO YOUR BAG +');
  };
  $('cartBtn').onclick = () => {renderCart();$('drawer').classList.add('open');$('overlay').classList.add('open');};
  $('closeCart').onclick=closeCart; $('closeModal').onclick=closeProduct;
  $('overlay').onclick=()=>{closeProduct();closeCart();};
  $('checkout').onclick=()=>toast('DEMO ONLY — CHECKOUT NOT CONNECTED');
  const closeMenu=()=>{$('mobileMenu').classList.remove('open');$('menuBtn').setAttribute('aria-expanded','false');};
  $('menuBtn').setAttribute('aria-controls','mobileMenu'); closeMenu();
  $('menuBtn').onclick=()=>{const open=$('mobileMenu').classList.toggle('open');$('menuBtn').setAttribute('aria-expanded',String(open));};
  $('mobileMenu').querySelectorAll('a').forEach(a=>a.onclick=closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeProduct();closeCart();closeMenu();}});
  window.PWStore={updateCatalog(rows){
    products=rows.map(p=>({...p,id:Number(p.id),price:Number(p.price)||0,img:p.img?.startsWith('builtin:')?builtins.find(x=>x.id===Number(p.img.slice(8)))?.img||'':image(p.img)}));
    cart=cart.map(item=>{const p=products.find(p=>p.id===item.id);return p?{id:p.id,name:p.name,price:p.price,img:p.img,size:item.size}:item;});
    persist();renderProducts();renderCart();
  }};
  restore();renderProducts();renderCart();
})();
