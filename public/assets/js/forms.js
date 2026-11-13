/* Public forms share action-specific, single-use Turnstile verification. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 if($('contactForm')&&new URLSearchParams(window.location?.search||'').get('enquiry')==='bag'){
  const form=$('contactForm');form.elements.subject.value='Order enquiry';
  try{const bag=JSON.parse(sessionStorage.getItem('pw-cart')||'[]');if(Array.isArray(bag)&&bag.length)form.elements.message.value='I would like to ask about these pieces:\n\n'+bag.slice(0,40).map(item=>`${String(item.name||'Item').slice(0,150)} — Size ${item.size}`).join('\n');}catch{}
 }
 async function request(path,options={}){const response=await fetch(path,{credentials:'same-origin',...options});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'We could not complete the request. Please try again.');return body;}
 const forms=[
  {form:$('launchSignup'),mount:$('launch-newsletter-challenge'),status:$('launchSignupMsg'),action:'newsletter',endpoint:'/api/newsletter/subscribe',launch:true},
  {form:$('signup'),mount:$('newsletter-challenge'),status:$('signupMsg'),action:'newsletter',endpoint:'/api/newsletter/subscribe'},
  {form:$('contactForm'),mount:$('contact-challenge'),status:$('contact-status'),action:'contact',endpoint:'/api/submissions'}
 ].filter(item=>item.form);
 for(const item of forms){
  item.token='';item.widget=null;item.busy=false;item.requestId=null;item.button=item.form.querySelector('button[type="submit"]');item.button.disabled=true;
  item.form.onsubmit=async event=>{
   event.preventDefault();if(item.busy)return;if(!item.token){item.status.textContent='Complete the verification first.';return;}
   item.busy=true;item.button.disabled=true;item.form.setAttribute?.('aria-busy','true');item.status.textContent='Sending…';
   try{
    const data=Object.fromEntries(new FormData(item.form));data.turnstileToken=item.token;
    if(item.action==='contact'){item.requestId||=crypto.randomUUID();data.requestId=item.requestId;}
    const result=await request(item.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    item.status.textContent=result.message||(item.action==='newsletter'?'Check your inbox to confirm your email.':'Your message has been received.');if(result.reference)item.status.textContent+=' Reference: '+result.reference+'.';
    item.form.reset();item.requestId=null;
   }catch(error){item.status.textContent=error.message;}
   finally{item.busy=false;item.token='';item.button.disabled=true;item.form.setAttribute?.('aria-busy','false');if(item.widget!==null&&window.turnstile)window.turnstile.reset(item.widget);}
  };
 }
 let catalogLoaded=false,siteKey='',loading=null,open=!$('launchGate')||!!window.PWLaunch?.isOpen();
 async function activate(){
  if(open&&!catalogLoaded){catalogLoaded=true;request('/api/products').then(body=>{if(Array.isArray(body.products))window.PWStore.updateCatalog(body.products);}).catch(()=>{});}
  const visible=forms.filter(item=>item.widget===null&&(item.launch?!open:open));if(!visible.length)return;
  if(!siteKey){try{siteKey=(await request('/api/config')).turnstileSiteKey||'';}catch{}}
  if(!siteKey){visible.forEach(item=>item.status.textContent='Email verification is temporarily unavailable. Please try again shortly.');return;}
  const mount=()=>{
   for(const item of visible){if(item.widget!==null)continue;const changed=token=>{item.token=token;item.button.disabled=!token||item.busy;};
    try{item.widget=window.turnstile.render(item.mount,{sitekey:siteKey,action:item.action,theme:'dark',callback:changed,'expired-callback':()=>changed(''),'error-callback':()=>{changed('');item.status.textContent='Verification is temporarily unavailable. Please try again later.';},'timeout-callback':()=>changed('')});item.status.textContent=item.action==='newsletter'?'Confirm by email. Unsubscribe whenever you like.':'Your message stays with us. We’ll email you an acknowledgement.';}catch{item.status.textContent='Verification is temporarily unavailable. Please try again later.';}
   }
  };
  if(window.turnstile){mount();return;}
  if(loading){loading.then(mount);return;}
  loading=new Promise(resolve=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>{mount();resolve();};script.onerror=()=>{visible.forEach(item=>item.status.textContent='Verification is temporarily unavailable. Please try again later.');loading=null;};document.head.append(script);});
 }
 if($('launchGate'))document.addEventListener('pw:entered',()=>{open=true;activate();},{once:true});
 activate();
})();
