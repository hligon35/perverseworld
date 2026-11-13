import catalog from './site/products.json' with {type:'json'};
import {retiredProductIds} from './site/catalog-policy.js';

const dateKey=date=>date.toISOString().slice(0,10);
export function analyticsPeriod(value='30',now=new Date()){
 const days=Number(value);if(![7,30,90].includes(days))throw Error('Choose 7, 30 or 90 days');
 const end=new Date(dateKey(now)+'T00:00:00Z'),start=new Date(end);start.setUTCDate(end.getUTCDate()-days+1);const previousStart=new Date(start.getTime()-days*86400000);
 return {days,start:dateKey(start),end:dateKey(end),previousStart:dateKey(previousStart),previousEnd:dateKey(new Date(start.getTime()-86400000))};
}

export function validAnalyticsEvent(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const paths=new Set(['/','/shop','/contact',...catalog.map(product=>'/shop/'+product.slug)]);
 const event=input.event,path=typeof input.path==='string'?input.path.replace(/\/+$/,'')||'/':'';
 if(!['page_view','store_entry','add_to_bag','bag_enquiry'].includes(event)||!paths.has(path))return null;
 const productId=Number(input.productId||0);
 if(event==='add_to_bag'&&(!Number.isSafeInteger(productId)||productId<=0||productId>1000000000||retiredProductIds.includes(productId)))return null;
 if(event==='bag_enquiry'&&productId!==0)return null;
 if(event==='store_entry'&&productId!==0)return null;
 if(event==='page_view'&&productId!==0)return null;
 return {event,path,productId:event==='add_to_bag'?productId:0};
}

export async function recordAnalytics(request,env){
 const url=new URL(request.url),origin=request.headers.get('origin');
 const host=new URL(env.PUBLIC_BASE_URL).hostname,hosts=new Set([host,...(host==='perverseworld.com'?['www.perverseworld.com']:[])]);
 if(origin!==url.origin||!hosts.has(url.hostname))return new Response(null,{status:403});
 if(Number(request.headers.get('content-length')||0)>1024)return new Response(null,{status:413});
 const reader=request.body?.getReader();let length=0,body='';const decoder=new TextDecoder();
 if(!reader)return new Response(null,{status:400});
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1024){await reader.cancel();return new Response(null,{status:413});}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}
 let event;try{event=validAnalyticsEvent(JSON.parse(body));}catch{}
 if(!event)return new Response(null,{status:400});
 if(event.event==='add_to_bag'&&!await env.DB.prepare('SELECT id FROM products WHERE id=? AND active=1').bind(event.productId).first())return new Response(null,{status:400});
 await env.DB.prepare("INSERT INTO daily_analytics(day,event,path,product_id,count) VALUES(date('now'),?,?,?,1) ON CONFLICT(day,event,path,product_id) DO UPDATE SET count=count+1").bind(event.event,event.path,event.productId).run();
 return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
}

export async function adminAnalytics(db,period,mapProduct){
 const all=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
 const [events,signups,enquiries,mail,sent,audience,products,campaigns,tracking]=await Promise.all([
  all('SELECT day,event,path,product_id,count FROM daily_analytics WHERE day BETWEEN ? AND ?',period.previousStart,period.end),
  all('SELECT date(created_at) AS day,COUNT(*) AS count FROM subscribers WHERE created_at>=? AND created_at<date(?,\'+1 day\') GROUP BY day',period.previousStart,period.end),
  all('SELECT date(created_at) AS day,COUNT(*) AS count FROM submissions WHERE created_at>=? AND created_at<date(?,\'+1 day\') GROUP BY day',period.previousStart,period.end),
  all('SELECT date(created_at) AS day,direction,COUNT(*) AS count FROM mailbox WHERE created_at>=? AND created_at<date(?,\'+1 day\') GROUP BY day,direction',period.previousStart,period.end),
  all('SELECT date(sent_at) AS day,COUNT(*) AS count FROM newsletter_deliveries WHERE sent_at>=? AND sent_at<date(?,\'+1 day\') GROUP BY day',period.previousStart,period.end),
  db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status='active'),0) AS active,COALESCE(SUM(status='unsubscribed'),0) AS unsubscribed FROM subscribers").first(),
  all('SELECT * FROM products WHERE active=1 ORDER BY id'),
  all('SELECT n.id,n.subject,n.status,COUNT(d.subscriber_id) AS sent FROM newsletters n JOIN newsletter_deliveries d ON d.newsletter_id=n.id WHERE d.sent_at>=? AND d.sent_at<date(?,\'+1 day\') GROUP BY n.id ORDER BY sent DESC,n.id DESC LIMIT 10',period.start,period.end),
  db.prepare('SELECT MIN(day) AS started FROM daily_analytics').first()
 ]);
 const metrics={page_view:'views',store_entry:'entries',add_to_bag:'bagAdds',bag_enquiry:'bagEnquiries'};
 const blank=()=>({views:0,entries:0,bagAdds:0,bagEnquiries:0,signups:0,enquiries:0,inbound:0,outbound:0,campaignEmails:0});
 const current=blank(),previous=blank(),series=new Map(),pages=new Map(),interest=new Map();
 for(let index=0;index<period.days;index++){const day=new Date(period.start+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+index);series.set(dateKey(day),{day:dateKey(day),...blank()});}
 const add=(day,key,count)=>{if(!key)return;const n=Number(count)||0;(day>=period.start?current:previous)[key]+=n;if(series.has(day))series.get(day)[key]+=n;};
 for(const event of events){add(event.day,metrics[event.event],event.count);if(event.day<period.start)continue;if(event.event==='page_view')pages.set(event.path,(pages.get(event.path)||0)+Number(event.count));if(event.event==='add_to_bag')interest.set(event.product_id,(interest.get(event.product_id)||0)+Number(event.count));}
 for(const row of signups)add(row.day,'signups',row.count);for(const row of enquiries)add(row.day,'enquiries',row.count);for(const row of sent)add(row.day,'campaignEmails',row.count);for(const row of mail)add(row.day,row.direction==='inbound'?'inbound':'outbound',row.count);
 const live=products.filter(row=>!retiredProductIds.includes(Number(row.id))).map(mapProduct),stock=[];
 for(const product of live){for(const item of product.options?.length?product.options:[product]){for(const [size,quantity] of Object.entries(item.sizes||product.sizes||{}))stock.push({id:product.id,name:item.name,size,quantity:Number(quantity)});}}
 const totals=stock.reduce((result,row)=>({units:result.units+row.quantity,soldOut:result.soldOut+Number(row.quantity===0),low:result.low+Number(row.quantity>0&&row.quantity<=5)}),{units:0,soldOut:0,low:0});
 return {period,current,previous,daily:[...series.values()],pages:[...pages].map(([path,views])=>({path,views})).sort((a,b)=>b.views-a.views),products:[...interest].map(([id,adds])=>({id,name:live.find(p=>p.id===id)?.name||catalog.find(p=>p.id===id)?.name||'Product '+id,adds})).sort((a,b)=>b.adds-a.adds),audience,inventory:{...totals,activeProducts:live.length,attention:stock.filter(row=>row.quantity<=5).sort((a,b)=>a.quantity-b.quantity).slice(0,50)},campaigns,trackingStarted:tracking?.started||null,generatedAt:new Date().toISOString()};
}
