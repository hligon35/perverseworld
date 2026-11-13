const text=value=>String(value||'').replace(/<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const address=value=>String(value||'').match(/<([^<>]+)>/)?.[1]||String(value||'').trim();
export async function resendGet(env,path){
 if(!env.RESEND_API_KEY)throw Error('Add RESEND_API_KEY as a Worker secret to connect Resend mail.');
 const response=await fetch('https://api.resend.com'+path,{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Resend receiving request failed ('+response.status+'). Check the API key has full access.');return response.json();
}
export async function importResendEmail(env,id){
 if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid received email ID');
 if(await env.DB.prepare("SELECT id FROM mailbox WHERE direction='inbound' AND provider_id=?").bind('resend:'+id).first())return false;
 const email=await resendGet(env,'/emails/receiving/'+id),to=(env.INBOUND_ADDRESS||'info@perverseworld.com').toLowerCase();
 if(!Array.isArray(email.to)||!email.to.some(recipient=>address(recipient).toLowerCase()===to))return false;
 let body=email.text||text(email.html);
 if(email.attachments?.length)body+='\n\nAttachments: '+email.attachments.map(item=>item.filename||'Unnamed attachment').join(', ')+'\n(Attachments are not stored in this inbox.)';
 const replyTo=address(Array.isArray(email.reply_to)?email.reply_to[0]:email.reply_to);
 const result=await env.DB.prepare("INSERT OR IGNORE INTO mailbox(direction,sender,recipient,subject,body_text,status,external_id,provider_id,created_at,reply_to) VALUES('inbound',?,?,?,?,'unread',?,?,?,?)").bind(address(email.from).slice(0,254),to,String(email.subject||'(no subject)').slice(0,240),body.slice(0,50000),String(email.message_id||'').slice(0,255),'resend:'+id,email.created_at?new Date(email.created_at).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,''):new Date().toISOString().replace('T',' ').replace(/\.\d{3}Z$/,''),/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)?replyTo.slice(0,254):'').run();
 return result.meta.changes>0;
}
export async function verifyResendWebhook(request,env){
 if(!env.RESEND_WEBHOOK_SECRET)return {status:503,error:'Receiving webhook is not configured'};
 const id=request.headers.get('svix-id'),timestamp=request.headers.get('svix-timestamp'),signatures=request.headers.get('svix-signature')||'';
 if(!id||!/^\d+$/.test(timestamp||'')||Math.abs(Date.now()/1000-Number(timestamp))>300)return {status:401,error:'Invalid webhook signature'};
 const body=await request.text();if(body.length>65536)return {status:413,error:'Payload too large'};
 try{
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/,'')),c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const data=new TextEncoder().encode(id+'.'+timestamp+'.'+body);let valid=false;
  for(const value of signatures.split(' ')){const [version,signature]=value.split(',');if(version==='v1'&&signature&&await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),data)){valid=true;break;}}
  if(!valid)return {status:401,error:'Invalid webhook signature'};
  return {event:JSON.parse(body)};
 }catch{return {status:401,error:'Invalid webhook signature'};}
}
