import {$,el,api,safe,button,alertMsg,when} from './ui.js';
let page=0,query='',status='all',generation=0;
export async function subscribers(){
 const id=++generation,result=await api('subscribers?'+new URLSearchParams({page,q:query,status}));if(id!==generation)return;
 const table=$('subscriberRows');table.replaceChildren();
 if(!result.items.length){const row=el('tr'),cell=el('td','No subscribers match this view.','empty');cell.colSpan=5;row.append(cell);table.append(row);}
 for(const item of result.items){const row=el('tr');row.append(el('td',item.email));const state=el('td');state.append(el('span',item.status,'pill '+item.status));row.append(state,el('td',item.confirmed_at?when(item.confirmed_at):'Awaiting confirmation'),el('td',item.email_status));const actions=el('td');
  if(item.status==='pending')actions.append(button('Resend confirmation',async()=>{await api('subscribers/'+item.id+'/confirmation',{method:'POST',body:'{}'});alertMsg('A new confirmation email has been queued.');await subscribers();}));
  if(item.status!=='unsubscribed')actions.append(button('Unsubscribe',async()=>{await api('subscribers/'+item.id,{method:'PATCH',body:JSON.stringify({status:'unsubscribed'})});alertMsg('Subscriber removed from campaigns.');await subscribers();}));row.append(actions);table.append(row);
 }
 $('subscriberCount').textContent=result.total?`${page*50+1}–${Math.min((page+1)*50,result.total)} of ${result.total}`:'0 subscribers';$('subscriberPrevious').disabled=page===0;$('subscriberNext').disabled=(page+1)*50>=result.total;
}
export async function notificationQueue(){
 const result=await api('email/outbox');$('notificationConfig').textContent=result.configured?'Email credentials configured. Delivery status is shown below.':'Add RESEND_API_KEY and a verified FROM_EMAIL to activate queued emails.';
 $('notificationCounts').textContent=result.counts.map(item=>item.status+': '+item.count).join(' · ')||'No notification emails yet.';
 const table=$('notificationRows');table.replaceChildren();for(const item of result.items){const row=el('tr');for(const value of [item.kind,item.recipient,item.status,item.attempts,item.last_error||'—'])row.append(el('td',value));table.append(row);}
}
export function initSubscribers(){
 $('subscriberFilters').onsubmit=event=>{event.preventDefault();query=$('subscriberSearch').value;status=$('subscriberStatus').value;page=0;safe(subscribers);};$('subscriberPrevious').onclick=()=>{page--;safe(subscribers);};$('subscriberNext').onclick=()=>{page++;safe(subscribers);};
 $('retryNotifications').onclick=()=>safe(async()=>{const button=$('retryNotifications');button.disabled=true;try{const result=await api('email/retry',{method:'POST',body:'{}'});alertMsg(result.configured?'Sent '+result.sent+'; awaiting retry '+result.failed+'.':'Email sender is not configured.',!result.configured);await notificationQueue();}finally{button.disabled=false;}});
}
