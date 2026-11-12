/* Shared Material Symbols icon layer for Perverse World storefront + admin. */
(() => {
  'use strict';
  if (window.__perverseBrandUi) return;
  window.__perverseBrandUi = true;
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/brand-ui.css';document.head.appendChild(sheet);
  const M='material-symbols-outlined';
  const icon=name=>{const span=document.createElement('span');span.className=M;span.setAttribute('aria-hidden','true');span.textContent=name;return span};
  function addIcon(node,name,{replace=false,position='start'}={}){
    if(!node||node.dataset.pwIcon)return;
    node.dataset.pwIcon=name;node.classList.add('pw-icon-action');
    if(replace){node.replaceChildren(icon(name));node.classList.add('pw-icon-only')}
    else if(position==='end')node.append(icon(name));
    else node.prepend(icon(name));
  }
  const replacements=[
    ['#menuBtn','menu',true],['#cartBtn','shopping_bag',false],
    ['#closeCart','close',true],['#closeModal','close',true],
    ['#checkout','mail',false],['#modalAdd','add_shopping_cart',false],
    ['#reloadProducts','refresh',false],['#reloadSubmissions','refresh',false],
    ['#reloadMailbox','refresh',false],['#reloadCampaigns','refresh',false],
    ['#reloadSubscribers','refresh',false],['#newProduct','add_circle',false],
    ['#cancelProduct','close',false],['#previewNewsletter','visibility',false]
  ];
  const navIcons={overview:'dashboard',products:'inventory_2',submissions:'assignment',mailbox:'inbox',newsletter:'campaign',subscribers:'groups'};
  const goIcons={products:'add_box',newsletter:'edit_note',submissions:'fact_check',mailbox:'mail'};
  const byText=[
    [/^shop all$/i,'storefront'],[/^the collection$/i,'checkroom'],[/^our world$/i,'public'],
    [/^featured drop$/i,'local_fire_department'],
    [/^our story$/i,'auto_stories'],[/^contact$/i,'mail'],
    [/^join the world/i,'alternate_email'],[/^send message/i,'send'],
    [/^add to bag/i,'add_shopping_cart'],[/^view bag/i,'shopping_bag'],
    [/^save product$/i,'save'],[/^send email$/i,'send'],
    [/^save draft$/i,'save'],[/^edit$/i,'edit_square'],
    [/^reply$/i,'reply'],[/^refresh$/i,'refresh'],
    [/^mark reviewed$/i,'done_all'],[/^close$/i,'check_circle'],
    [/^send next 20$/i,'send'],[/^sent$/i,'done']
  ];
  function decorate(){
    for(const [sel,name,replace] of replacements)document.querySelectorAll(sel).forEach(n=>addIcon(n,name,{replace}));
    document.querySelectorAll('[data-page]').forEach(n=>{
      const name=navIcons[n.dataset.page];if(!name||n.dataset.pwIcon)return;
      const old=n.querySelector('span');if(old)old.replaceWith(icon(name));else n.prepend(icon(name));
      n.dataset.pwIcon=name;n.classList.add('pw-icon-action');
    });
    document.querySelectorAll('[data-goto]').forEach(n=>addIcon(n,goIcons[n.dataset.goto]||'arrow_forward'));
    document.querySelectorAll('button.add[data-id]').forEach(n=>addIcon(n,'add',{replace:true}));
    document.querySelectorAll('button[data-remove]').forEach(n=>addIcon(n,'delete_outline'));
    document.querySelectorAll('button,a').forEach(n=>{
      if(n.dataset.pwIcon||n.closest('[data-page]'))return;
      if(n.matches('.filter,[data-size]'))return;
      const label=(n.textContent||'').trim().replace(/\s+/g,' ');
      const match=byText.find(([re])=>re.test(label));if(match)addIcon(n,match[1]);
    });
  }
  function credit(){
    const link=()=>{const a=document.createElement('a');a.href='https://alphazonelabs.com';a.target='_blank';a.rel='noopener noreferrer';a.className='pw-brand-credit';a.append(icon('code'),document.createTextNode('Designed by AlphaZoneLabs LLC'));return a};
    const storefront=document.querySelector('footer .copyright');
    if(storefront&&!storefront.querySelector('.pw-brand-credit')){const c=document.createElement('span');c.className='pw-store-credit';c.append(link());storefront.append(c)}
    const side=document.querySelector('.sidefoot');
    if(side&&!side.querySelector('.pw-brand-credit')){const c=document.createElement('div');c.className='pw-admin-credit';c.append(link());side.append(c)}
    const main=document.querySelector('.main .content');
    if(main&&!main.querySelector('.pw-brand-credit')){const c=document.createElement('footer');c.className='pw-admin-bottom';c.append(link());main.append(c)}
  }
  let scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;decorate();credit()})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{schedule();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true})},{once:true});
  else{schedule();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true})}
})();
