export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function deliverEmail(env,payload,idempotencyKey){
 if(!env.RESEND_API_KEY||!(payload.from||env.FROM_EMAIL))throw Error('Email provider not configured');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:JSON.stringify({from:payload.from||env.FROM_EMAIL,...payload}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Email provider rejected request ('+response.status+')');
 return response.json();
}
export function brandedMessage({title,preheader='',content,baseURL='https://perverseworld.com',buttonText='',buttonURL='',unsubscribeURL=''}){
 const base=new URL(baseURL).origin,year=new Date().getFullYear();
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title></head><body style="margin:0;background:#111210;color:#f2eee3;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHTML(preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#1b1e18;border:1px solid #383d31"><tr><td align="center" style="padding:28px;border-bottom:4px solid #f14b2c"><img src="${base}/assets/images/perverse-world-logo.png" width="160" alt="Perverse World" style="display:block;max-width:100%;height:auto"><p style="font-size:11px;letter-spacing:3px;color:#f0946f;margin:20px 0 0">BORN IN CHAOS. WORN WITH PURPOSE.</p></td></tr><tr><td style="padding:32px 28px;font-size:16px;line-height:1.8"><h1 style="font-size:30px;line-height:1.1;margin:0 0 24px">${escapeHTML(title)}</h1>${content}${buttonText&&buttonURL?`<p style="margin:28px 0"><a href="${escapeHTML(buttonURL)}" style="display:inline-block;padding:14px 24px;background:#f14b2c;color:#111210;text-decoration:none;font-weight:bold">${escapeHTML(buttonText)}</a></p>`:''}</td></tr><tr><td style="padding:24px 28px;border-top:1px solid #383d31;color:#acae9f;font-size:12px;line-height:1.8"><strong style="color:#fff">PERVERSE <span style="color:#f14b2c">WORLD</span></strong><br>© ${year} Perverse World. All rights reserved.<br><a href="${base}/contact" style="color:#d6d4c9">Contact us</a>${unsubscribeURL?` · <a href="${escapeHTML(unsubscribeURL)}" style="color:#d6d4c9">Unsubscribe</a>`:''}<br><a href="https://alphazonelabs.com" style="color:#acae9f">Designed by AlphaZoneLabs LLC</a></td></tr></table></td></tr></table></body></html>`;
}
export function messagePage(env,{title,message,action='',token='',button='Confirm',status=200}){
 const base=new URL(env.PUBLIC_BASE_URL).origin;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/assets/icons/favicon-32.png"><link rel="stylesheet" href="/assets/css/messages.css"><title>${escapeHTML(title)} — Perverse World</title></head><body><main><img src="/assets/images/perverse-world-logo.png" alt="Perverse World" width="160" height="160"><h1>${escapeHTML(title)}</h1><p>${escapeHTML(message)}</p>${action?`<form method="post" action="${escapeHTML(action)}"><input type="hidden" name="token" value="${escapeHTML(token)}"><button type="submit">${escapeHTML(button)}</button></form>`:''}<a href="${base}">Back to Perverse World</a><footer>© ${new Date().getFullYear()} Perverse World</footer></main></body></html>`;
 return new Response(html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
}
export async function drainOutbox(env,limit=10){
 if(!env.RESEND_API_KEY||!env.FROM_EMAIL)return {sent:0,failed:0,configured:false};
 await env.DB.prepare("UPDATE email_outbox SET status='failed',last_error='Retry limit reached; review provider history',locked_until=NULL WHERE status='sending' AND locked_until<CURRENT_TIMESTAMP AND attempts>=6").run();
 const rows=(await env.DB.prepare("SELECT id FROM email_outbox WHERE ((status='queued' AND next_attempt_at<=CURRENT_TIMESTAMP) OR (status='sending' AND locked_until<CURRENT_TIMESTAMP)) AND attempts<6 ORDER BY created_at LIMIT ?").bind(Math.min(limit,20)).all()).results;
 let sent=0,failed=0;
 for(const candidate of rows){
  const job=await env.DB.prepare("UPDATE email_outbox SET status='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,CURRENT_TIMESTAMP),locked_until=datetime('now','+2 minutes') WHERE id=? AND ((status='queued' AND next_attempt_at<=CURRENT_TIMESTAMP) OR (status='sending' AND locked_until<CURRENT_TIMESTAMP)) AND attempts<6 RETURNING *").bind(candidate.id).first();if(!job)continue;
  if(Date.now()-new Date(job.first_attempt_at.replace(' ','T')+'Z').getTime()>23*3600000){await env.DB.prepare("UPDATE email_outbox SET status='failed',last_error='Retry window expired; review provider history before resending',locked_until=NULL WHERE id=?").bind(job.id).run();failed++;continue;}
  if(job.subscriber_id){
   const subscriber=await env.DB.prepare('SELECT status,optin_version,confirm_expires_at FROM subscribers WHERE id=?').bind(job.subscriber_id).first();
   const valid=subscriber&&subscriber.optin_version===job.optin_version&&(job.kind==='subscriber-confirm'?subscriber.status==='pending'&&subscriber.confirm_expires_at&&Date.parse(subscriber.confirm_expires_at.replace(' ','T')+'Z')>Date.now():subscriber.status==='active');
   if(!valid){await env.DB.prepare("UPDATE email_outbox SET status='cancelled',payload_json='{}',locked_until=NULL WHERE id=?").bind(job.id).run();continue;}
  }
  try{
   const result=await deliverEmail(env,JSON.parse(job.payload_json),'pw-outbox/'+job.id);
   await env.DB.prepare("UPDATE email_outbox SET status='sent',provider_id=?,payload_json='{}',sent_at=CURRENT_TIMESTAMP,last_error='',locked_until=NULL WHERE id=?").bind(result.id||'',job.id).run();sent++;
  }catch(error){const terminal=job.attempts>=6;await env.DB.prepare("UPDATE email_outbox SET status=?,last_error=?,locked_until=NULL,next_attempt_at=datetime('now',?) WHERE id=?").bind(terminal?'failed':'queued',error.message==='Email provider not configured'?error.message:'Email provider unavailable or rejected request',`+${Math.min(3600,60*2**job.attempts)} seconds`,job.id).run();failed++;}
  if(rows.length>1)await new Promise(resolve=>setTimeout(resolve,600));
 }
 return {sent,failed,configured:true};
}
export function dispatchOutbox(env,ctx){const work=drainOutbox(env).catch(()=>console.error('Notification queue processing failed'));if(ctx?.waitUntil)ctx.waitUntil(work);return work;}
