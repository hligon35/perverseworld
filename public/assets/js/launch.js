/* A launch reveal, separate from Cloudflare Access authentication for admin. */
(() => {
  'use strict';
  const gate=document.getElementById('launchGate');
  const store=document.getElementById('storefront');
  const cloud=document.getElementById('launchCloud');
  if(!gate||!store||!cloud)return;
  const key='pw-launch-entered';
  const title=document.title;
  let entered=false,hits=[];
  function enter(focus=true){
    if(entered)return;
    entered=true;hits=[];
    try{sessionStorage.setItem(key,'1');}catch{}
    gate.hidden=true;store.hidden=false;document.title=title;
    if(focus){
      const heading=store.querySelector('h1');
      if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
      window.scrollTo({top:0,behavior:'instant'});
    }
    document.dispatchEvent(new Event('pw:entered'));
  }
  window.PWLaunch={isOpen:()=>entered};
  try{if(sessionStorage.getItem(key)==='1')enter(false);}catch{}
  if(!entered)document.title='Coming Soon — Perverse World';
  cloud.addEventListener('click',()=>{
    const now=performance.now();
    hits=hits.filter(time=>now-time<=5000);hits.push(now);
    if(hits.length>=7)enter();
  });
})();
