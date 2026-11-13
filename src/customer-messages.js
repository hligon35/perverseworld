import {readLimited} from './http.js';
import {brandedMessage,escapeHTML,dispatchOutbox,messagePage} from './email.js';
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join('');
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const sender=env=>env.MAILBOX_FROM_EMAIL||env.FROM_EMAIL;
const owner=env=>env.NOTIFICATION_EMAIL||env.MAILBOX_FROM_EMAIL||'info@perverseworld.com';
const emailPayload=(env,to,subject,content,text,options={})=>({to:[to],from:options.from||env.FROM_EMAIL,reply_to:options.replyTo||sender(env),subject,html:brandedMessage({title:subject,content,baseURL:env.PUBLIC_BASE_URL,...options}),text});
export async function subscribeCustomer(env,email,ctx,{force=false}={}){
 const current=await env.DB.prepare('SELECT id,status,confirmation_requested_at FROM subscribers WHERE email=?').bind(email).first();
 const accepted=()=>json({ok:true,message:'Check your inbox to confirm your email. If you are already subscribed, you are all set.'});
 if(current?.status==='active')return accepted();
 if(!force&&current?.status==='pending'&&current.confirmation_requested_at&&Date.now()-Date.parse(current.confirmation_requested_at.replace(' ','T')+'Z')<300000)return accepted();
 if(!force&&(await env.DB.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE recipient=? AND kind='subscriber-confirm' AND created_at>=datetime('now','-1 hour')").bind(email).first()).count>=3)return json({error:'Several confirmation emails were requested recently. Please use your latest link or try again in an hour.'},429,{'retry-after':'3600'});
 const raw=randomToken(),tokenHash=await hash(raw),link=env.PUBLIC_BASE_URL+'/newsletter/confirm?token='+raw;
 const payload=emailPayload(env,email,'Confirm your place in Perverse World','<p>You’re one step away from new drops, original artwork and first access.</p><p>Confirm your email below to join the list. This link expires in 24 hours. If you didn’t request this, you can ignore this email.</p>','Confirm your email: '+link+'\nThis link expires in 24 hours. If you did not request this, ignore this message.',{buttonText:'CONFIRM MY EMAIL',buttonURL:link});
 await env.DB.batch([
  env.DB.prepare("INSERT INTO subscribers(email,unsub_token,status,confirm_token_hash,confirm_expires_at,optin_version,confirmation_requested_at) VALUES(?,?,'pending',?,datetime('now','+24 hours'),1,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET status='pending',unsub_token=excluded.unsub_token,confirmed_at=NULL,confirm_token_hash=excluded.confirm_token_hash,confirm_expires_at=excluded.confirm_expires_at,optin_version=subscribers.optin_version+1,confirmation_requested_at=CURRENT_TIMESTAMP WHERE subscribers.status!='active' AND (?=1 OR subscribers.status='unsubscribed' OR confirmation_requested_at IS NULL OR confirmation_requested_at<datetime('now','-5 minutes'))").bind(email,randomToken(),tokenHash,force?1:0),
  env.DB.prepare("INSERT OR IGNORE INTO email_outbox(id,kind,recipient,payload_json,subscriber_id,optin_version) SELECT 'subscriber-confirm/'||id||'/'||optin_version,'subscriber-confirm',email,?,id,optin_version FROM subscribers WHERE email=? AND confirm_token_hash=? AND status='pending'").bind(JSON.stringify(payload),email,tokenHash)
 ]);
 if(ctx?.waitUntil)dispatchOutbox(env,ctx);else await dispatchOutbox(env);
 return accepted();
}
export async function subscriberLink(request,env,ctx,unsubscribe=false){
 if(!['GET','HEAD','POST'].includes(request.method))return messagePage(env,{title:'Method not allowed',message:'Use the link in your email.',status:405});
 const url=new URL(request.url);let raw=url.searchParams.get('token')||'';
 if(request.method==='POST'&&!raw){const body=new TextDecoder().decode(await readLimited(request.body,2048));if(body.length>2048)return messagePage(env,{title:'Invalid link',message:'Please request a new email.',status:400});raw=new URLSearchParams(body).get('token')||'';}
 const invalid=()=>messagePage(env,{title:'This link is no longer valid',message:unsubscribe?'Use the unsubscribe link in your latest Perverse World email.':'Return to Perverse World and sign up again to request a fresh confirmation email.',status:400});
 if(!/^[a-f0-9]{48}$/.test(raw))return invalid();
 const row=await env.DB.prepare(unsubscribe?'SELECT * FROM subscribers WHERE unsub_token=?':'SELECT * FROM subscribers WHERE confirm_token_hash=?').bind(unsubscribe?raw:await hash(raw)).first();if(!row)return invalid();
 if(unsubscribe){
  if(row.status==='unsubscribed')return messagePage(env,{title:'You’re unsubscribed',message:'You will no longer receive Perverse World newsletter campaigns.'});
  if(request.method!=='POST')return messagePage(env,{title:'Leave the list?',message:'Confirm below to stop Perverse World newsletter campaigns. You can join again whenever you like.',action:'/unsubscribe',token:raw,button:'UNSUBSCRIBE'});
  await env.DB.batch([env.DB.prepare("UPDATE subscribers SET status='unsubscribed',confirm_token_hash='' WHERE id=?").bind(row.id),env.DB.prepare("INSERT OR IGNORE INTO subscriber_events(subscriber_id,event,optin_version) SELECT id,'unsubscribed',optin_version FROM subscribers WHERE id=?").bind(row.id)]);
  return messagePage(env,{title:'You’re unsubscribed',message:'You will no longer receive Perverse World newsletter campaigns.'});
 }
 if(row.status==='active')return messagePage(env,{title:'You’re already in',message:'Your email is confirmed. Watch your inbox for the next chapter of Perverse World.'});
 if(row.status!=='pending'||!row.confirm_expires_at||Date.parse(row.confirm_expires_at.replace(' ','T')+'Z')<=Date.now())return invalid();
 if(request.method!=='POST')return messagePage(env,{title:'Confirm your place',message:'Join the Perverse World list for drop alerts, original artwork and first access.',action:'/newsletter/confirm',token:raw,button:'CONFIRM MY EMAIL'});
 const unsubscribeURL=env.PUBLIC_BASE_URL+'/unsubscribe?token='+row.unsub_token;
 const welcome=emailPayload(env,row.email,'You’re in. Welcome to Perverse World.','<p>Your email is confirmed. You’re now part of a world built for people who see beneath the surface.</p><p>We’ll be in touch with new artwork, release details and first access. Until then, get to know the pieces and the story behind them.</p>','You are subscribed to Perverse World. Explore the pieces: '+env.PUBLIC_BASE_URL+'/shop\nUnsubscribe: '+unsubscribeURL,{buttonText:'EXPLORE THE WORLD',buttonURL:env.PUBLIC_BASE_URL,unsubscribeURL});
 const notification=emailPayload(env,owner(env),'A new voice joined Perverse World','<p>A subscriber confirmed their email:</p><p><strong>'+escapeHTML(row.email)+'</strong></p>','Confirmed subscriber: '+row.email,{buttonText:'OPEN SUBSCRIBERS',buttonURL:env.PUBLIC_BASE_URL+'/admin/#subscribers'});
 await env.DB.batch([
  env.DB.prepare("UPDATE subscribers SET status='active',confirmed_at=CURRENT_TIMESTAMP,consent_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND confirm_token_hash=? AND confirm_expires_at>CURRENT_TIMESTAMP").bind(row.id,row.confirm_token_hash),
  env.DB.prepare("INSERT OR IGNORE INTO subscriber_events(subscriber_id,event,optin_version) SELECT id,'confirmed',optin_version FROM subscribers WHERE id=? AND status='active' AND confirm_token_hash=?").bind(row.id,row.confirm_token_hash),
  env.DB.prepare("INSERT OR IGNORE INTO email_outbox(id,kind,recipient,payload_json,subscriber_id,optin_version) SELECT 'subscriber-welcome/'||id||'/'||optin_version,'subscriber-welcome',email,?,id,optin_version FROM subscribers WHERE id=? AND status='active' AND confirm_token_hash=?").bind(JSON.stringify(welcome),row.id,row.confirm_token_hash),
  env.DB.prepare("INSERT OR IGNORE INTO email_outbox(id,kind,recipient,payload_json,subscriber_id,optin_version) SELECT 'subscriber-notification/'||id||'/'||optin_version,'subscriber-notification',?,?,id,optin_version FROM subscribers WHERE id=? AND status='active' AND confirm_token_hash=?").bind(owner(env),JSON.stringify(notification),row.id,row.confirm_token_hash)
 ]);
 if(ctx?.waitUntil)dispatchOutbox(env,ctx);else await dispatchOutbox(env);
 return messagePage(env,{title:'You’re in',message:'Your email is confirmed. Your welcome email is on its way, and future drop alerts will arrive here.'});
}
export async function saveContact(env,fields,ctx){
 const requestKey=fields.requestId||crypto.randomUUID();
 if(!/^[a-f0-9-]{36}$/i.test(requestKey))return json({error:'Please refresh the form and try again.'},400);
 const existing=await env.DB.prepare('SELECT id,name,email,subject,message FROM submissions WHERE request_key=?').bind(requestKey).first();
 if(existing){if(['name','email','subject','message'].some(key=>existing[key]!==fields[key]))return json({error:'This request has already been used. Refresh the form to send a new message.'},409);return json({ok:true,reference:'PW-'+existing.id,message:'Your message has been received. Watch your inbox for our acknowledgement.'});}
 const recent=await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE email=? AND created_at>=datetime('now','-1 hour')").bind(fields.email).first();
 if(recent.count>=5)return json({error:'You have sent several messages recently. Please try again in an hour.'},429,{'retry-after':'3600'});
 const key='contact/'+requestKey;
 const reply=emailPayload(env,fields.email,'We received your message — Perverse World','<p>Hi '+escapeHTML(fields.name)+',</p><p>Your reference: <strong>__PW_REFERENCE__</strong></p><p>Thanks for reaching out. Your message is safely with us, and we’ll get back to you at this email address.</p><p><strong>'+escapeHTML(fields.subject)+'</strong></p><blockquote style="margin:20px 0;border-left:3px solid #f14b2c;padding-left:16px;white-space:pre-wrap">'+escapeHTML(fields.message)+'</blockquote><p>You can reply to this email if you have more details to share.</p>','Hi '+fields.name+',\nWe received your message about '+fields.subject+'.\n\n'+fields.message+'\n\nReply to this email if you have more details.',{from:sender(env)});
 const notification=emailPayload(env,owner(env),'New contact: '+fields.subject,'<p>Reference: <strong>__PW_REFERENCE__</strong></p><p><strong>'+escapeHTML(fields.name)+'</strong><br>'+escapeHTML(fields.email)+'</p><p><strong>'+escapeHTML(fields.subject)+'</strong></p><div style="white-space:pre-wrap">'+escapeHTML(fields.message)+'</div>','From: '+fields.name+' <'+fields.email+'>\nSubject: '+fields.subject+'\n\n'+fields.message,{replyTo:fields.email,buttonText:'OPEN SUBMISSIONS',buttonURL:env.PUBLIC_BASE_URL+'/admin/#submissions'});
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO submissions(name,email,subject,message,request_key) VALUES(?,?,?,?,?)').bind(fields.name,fields.email,fields.subject,fields.message,requestKey),
  env.DB.prepare("INSERT OR IGNORE INTO email_outbox(id,kind,recipient,payload_json) SELECT ?,'contact-reply',?,replace(?,'__PW_REFERENCE__','PW-'||id) FROM submissions WHERE request_key=?").bind(key+'/reply',fields.email,JSON.stringify(reply),requestKey),
  env.DB.prepare("INSERT OR IGNORE INTO email_outbox(id,kind,recipient,payload_json) SELECT ?,'contact-notification',?,replace(?,'__PW_REFERENCE__','PW-'||id) FROM submissions WHERE request_key=?").bind(key+'/notification',owner(env),JSON.stringify(notification),requestKey)
 ]);
 if(ctx?.waitUntil)dispatchOutbox(env,ctx);else await dispatchOutbox(env);
 const id=(await env.DB.prepare('SELECT id FROM submissions WHERE request_key=?').bind(requestKey).first()).id;
 return json({ok:true,reference:'PW-'+id,message:'Your message has been received. Watch your inbox for our acknowledgement.'});
}
