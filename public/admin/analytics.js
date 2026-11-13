import {$,el,api,safe} from './ui.js';
let report=null,requestId=0;
const number=value=>new Intl.NumberFormat('en-US').format(value||0);
const labels={views:'Page views',entries:'Store entries',bagAdds:'Bag additions',bagEnquiries:'Bag enquiries',signups:'Newsletter sign-ups',enquiries:'Contact enquiries',inbound:'Incoming emails',outbound:'Replies sent',campaignEmails:'Campaign emails sent'};
const date=value=>new Date(value+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
function table(target,rows,columns,empty){const body=$(target);body.replaceChildren();if(!rows.length){const row=el('tr'),cell=el('td',empty,'empty');cell.colSpan=columns.length;row.append(cell);body.append(row);return;}for(const item of rows){const row=el('tr');for(const column of columns)row.append(el('td',column(item)));body.append(row);}}
function chart(){
 if(!report)return;const metric=$('analyticsMetric').value,daily=report.daily,peak=Math.max(1,...daily.map(item=>item[metric]));const bars=$('analyticsBars');bars.replaceChildren();
 daily.forEach(item=>{const bar=el('div',null,'analytics-bar'),fill=el('span');fill.style.height=(item[metric]/peak*100)+'%';bar.title=date(item.day)+': '+number(item[metric])+' '+labels[metric].toLowerCase();bar.setAttribute('aria-hidden','true');bar.append(fill);bars.append(bar);});
 $('analyticsChartLabel').textContent=labels[metric]+' by day';$('analyticsPeak').textContent='Peak '+number(peak===1&&!daily.some(item=>item[metric])?0:peak);$('analyticsChartStart').textContent=date(report.period.start);$('analyticsChartEnd').textContent=date(report.period.end);$('analyticsNoTraffic').hidden=daily.some(item=>item[metric]>0);
 table('analyticsDailyRows',daily,[item=>date(item.day),item=>number(item[metric])],'No activity.');$('analyticsDailyMetric').textContent=labels[metric];
}
export async function analytics(){
 const id=++requestId,days=$('analyticsRange').value;const root=$('analyticsContent');root.setAttribute('aria-busy','true');root.hidden=true;$('analyticsStatus').textContent='Loading analytics…';
 try{const result=await api('analytics?days='+days);if(id!==requestId)return;report=result;root.hidden=false;
  const metrics=$('analyticsCards');metrics.replaceChildren();
  for(const key of ['views','bagAdds','enquiries','signups']){const card=el('div',null,'stat');card.append(el('div',number(result.current[key]),'num'),el('div',labels[key],'label'));const previous=result.previous[key],current=result.current[key];const change=previous?((current-previous)/previous*100):null;card.append(el('div',change===null?(current?'New activity; previous period had none':'No activity in either period'):(change>0?'+':'')+change.toFixed(0)+'% vs previous '+result.period.days+' days','analytics-change muted small'));metrics.append(card);}
  const secondary=$('analyticsTotals');secondary.replaceChildren();for(const key of ['entries','bagEnquiries','inbound','outbound','campaignEmails']){const item=el('div');item.append(el('strong',number(result.current[key])),el('span',labels[key]));secondary.append(item);}
  table('analyticsPageRows',result.pages,[item=>({'/':'Home','/shop':'Shop','/contact':'Contact'}[item.path]||item.path.replace('/shop/','').replaceAll('-',' ')),item=>number(item.views)],'Page activity will appear as the storefront is visited.');
  table('analyticsProductRows',result.products,[item=>item.name,item=>number(item.adds)],'No bag additions in this period.');
  table('analyticsCampaignRows',result.campaigns,[item=>item.subject,item=>item.status,item=>number(item.sent)],'No campaign emails sent in this period.');
  const stock=result.inventory;$('analyticsStockUnits').textContent=number(stock.units);$('analyticsStockProducts').textContent=number(stock.activeProducts);$('analyticsStockLow').textContent=number(stock.low);$('analyticsStockOut').textContent=number(stock.soldOut);
  table('analyticsStockRows',stock.attention,[item=>item.name,item=>item.size,item=>item.quantity===0?'Sold out':number(item.quantity)],'All listed sizes have more than five units available.');
  $('analyticsAudienceActive').textContent=number(result.audience?.active);$('analyticsAudienceTotal').textContent=number(result.audience?.total);$('analyticsAudienceUnsubscribed').textContent=number(result.audience?.unsubscribed);
  $('analyticsTrackingNote').textContent=result.trackingStarted?'Traffic recorded since '+date(result.trackingStarted)+'. Page views include the coming soon screen. Counts reflect browser-reported activity, not unique visitors.':'Traffic tracking starts when this update is released. Earlier page views cannot be reconstructed. Existing enquiry and email records are included.';
  $('analyticsStatus').textContent=date(result.period.start)+' – '+date(result.period.end)+' · UTC days · Updated '+new Date(result.generatedAt).toLocaleTimeString();chart();
 }catch(error){if(id===requestId){$('analyticsStatus').textContent='Analytics could not be loaded. Use Refresh to try again.';throw error;}}finally{if(id===requestId)root.setAttribute('aria-busy','false');}
}
export function initAnalytics(){ $('analyticsRange').onchange=()=>safe(analytics);$('reloadAnalytics').onclick=()=>safe(analytics);$('analyticsMetric').onchange=chart; }
