/* Aggregate storefront activity only: no cookies, visitor IDs or personal data. */
(() => {
 'use strict';
 if(!document.body.dataset.sitePage||navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
 const path=location.pathname.replace(/\/+$/,'')||'/';
 const record=(event,productId=0)=>{
  const body=JSON.stringify({event,path,productId});
  try{fetch('/api/analytics',{method:'POST',headers:{'content-type':'text/plain;charset=UTF-8'},body,credentials:'omit',mode:'same-origin',keepalive:true}).catch(()=>{});}catch{}
 };
 record('page_view');
 document.addEventListener('pw:entered',()=>record('store_entry'),{once:true});
 document.addEventListener('pw:bag-added',event=>record('add_to_bag',event.detail.productId));
 document.addEventListener('click',event=>{if(event.target.closest?.('#checkout'))record('bag_enquiry');},true);
})();
