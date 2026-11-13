import {readLimited as limitedBody} from './http.js';
import {storefrontResponse} from './storefront-response.js';
import {legacyRedirects} from './site/routes.js';
import {retiredProductIds} from './site/catalog-policy.js';
import catalog from './site/products.json' with {type:'json'};
import PostalMime from 'postal-mime';
import {newsletterTemplate} from '../public/assets/js/newsletter-template.js';
import {verifyResendWebhook,importResendEmail,resendGet} from './mail.js';
import {analyticsPeriod,adminAnalytics,recordAnalytics} from './analytics.js';
import {deliverEmail,drainOutbox,brandedMessage} from './email.js';
import {subscribeCustomer,subscriberLink,saveContact} from './customer-messages.js';
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(m,s=400)=>json({error:m},s),clean=(v,n=200)=>String(v??'').trim().slice(0,n),emailOK=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse=async r=>JSON.parse(new TextDecoder().decode(await limitedBody(r.body,65536))||'{}');
const db=e=>{if(!e.DB)throw Error('D1 is not bound');return e.DB};
const sameOrigin=(r,e)=>{const origin=r.headers.get('origin');if(!origin)return true;const base=new URL(e.PUBLIC_BASE_URL);return origin===base.origin||(base.hostname==='perverseworld.com'&&origin==='https://www.perverseworld.com'&&new URL(r.url).origin===origin);};
const mediaPath=/^\/media\/products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/;
const imageOK=value=>mediaPath.test(value)||/^\/assets\/images\/[\w.-]+$/.test(value)||/^https:\/\/[^\s<>"']+$/.test(value);
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
// Turnstile tokens are single-use and must be verified server-side on each form submission.
// Cloudflare's response must also match the domain and the intended form action.
async function captcha(r,e,t,expectedAction){
 if(!e.TURNSTILE_SECRET||!e.TURNSTILE_SITE_KEY) return {ok:false,misconfigured:true};
 if(typeof t!=='string'||t.length<1||t.length>2048)return {ok:false};
 const form=new FormData();
 form.set('secret',e.TURNSTILE_SECRET);
 form.set('response',t);
 const ip=r.headers.get('cf-connecting-ip');
 if(ip)form.set('remoteip',ip);
 try{
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(8000)});
  if(!response.ok)return {ok:false};
  const result=await response.json();
  const hostname=clean(result.hostname,255).toLowerCase();
  const baseHost=new URL(e.PUBLIC_BASE_URL).hostname.toLowerCase();
  const allowedHosts=new Set([baseHost]);
  if(baseHost==='perverseworld.com')allowedHosts.add('www.perverseworld.com');
  // Explicit local development support. Never accept unrelated production hostnames.
  if(e.TURNSTILE_ALLOW_LOCALHOST==='true')allowedHosts.add('localhost');
  return {ok:result.success===true&&allowedHosts.has(hostname)&&result.action===expectedAction};
 }catch(error){
  console.error('Turnstile verification unavailable',error);
  return {ok:false};
 }
}
function product(row){
 let sizes={};try{sizes=JSON.parse(row.sizes_json||'{}')}catch{}
 const builtin=String(row.image_url||'').match(/^builtin:(\d+)$/);
 const media=builtin?catalog.find(p=>p.id===Number(builtin[1])):null;
 const ownMedia=catalog.find(p=>p.id===Number(row.id));
 // Preserve administrator edits, while upgrading the original seeded metadata.
 const legacyNames={2:'Worldscape Tee',3:'Green Flame Set',4:'Midnight Riot Hoodie',5:'World Logo Hoodie'};
 const legacy=media&&row.name===legacyNames[row.id]&&(!row.updated_at||row.updated_at===row.created_at);
 let savedPrices=[];try{const parsed=JSON.parse(row.options_json||'[]');if(Array.isArray(parsed))savedPrices=parsed;}catch{}
 let images=[];try{images=JSON.parse(row.images_json||'[]');}catch{}if(!Array.isArray(images))images=[];
 const gallery=images.filter(view=>!view.optionId);
 const options=ownMedia?.options?.map(option=>{const saved=savedPrices.find(item=>item?.id===option.id&&Number.isInteger(item.price_cents)&&item.price_cents>=0);const views=images.filter(view=>view.optionId===option.id);return {...option,price:saved?saved.price_cents/100:option.price,sizes:saved?.sizes||sizes,...(views.length?{img:views[0].src,images:views}:{})};});
 const views=gallery.length?gallery:media?.images||[];
 return {id:row.id,name:legacy?media.name:row.name,sub:legacy?media.sub:row.description,cat:legacy?media.cat:row.category,price:options?Math.min(...options.map(option=>option.price)):legacy?media.price:row.price_cents/100,img:gallery[0]?.src||media?.img||row.image_url,imageRef:row.image_url,images:views,media:images.length?images:[...(views.length?views:[{src:row.image_url,label:'Front'}]).filter(v=>imageOK(v.src)),...(options||[]).flatMap(option=>option.images.map(view=>({...view,optionId:option.id})))],slug:ownMedia?.slug,options,tag:row.badge,sizes,active:!!row.active};
}
const sizesOK=sizes=>sizes&&typeof sizes==='object'&&!Array.isArray(sizes)&&Object.entries(sizes).length<=16&&Object.entries(sizes).every(([k,v])=>/^[A-Za-z0-9 -]{1,16}$/.test(k)&&Number.isInteger(v)&&v>=0&&v<=100000);
function productInput(b){
 const x={name:clean(b.name,150),description:clean(b.description,700),category:clean(b.category,40),image_url:clean(b.image_url,1500),badge:clean(b.badge,40),price_cents:Number(b.price_cents),sizes:b.sizes||{},active:b.active===false?0:1};
 if(!x.name||!['tees','hoodies','sets','accessories'].includes(x.category)||!Number.isInteger(x.price_cents)||x.price_cents<0||x.price_cents>100000000||typeof x.sizes!=='object'||Array.isArray(x.sizes)||Object.entries(x.sizes).length>16||Object.entries(x.sizes).some(([k,v])=>!(/^[A-Za-z0-9 -]{1,16}$/.test(k)&&Number.isInteger(v)&&v>=0&&v<=100000)))throw Error('Invalid product fields');
 if(x.image_url&&!/^builtin:[2-5]$/.test(x.image_url)&&!imageOK(x.image_url))throw Error('Choose an uploaded image, a site image or an HTTPS URL');
 const images=b.images;
 if(images!==undefined&&(!Array.isArray(images)||images.length>24||images.some(view=>!view||!imageOK(view.src)||typeof view.label!=='string'||view.label.length>60||!['','hoodie','sweats'].includes(view.optionId||''))))throw Error('Invalid product images');
 const prices=b.option_prices||[];
 if(!Array.isArray(prices)||prices.length>2||prices.some(p=>!p||!['hoodie','sweats'].includes(p.id)||!Number.isInteger(p.price_cents)||p.price_cents<0||p.price_cents>100000000)||new Set(prices.map(p=>p.id)).size!==prices.length)throw Error('Invalid item prices');
 const optionSizes=b.option_sizes||{};
 if(Object.keys(optionSizes).some(id=>!['hoodie','sweats'].includes(id)||!sizesOK(optionSizes[id])))throw Error('Invalid item stock');
 return {...x,sizes_json:JSON.stringify(x.sizes),options_json:JSON.stringify(prices.map(p=>({...p,...(optionSizes[p.id]?{sizes:optionSizes[p.id]}:{})}))),images_json:images===undefined?null:JSON.stringify(images.map(v=>({src:v.src,label:clean(v.label,60),...(v.optionId?{optionId:v.optionId}:{})})))};
}
async function sendEmail(e,to,subject,html,text,from,headers){
 return deliverEmail(e,{from:from||e.FROM_EMAIL,to:[to],subject,html,text,...(headers?{headers}:{})});
}
async function publicAPI(r,e,path,ctx){
 if(r.method==='GET'&&path==='/api/config')return json({turnstileSiteKey:e.TURNSTILE_SITE_KEY||''});
 const d=db(e);
 if(r.method==='GET'&&path==='/api/products')return json({products:(await d.prepare('SELECT * FROM products WHERE active=1 ORDER BY id DESC').all()).results.filter(row=>!retiredProductIds.includes(Number(row.id))).map(product)});
 if(r.method==='POST'&&path==='/api/newsletter/subscribe'){
  const b=await parse(r);if(b.website)return json({ok:true});
  const email=clean(b.email,254).toLowerCase();if(!emailOK(email))return fail('Enter a valid email');
  const verification=await captcha(r,e,b.turnstileToken,'newsletter');
  if(verification.misconfigured)return fail('Form verification is not configured',503);
  if(!verification.ok)return fail('Turnstile verification failed. Please try again.',403);
  return subscribeCustomer(e,email,ctx);
 }
 if(r.method==='POST'&&path==='/api/submissions'){
  const b=await parse(r);if(b.website)return json({ok:true});
  const name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),subject=clean(b.subject,160).replace(/[\r\n]+/g,' '),message=clean(b.message,4000);
  if(!name||!emailOK(email)||!subject||!message)return fail('Fill in all required fields');
  const verification=await captcha(r,e,b.turnstileToken,'contact');
  if(verification.misconfigured)return fail('Form verification is not configured',503);
  if(!verification.ok)return fail('Turnstile verification failed. Please try again.',403);
  return saveContact(e,{name,email,subject,message,requestId:b.requestId},ctx);
 }
 return fail('Not found',404);
}
async function adminAPI(r,e,path,identity){
 const d=db(e),method=r.method;
 if(method==='GET'&&path==='/api/admin/session')return json({email:identity});
 if(method==='GET'&&path==='/api/admin/analytics'){
  let period;try{period=analyticsPeriod(new URL(r.url).searchParams.get('days')||'30');}catch(error){return fail(error.message);}
  return json(await adminAnalytics(d,period,product));
 }
 if(method==='POST'&&path==='/api/admin/mailbox/sync'){
  if(!e.RESEND_API_KEY)return fail('Add RESEND_API_KEY as a Worker secret to connect Resend mail.',503);
  const body=await parse(r),after=clean(body.after,40);if(after&&!/^[a-f0-9-]{36}$/i.test(after))return fail('Invalid mail cursor');
  const list=await resendGet(e,'/emails/receiving?limit=20'+(after?'&after='+after:''));let imported=0;
  for(const item of list.data||[]){if(!(item.to||[]).some(to=>String(to).toLowerCase().includes(e.INBOUND_ADDRESS||'info@perverseworld.com')))continue;await new Promise(resolve=>setTimeout(resolve,600));if(await importResendEmail(e,item.id))imported++;}
  return json({imported,after:list.has_more?list.data?.at(-1)?.id||'':''});
 }
 if(method==='POST'&&path==='/api/admin/media'){
  if(!e.PRODUCT_IMAGES)return fail('Image storage is not configured',503);
  const type=r.headers.get('content-type')?.split(';')[0],types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  if(!types[type])return fail('Choose a JPEG, PNG or WebP image',415);
  const bytes=await limitedBody(r.body,5*1024*1024);
  const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/png'?[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!valid)return fail('The file is not a valid '+type+' image',415);
  const key='products/'+crypto.randomUUID()+'.'+types[type];
  await e.PRODUCT_IMAGES.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});
  return json({src:'/media/'+key},201);
 }
 if(method==='GET'&&path==='/api/admin/overview'){
  const q=async s=>(await d.prepare(s).first()).count;
  const [products,subscribers,submissions,mailbox]=await Promise.all([q('SELECT COUNT(*) AS count FROM products WHERE active=1'),q("SELECT COUNT(*) AS count FROM subscribers WHERE status='active'"),q("SELECT COUNT(*) AS count FROM submissions WHERE status='new'"),q("SELECT COUNT(*) AS count FROM mailbox WHERE status='unread'")]);
  return json({products,subscribers,submissions,mailbox});
 }
 if(method==='GET'&&path==='/api/admin/products')return json({items:(await d.prepare('SELECT * FROM products ORDER BY id DESC LIMIT 500').all()).results.map(product)});
 if(['POST','PUT'].includes(method)&&/^\/api\/admin\/products(?:\/\d+)?$/.test(path)){
  const input=await parse(r);let b;try{b=productInput(input)}catch(error){return fail(error.message)}
  const id=Number(path.split('/')[4]);
  if(method==='PUT'){
   if(!Number.isInteger(id)||id<=0)return fail('Invalid product ID');
   const result=await d.prepare('UPDATE products SET name=?,description=?,category=?,price_cents=?,image_url=?,badge=?,sizes_json=?,options_json=?,active=?,images_json=COALESCE(?,images_json),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.name,b.description,b.category,b.price_cents,b.image_url,b.badge,b.sizes_json,b.options_json,b.active,b.images_json,id).run();
   if(!result.meta.changes)return fail('Product not found',404);return json({ok:true,id});
  }
  const result=await d.prepare('INSERT INTO products(name,description,category,price_cents,image_url,badge,sizes_json,options_json,active,images_json) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(b.name,b.description,b.category,b.price_cents,b.image_url,b.badge,b.sizes_json,b.options_json,b.active,b.images_json||'[]').run();
  return json({ok:true,id:result.meta.last_row_id},201);
 }
 if(method==='GET'&&path==='/api/admin/submissions')return json({items:(await d.prepare('SELECT * FROM submissions ORDER BY id DESC LIMIT 250').all()).results});
 if(method==='PATCH'&&/^\/api\/admin\/submissions\/\d+$/.test(path)){
  const b=await parse(r),status=clean(b.status,20);if(!['new','reviewed','closed'].includes(status))return fail('Invalid status');
  await d.prepare('UPDATE submissions SET status=? WHERE id=?').bind(status,Number(path.split('/').pop())).run();return json({ok:true});
 }
 if(method==='GET'&&path==='/api/admin/subscribers'){
  const url=new URL(r.url),status=url.searchParams.get('status')||'all',q=clean(url.searchParams.get('q'),100),page=Math.max(0,parseInt(url.searchParams.get('page')||'0',10)||0);
  if(!['all','pending','active','unsubscribed'].includes(status)||page>100000)return fail('Invalid audience filter');
  const where=[...(status==='all'?[]:['s.status=?']),...(q?["s.email LIKE ? ESCAPE '\\'"]:[])],args=[...(status==='all'?[]:[status]),...(q?['%'+q.replace(/[\\%_]/g,'\\$&')+'%']:[])],filter=where.length?' WHERE '+where.join(' AND '):'';
  const total=(await d.prepare('SELECT COUNT(*) AS count FROM subscribers s'+filter).bind(...args).first()).count;
  const items=(await d.prepare("SELECT s.id,s.email,s.status,s.consent_at,s.confirmed_at,s.created_at,CASE WHEN EXISTS(SELECT 1 FROM email_outbox o WHERE o.subscriber_id=s.id AND o.optin_version=s.optin_version AND o.status='failed') THEN 'failed' WHEN EXISTS(SELECT 1 FROM email_outbox o WHERE o.subscriber_id=s.id AND o.optin_version=s.optin_version AND o.status IN ('queued','sending')) THEN 'queued' WHEN EXISTS(SELECT 1 FROM email_outbox o WHERE o.subscriber_id=s.id AND o.optin_version=s.optin_version AND o.status='sent') THEN 'sent' ELSE '—' END AS email_status FROM subscribers s"+filter+' ORDER BY s.id DESC LIMIT 50 OFFSET ?').bind(...args,page*50).all()).results;
  return json({items,total,page});
 }
 if(method==='PATCH'&&/^\/api\/admin\/subscribers\/\d+$/.test(path)){
  const b=await parse(r);if(b.status!=='unsubscribed')return fail('Subscribers must confirm their own email before activation');
  const id=Number(path.split('/').pop());const result=await d.batch([d.prepare("UPDATE subscribers SET status='unsubscribed',confirm_token_hash='' WHERE id=?").bind(id),d.prepare("INSERT OR IGNORE INTO subscriber_events(subscriber_id,event,optin_version) SELECT id,'unsubscribed',optin_version FROM subscribers WHERE id=?").bind(id)]);return result[0].meta.changes?json({ok:true}):fail('Subscriber not found',404);
 }
 if(method==='POST'&&/^\/api\/admin\/subscribers\/\d+\/confirmation$/.test(path)){
  const row=await d.prepare('SELECT email,status FROM subscribers WHERE id=?').bind(Number(path.split('/')[4])).first();if(!row||row.status!=='pending')return fail('Only pending subscribers can receive a new confirmation link');
  return subscribeCustomer(e,row.email,null,{force:true});
 }
 if(method==='GET'&&path==='/api/admin/email/outbox'){
  return json({configured:!!(e.RESEND_API_KEY&&e.FROM_EMAIL),counts:(await d.prepare('SELECT status,COUNT(*) AS count FROM email_outbox GROUP BY status').all()).results,items:(await d.prepare('SELECT id,kind,recipient,status,attempts,last_error,created_at,sent_at FROM email_outbox ORDER BY created_at DESC LIMIT 30').all()).results});
 }
 if(method==='POST'&&path==='/api/admin/email/retry'){
  await d.prepare("UPDATE email_outbox SET status='queued',attempts=0,next_attempt_at=CURRENT_TIMESTAMP WHERE status='failed' AND (first_attempt_at IS NULL OR first_attempt_at>datetime('now','-23 hours'))").run();
  return json(await drainOutbox(e,10));
 }
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
    const current=await d.prepare('SELECT status FROM subscribers WHERE id=?').bind(person.id).first();if(current?.status!=='active')continue;
    const link=e.PUBLIC_BASE_URL+'/unsubscribe?token='+encodeURIComponent(person.unsub_token);
    const html=newsletterTemplate({...letter,baseURL:e.PUBLIC_BASE_URL,unsubscribeURL:link});
    const text=[letter.preheader,letter.body_html.replace(/<[^>]*>/g,' '),'Shop: '+e.PUBLIC_BASE_URL+'/shop','Unsubscribe: '+link].filter(Boolean).join('\n\n');
    const result=await deliverEmail(e,{to:[person.email],subject:letter.subject,html,text,reply_to:e.MAILBOX_FROM_EMAIL||e.FROM_EMAIL,headers:{'List-Unsubscribe':'<'+link+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}},'pw-campaign/'+id+'/'+person.id);
    await d.prepare('INSERT OR IGNORE INTO newsletter_deliveries(newsletter_id,subscriber_id,provider_id) VALUES(?,?,?)').bind(id,person.id,result.id||'').run();sent++;
   }catch{failed++}}
  await d.prepare("UPDATE newsletters SET status='sending',sent_count=(SELECT COUNT(*) FROM newsletter_deliveries WHERE newsletter_id=?),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id,id).run();
  const remaining=(await d.prepare("SELECT COUNT(*) as n FROM subscribers WHERE status='active' AND id NOT IN (SELECT subscriber_id FROM newsletter_deliveries WHERE newsletter_id=?)").bind(id).first()).n;
  if(!remaining)await d.prepare("UPDATE newsletters SET status='sent' WHERE id=?").bind(id).run();
  return json({sent,failed,remaining});
 }
 if(method==='GET'&&path==='/api/admin/mailbox'){
  const url=new URL(r.url),folder=url.searchParams.get('folder')||'inbox';
  const folders={inbox:"direction='inbound' AND status!='archived'",sent:"direction='outbound' AND status!='archived'",unread:"direction='inbound' AND status='unread'",archived:"status='archived'"};
  if(!folders[folder])return fail('Invalid folder');
  const search=clean(url.searchParams.get('q'),100),page=Math.max(0,Math.min(100000,parseInt(url.searchParams.get('page')||'0',10)||0));
  const where=folders[folder]+(search?" AND (subject LIKE ? ESCAPE '\\' OR sender LIKE ? ESCAPE '\\' OR recipient LIKE ? ESCAPE '\\' OR body_text LIKE ? ESCAPE '\\')":'');
  const term='%'+search.replace(/[\\%_]/g,'\\$&')+'%',args=search?[term,term,term,term]:[];
  const total=(await d.prepare('SELECT COUNT(*) AS count FROM mailbox WHERE '+where).bind(...args).first()).count;
  const rows=await d.prepare('SELECT id,direction,sender,recipient,subject,substr(body_text,1,160) AS snippet,status,created_at FROM mailbox WHERE '+where+' ORDER BY id DESC LIMIT 50 OFFSET ?').bind(...args,page*50).all();
  return json({items:rows.results,total,page,folder,address:e.MAILBOX_FROM_EMAIL||'info@perverseworld.com'});
 }
 if(method==='GET'&&/^\/api\/admin\/mailbox\/\d+$/.test(path)){
  const item=await d.prepare('SELECT * FROM mailbox WHERE id=?').bind(Number(path.split('/').pop())).first();return item?json({item}):fail('Message not found',404);
 }
 if(method==='POST'&&path==='/api/admin/mailbox/reply'){
  const b=await parse(r),to=clean(b.to,254).toLowerCase(),subject=clean(b.subject,180),body=clean(b.body,6000);
  if(!emailOK(to)||!subject||!body)return fail('Valid recipient, subject and message required');
  if(!e.RESEND_API_KEY||!e.MAILBOX_FROM_EMAIL)return fail('Outbound mailbox not configured',503);
  const parent=b.reply_to_id?await d.prepare("SELECT external_id FROM mailbox WHERE id=? AND direction='inbound'").bind(Number(b.reply_to_id)).first():null;
  const messageId=parent?.external_id;const headers=messageId&&/^<[^\s<>]+>$/.test(messageId)?{'In-Reply-To':messageId,References:messageId}:undefined;
  const html=brandedMessage({title:subject,content:'<p style="white-space:pre-wrap">'+escapeHTML(body)+'</p>',baseURL:e.PUBLIC_BASE_URL});
  const result=await sendEmail(e,to,subject,html,body,e.MAILBOX_FROM_EMAIL,headers);
  await d.prepare("INSERT INTO mailbox(direction,sender,recipient,subject,body_text,status,external_id) VALUES('outbound',?,?,?,?,'sent',?)").bind(e.MAILBOX_FROM_EMAIL,to,subject,body,result.id||'').run();return json({ok:true});
 }
 if(method==='PATCH'&&/^\/api\/admin\/mailbox\/\d+$/.test(path)){
  const b=await parse(r);if(!['read','unread','archived'].includes(b.status))return fail('Invalid status');
  await d.prepare('UPDATE mailbox SET status=? WHERE id=?').bind(b.status,Number(path.split('/').pop())).run();return json({ok:true});
 }
 return fail('Not found',404);
}
export default {
 async fetch(r,e,ctx){
  const url=new URL(r.url),path=url.pathname;
  try{
   if(path==='/api/analytics'&&r.method==='POST')return await recordAnalytics(r,e);
   if(path==='/api/webhooks/resend'&&r.method==='POST'){
    if(Number(r.headers.get('content-length')||0)>65536)return fail('Payload too large',413);
    const bytes=await limitedBody(r.body,65536);const verified=await verifyResendWebhook(new Request(r.url,{method:'POST',headers:r.headers,body:bytes}),e);
    if(verified.error)return fail(verified.error,verified.status);
    if(verified.event?.type==='email.received')await importResendEmail(e,verified.event.data?.email_id);
    return json({ok:true});
   }
   const destination=legacyRedirects[path.replace(/\/+$/,'')];
   if(destination&&['GET','HEAD'].includes(r.method))return Response.redirect(new URL(destination,url),301);
   if(path==='/unsubscribe'||path==='/newsletter/confirm')return subscriberLink(r,e,ctx,path==='/unsubscribe');
   if(path==='/admin'||path.startsWith('/admin/')||path.startsWith('/api/admin/')){
    // The Access application protects the apex /admin/ path. Send browser visits
    // there before requiring its assertion; never serve protected content here.
    if(['GET','HEAD'].includes(r.method)&&(path==='/admin'||path.startsWith('/admin/'))){
     const canonical=new URL(e.PUBLIC_BASE_URL);
     if(url.origin!==canonical.origin||path==='/admin'){
      canonical.pathname=path==='/admin'?'/admin/':path;
      canonical.search=url.search;
      return Response.redirect(canonical,308);
     }
    }
    let identity;try{identity=await verifyAccess(r,e)}catch(x){return fail(x.message,503)}
    if(!identity)return fail('Unauthorized: Cloudflare Access authentication required',401);
    if(r.method!=='GET'&&!sameOrigin(r,e))return fail('Invalid origin',403);
    if(path.startsWith('/api/admin/'))return await adminAPI(r,e,path,identity);
    if(r.method!=='GET')return fail('Method not allowed',405);
    // Assets use drop-trailing-slash. Request the clean internal asset URL so
    // /admin/ returns the dashboard instead of redirecting back to /admin.
    if(path==='/admin/')return e.ASSETS.fetch(new Request(new URL('/admin',url),r));
    return e.ASSETS.fetch(r);
   }
   if(path.startsWith('/api/')){
    if(r.method!=='GET'&&!sameOrigin(r,e))return fail('Invalid origin',403);
    return await publicAPI(r,e,path,ctx);
   }
   if(path.startsWith('/media/')){
    if(!['GET','HEAD'].includes(r.method))return fail('Method not allowed',405);
    if(!mediaPath.test(path))return fail('Not found',404);
    const object=await e.PRODUCT_IMAGES?.get(path.slice(7));if(!object)return fail('Image not found',404);
    const headers=new Headers({'x-content-type-options':'nosniff','cache-control':'public, max-age=31536000, immutable','content-security-policy':"default-src 'none'"});object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag);
    if(r.headers.get('if-none-match')===object.httpEtag)return new Response(null,{status:304,headers});
    return new Response(r.method==='HEAD'?null:object.body,{headers});
   }
   return storefrontResponse(r,e,product);
  }catch(err){if(err.message!=='Payload too large')console.error('Request failed',err);return fail(err instanceof SyntaxError?'Invalid JSON':err.message==='Payload too large'?'Payload too large':'Request failed',err instanceof SyntaxError?400:err.message==='Payload too large'?413:500)}
 },
 async scheduled(_controller,e,ctx){const work=drainOutbox(e,20);if(ctx?.waitUntil)ctx.waitUntil(work);else await work;},
 async email(message,e){
  if(!e.DB)throw Error('D1 not configured');
  const to=clean(message.to,254).toLowerCase(),address=(e.INBOUND_ADDRESS||'info@'+e.INBOUND_DOMAIN).toLowerCase();if(to!==address){message.setReject('Recipient not allowed');return}
  if(message.rawSize>10*1024*1024){message.setReject('Message exceeds 10 MB');return;}
  let bytes;try{bytes=await limitedBody(message.raw,10*1024*1024);}catch{message.setReject('Message exceeds 10 MB');return;}
  const parsed=await PostalMime.parse(bytes);
  const subject=clean(parsed.subject||'(no subject)',240);
  let body=parsed.text||String(parsed.html||'').replace(/<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  if(parsed.attachments?.length)body+='\n\nAttachments: '+parsed.attachments.map(a=>a.filename||'Unnamed attachment').join(', ')+'\n(Attachments are not stored in this inbox.)';
  body=clean(body,50000);
  const replyTo=clean(parsed.replyTo?.[0]?.address,254);
  await e.DB.prepare("INSERT INTO mailbox(direction,sender,recipient,subject,body_text,external_id,reply_to) VALUES('inbound',?,?,?,?,?,?)").bind(clean(message.from,254),to,subject,body,clean(message.headers.get('message-id'),255),emailOK(replyTo)?replyTo:'').run();
 }
};
