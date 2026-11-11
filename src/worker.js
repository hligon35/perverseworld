const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(m,s=400)=>json({error:m},s),clean=(v,n=200)=>String(v??'').trim().slice(0,n),emailOK=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=async r=>{const t=await r.text();if(t.length>65536)throw Error('Payload too large');return JSON.parse(t||'{}')};
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
const db=e=>{if(!e.DB)throw Error('D1 is not bound');return e.DB};
const sameOrigin=(r,e)=>!r.headers.get('origin')||r.headers.get('origin')===new URL(e.PUBLIC_BASE_URL).origin;
const b64=s=>atob(s.replace(/-/g,'+').replace(/_/g,'/'));
let keys={url:'',until:0,jwks:null};
async function verifyAccess(r,e){
 const issuer=clean(e.ADMIN_ACCESS_ISSUER,300).replace(/\/$/,'');
 const aud=e.ADMIN_ACCESS_AUD,allowed=String(e.ADMIN_ALLOWED_EMAILS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
 if(!issuer.startsWith('https://')||issuer.includes('REPLACE_')||!aud||String(aud).includes('REPLACE_')||!allowed.length)throw Error('Admin authentication not configured');
 const jwt=r.headers.get('cf-access-jwt-assertion')||'',parts=jwt.split('.');if(parts.length!==3)return null;
 let h,p;try{h=JSON.parse(b64(parts[0]));p=JSON.parse(b64(parts[1]));}catch{return null}
 const now=Math.floor(Date.now()/1000);
 if(h.alg!=='RS256'||!h.kid||p.iss!==issuer||!Array.isArray(p.aud)||!p.aud.includes(aud)||!Number.isFinite(p.exp)||p.exp<=now||!Number.isFinite(p.iat)||p.iat>now+60)return null;
 const email=String(p.email||'').toLowerCase();if(!allowed.includes(email))return null;
 const url=issuer+'/cdn-cgi/access/certs';
 if(keys.url!==url||Date.now()>keys.until){const res=await fetch(url);if(!res.ok)throw Error('Access key verification unavailable');keys={url,jwks:await res.json(),until:Date.now()+300000}}
 const jwk=keys.jwks.keys?.find(x=>x.kid===h.kid&&x.kty==='RSA');if(!jwk)return null;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const sig=Uint8Array.from(b64(parts[2]),x=>x.charCodeAt(0));
 return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,sig,new TextEncoder().encode(parts[0]+'.'+parts[1]))?email:null;
}
async function captcha(r,e,t){
 if(!e.TURNSTILE_SECRET||!t)return false;
 const form=new FormData();form.set('secret',e.TURNSTILE_SECRET);form.set('response',t);form.set('remoteip',r.headers.get('cf-connecting-ip')||'');
 const x=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
 return x.ok&&(await x.json()).success===true;
}
function product(row){let sizes={};try{sizes=JSON.parse(row.sizes_json||'{}')}catch{}return {id:row.id,name:row.name,sub:row.description,cat:row.category,price:row.price_cents/100,img:row.image_url,tag:row.badge,sizes,active:!!row.active}}
function productInput(b){
 const x={name:clean(b.name,150),description:clean(b.description,700),category:clean(b.category,40),image_url:clean(b.image_url,1500),badge:clean(b.badge,40),price_cents:Number(b.price_cents),sizes:b.sizes||{},active:b.active===false?0:1};
 if(!x.name||!['tees','hoodies','sets','accessories'].includes(x.category)||!Number.isInteger(x.price_cents)||x.price_cents<0||x.price_cents>100000000||typeof x.sizes!=='object'||Array.isArray(x.sizes)||Object.entries(x.sizes).length>16||Object.entries(x.sizes).some(([k,v])=>!(/^[A-Za-z0-9 -]{1,16}$/.test(k)&&Number.isInteger(v)&&v>=0&&v<=100000)))throw Error('Invalid product fields');
 if(x.image_url&&!/^builtin:[1-6]$/.test(x.image_url)&&!/^https:\/\/[\w.-]+(?:\/[\w\-./%?=&+#]*)?$/.test(x.image_url))throw Error('Image must be HTTPS or built-in');
 return {...x,sizes_json:JSON.stringify(x.sizes)};
}
async function sendEmail(e,to,subject,html,text,from){
 if(!e.RESEND_API_KEY)throw Error('Email provider not configured');
 const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+e.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({from:from||e.FROM_EMAIL,to:[to],subject,html,text})});
 if(!res.ok)throw Error('Email provider rejected request ('+res.status+')');return res.json();
}
async function publicAPI(r,e,path){
 if(r.method==='GET'&&path==='/api/config')return json({turnstileSiteKey:e.TURNSTILE_SITE_KEY||''});
 const d=db(e);
 if(r.method==='GET'&&path==='/api/products')return json({products:(await d.prepare('SELECT * FROM products WHERE active=1 ORDER BY id DESC').all()).results.map(product)});
 if(r.method==='POST'&&path==='/api/newsletter/subscribe'){
  const b=await parse(r);if(b.website)return json({ok:true});
  const email=clean(b.email,254).toLowerCase();if(!emailOK(email))return fail('Enter a valid email');
  if(!await captcha(r,e,b.turnstileToken))return fail('Verification is required',403);
  await d.prepare("INSERT INTO subscribers(email,unsub_token,status) VALUES(?,?,'active') ON CONFLICT(email) DO UPDATE SET status='active',consent_at=CURRENT_TIMESTAMP").bind(email,token()).run();
  return json({ok:true});
 }
 if(r.method==='POST'&&path==='/api/submissions'){
  const b=await parse(r);if(b.website)return json({ok:true});
  const name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),subject=clean(b.subject,160),message=clean(b.message,4000);
  if(!name||!emailOK(email)||!subject||!message)return fail('Fill in all required fields');
  if(!await captcha(r,e,b.turnstileToken))return fail('Verification is required',403);
  await d.prepare('INSERT INTO submissions(name,email,subject,message) VALUES(?,?,?,?)').bind(name,email,subject,message).run();
  return json({ok:true});
 }
 return fail('Not found',404);
}
async function adminAPI(r,e,path,identity){
 const d=db(e),method=r.method;
 if(method==='GET'&&path==='/api/admin/session')return json({email:identity});
 if(method==='GET'&&path==='/api/admin/overview'){
  const q=async s=>(await d.prepare(s).first()).count;
  const [products,subscribers,submissions,mailbox]=await Promise.all([q('SELECT COUNT(*) AS count FROM products WHERE active=1'),q("SELECT COUNT(*) AS count FROM subscribers WHERE status='active'"),q("SELECT COUNT(*) AS count FROM submissions WHERE status='new'"),q("SELECT COUNT(*) AS count FROM mailbox WHERE status='unread'")]);
  return json({products,subscribers,submissions,mailbox});
 }
 if(method==='GET'&&path==='/api/admin/products')return json({items:(await d.prepare('SELECT * FROM products ORDER BY id DESC LIMIT 500').all()).results.map(product)});
 if(['POST','PUT'].includes(method)&&/^\/api\/admin\/products(?:\/\d+)?$/.test(path)){
  const b=productInput(await parse(r)),id=Number(path.split('/')[4]);
  if(method==='PUT'){
   if(!Number.isInteger(id)||id<=0)return fail('Invalid product ID');
   const result=await d.prepare('UPDATE products SET name=?,description=?,category=?,price_cents=?,image_url=?,badge=?,sizes_json=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.name,b.description,b.category,b.price_cents,b.image_url,b.badge,b.sizes_json,b.active,id).run();
   if(!result.meta.changes)return fail('Product not found',404);return json({ok:true,id});
  }
  const result=await d.prepare('INSERT INTO products(name,description,category,price_cents,image_url,badge,sizes_json,active) VALUES(?,?,?,?,?,?,?,?)').bind(b.name,b.description,b.category,b.price_cents,b.image_url,b.badge,b.sizes_json,b.active).run();
  return json({ok:true,id:result.meta.last_row_id},201);
 }
 if(method==='GET'&&path==='/api/admin/submissions')return json({items:(await d.prepare('SELECT * FROM submissions ORDER BY id DESC LIMIT 250').all()).results});
 if(method==='PATCH'&&/^\/api\/admin\/submissions\/\d+$/.test(path)){
  const b=await parse(r),status=clean(b.status,20);if(!['new','reviewed','closed'].includes(status))return fail('Invalid status');
  await d.prepare('UPDATE submissions SET status=? WHERE id=?').bind(status,Number(path.split('/').pop())).run();return json({ok:true});
 }
 if(method==='GET'&&path==='/api/admin/subscribers')return json({items:(await d.prepare('SELECT id,email,status,consent_at,created_at FROM subscribers ORDER BY id DESC LIMIT 500').all()).results});
 if(method==='GET'&&path==='/api/admin/newsletters')return json({items:(await d.prepare('SELECT * FROM newsletters ORDER BY id DESC LIMIT 150').all()).results});
 if(method==='POST'&&path==='/api/admin/newsletters'){
  const b=await parse(r),subject=clean(b.subject,180),preheader=clean(b.preheader,240),html=clean(b.body_html,30000);
  if(!subject||!html)return fail('Subject and content required');
  const x=await d.prepare('INSERT INTO newsletters(subject,preheader,body_html) VALUES(?,?,?)').bind(subject,preheader,html).run();return json({ok:true,id:x.meta.last_row_id},201);
 }
 if(method==='POST'&&/^\/api\/admin\/newsletters\/\d+\/send$/.test(path)){
  if(!e.RESEND_API_KEY||!e.FROM_EMAIL)return fail('Sending requires verified provider configuration',503);
  const id=Number(path.split('/')[4]),letter=await d.prepare('SELECT * FROM newsletters WHERE id=?').bind(id).first();if(!letter)return fail('Newsletter not found',404);
  const batch=await d.prepare("SELECT id,email,unsub_token FROM subscribers WHERE status='active' AND id NOT IN (SELECT subscriber_id FROM newsletter_deliveries WHERE newsletter_id=?) ORDER BY id LIMIT 20").bind(id).all();let sent=0,failed=0;
  for(const person of batch.results){try{
    const link=e.PUBLIC_BASE_URL+'/unsubscribe?token='+encodeURIComponent(person.unsub_token);
    const html=letter.body_html+'<p style="font-size:12px;color:#888">Unsubscribe: <a href="'+escapeHTML(link)+'">'+escapeHTML(link)+'</a></p>';
    const result=await sendEmail(e,person.email,letter.subject,html,letter.preheader||letter.subject);
    await d.prepare('INSERT OR IGNORE INTO newsletter_deliveries(newsletter_id,subscriber_id,provider_id) VALUES(?,?,?)').bind(id,person.id,result.id||'').run();sent++;
   }catch{failed++}}
  await d.prepare("UPDATE newsletters SET status='sending',sent_count=(SELECT COUNT(*) FROM newsletter_deliveries WHERE newsletter_id=?),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id,id).run();
  const remaining=(await d.prepare("SELECT COUNT(*) as n FROM subscribers WHERE status='active' AND id NOT IN (SELECT subscriber_id FROM newsletter_deliveries WHERE newsletter_id=?)").bind(id).first()).n;
  if(!remaining)await d.prepare("UPDATE newsletters SET status='sent' WHERE id=?").bind(id).run();
  return json({sent,failed,remaining});
 }
 if(method==='GET'&&path==='/api/admin/mailbox')return json({items:(await d.prepare('SELECT * FROM mailbox ORDER BY id DESC LIMIT 250').all()).results});
 if(method==='POST'&&path==='/api/admin/mailbox/reply'){
  const b=await parse(r),to=clean(b.to,254).toLowerCase(),subject=clean(b.subject,180),body=clean(b.body,6000);
  if(!emailOK(to)||!subject||!body)return fail('Valid recipient, subject and message required');
  if(!e.RESEND_API_KEY||!e.MAILBOX_FROM_EMAIL)return fail('Outbound mailbox not configured',503);
  const result=await sendEmail(e,to,subject,'<p style="white-space:pre-wrap">'+escapeHTML(body)+'</p>',body,e.MAILBOX_FROM_EMAIL);
  await d.prepare("INSERT INTO mailbox(direction,sender,recipient,subject,body_text,status,external_id) VALUES('outbound',?,?,?,?,'sent',?)").bind(e.MAILBOX_FROM_EMAIL,to,subject,body,result.id||'').run();return json({ok:true});
 }
 if(method==='PATCH'&&/^\/api\/admin\/mailbox\/\d+$/.test(path)){
  const b=await parse(r);if(!['read','unread','archived'].includes(b.status))return fail('Invalid status');
  await d.prepare('UPDATE mailbox SET status=? WHERE id=?').bind(b.status,Number(path.split('/').pop())).run();return json({ok:true});
 }
 return fail('Not found',404);
}
export default {
 async fetch(r,e){
  const url=new URL(r.url),path=url.pathname;
  try{
   if(path==='/unsubscribe'){
    const t=clean(url.searchParams.get('token'),100);if(!/^[a-f0-9]{48}$/.test(t))return new Response('Invalid unsubscribe link',{status:400});
    await db(e).prepare("UPDATE subscribers SET status='unsubscribed' WHERE unsub_token=?").bind(t).run();
    return new Response('You have been unsubscribed from Perverse World updates.',{headers:{'content-type':'text/plain; charset=utf-8'}});
   }
   if(path==='/admin'||path.startsWith('/admin/')||path.startsWith('/api/admin/')){
    let identity;try{identity=await verifyAccess(r,e)}catch(x){return fail(x.message,503)}
    if(!identity)return fail('Unauthorized: Cloudflare Access authentication required',401);
    if(r.method!=='GET'&&!sameOrigin(r,e))return fail('Invalid origin',403);
    if(path.startsWith('/api/admin/'))return adminAPI(r,e,path,identity);
    if(r.method!=='GET')return fail('Method not allowed',405);
    return e.ASSETS.fetch(new Request(new URL('/admin/index.html',url),r));
   }
   if(path.startsWith('/api/')){
    if(r.method!=='GET'&&!sameOrigin(r,e))return fail('Invalid origin',403);
    return publicAPI(r,e,path);
   }
   return e.ASSETS.fetch(r);
  }catch(err){console.error('Request failed',err);return fail(err instanceof SyntaxError?'Invalid JSON':err.message==='Payload too large'?'Payload too large':'Request failed',err.message==='Payload too large'?413:500)}
 },
 async email(message,e){
  if(!e.DB)throw Error('D1 not configured');
  const to=clean(message.to,254).toLowerCase();if(!to.endsWith('@'+String(e.INBOUND_DOMAIN||'').toLowerCase())){message.setReject('Recipient domain not allowed');return}
  const raw=await new Response(message.raw).text(),head=raw.split(/\r?\n\r?\n/,1)[0];
  const subject=clean(head.match(/^subject:\s*(.*)$/im)?.[1]||'(no subject)',240);
  const body=clean(raw.slice(head.length).replace(/^\s+/,'').replace(/<[^>]*>/g,' '),12000);
  await e.DB.prepare("INSERT INTO mailbox(direction,sender,recipient,subject,body_text,external_id) VALUES('inbound',?,?,?,?,?)").bind(clean(message.from,254),to,subject,body,clean(message.headers.get('message-id'),255)).run();
 }
};
