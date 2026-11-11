/* Each form is authored in its own page. Tokens remain single-use and action-specific. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  async function request(path,options={}){
    const response=await fetch(path,{credentials:'same-origin',...options});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body.error||'Request failed');return body;
  }
  const forms=[
    {form:$('signup'),mount:$('newsletter-challenge'),status:$('signupMsg'),action:'newsletter',endpoint:'/api/newsletter/subscribe',success:'YOU’RE IN. Watch for new drops.'},
    {form:$('contactForm'),mount:$('contact-challenge'),status:$('contact-status'),action:'contact',endpoint:'/api/submissions',success:'MESSAGE SENT.'}
  ].filter(item=>item.form);
  for(const item of forms){
    item.token='';item.widget=null;item.busy=false;item.button=item.form.querySelector('button[type="submit"]');item.button.disabled=true;
    item.form.onsubmit=async event=>{
      event.preventDefault();if(item.busy)return;
      if(!item.token){item.status.textContent='Complete the verification challenge first.';return;}
      item.busy=true;item.button.disabled=true;item.status.textContent='Sending…';
      try{
        const data=Object.fromEntries(new FormData(item.form));
        if(item.action==='newsletter')data.email=$('email').value;
        data.turnstileToken=item.token;
        await request(item.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
        item.status.textContent=item.success;item.form.reset();
      }catch(error){item.status.textContent=error.message;}
      finally{item.busy=false;item.token='';item.button.disabled=true;if(item.widget!==null&&window.turnstile)window.turnstile.reset(item.widget);}
    };
  }
  async function boot(){
    request('/api/products').then(body=>{if(Array.isArray(body.products))window.PWStore.updateCatalog(body.products);}).catch(error=>console.warn('Preview catalog:',error.message));
    if(!forms.length)return;
    let siteKey='';try{siteKey=(await request('/api/config')).turnstileSiteKey||'';}catch{}
    if(!siteKey){forms.forEach(item=>item.status.textContent='This form opens when verification is configured.');return;}
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    script.onload=()=>{
      for(const item of forms){
        const changed=token=>{item.token=token;item.button.disabled=!token||item.busy;};
        try{
          item.widget=window.turnstile.render(item.mount,{sitekey:siteKey,action:item.action,theme:'dark',callback:changed,'expired-callback':()=>changed(''),'error-callback':()=>{changed('');item.status.textContent='Verification is temporarily unavailable. Please try again later.';},'timeout-callback':()=>changed('')});
          item.status.textContent='Complete the verification to send.';
        }catch{item.status.textContent='Verification is temporarily unavailable. Please try again later.';}
      }
    };
    script.onerror=()=>forms.forEach(item=>item.status.textContent='Verification is temporarily unavailable. Please try again later.');
    document.head.append(script);
  }
  boot();
})();
