import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {analyticsPeriod,validAnalyticsEvent,recordAnalytics} from '../src/analytics.js';
const base='https://perverseworld.com';
test('analytics periods use inclusive UTC days and equal, non-overlapping previous periods',()=>{
 assert.deepEqual(analyticsPeriod('7',new Date('2026-01-02T23:59:00Z')),{days:7,start:'2025-12-27',end:'2026-01-02',previousStart:'2025-12-20',previousEnd:'2025-12-26'});
 assert.throws(()=>analyticsPeriod('365'),/7, 30 or 90/);assert.throws(()=>analyticsPeriod('7 OR 1=1'));
});
test('event validation accepts only bounded store routes and approved event types, never query strings or identities',()=>{
 assert.deepEqual(validAnalyticsEvent({event:'page_view',path:'/shop/'}),{event:'page_view',path:'/shop',productId:0});
 assert.deepEqual(validAnalyticsEvent({event:'add_to_bag',path:'/shop',productId:99}),{event:'add_to_bag',path:'/shop',productId:99});
 for(const body of [{event:'purchase',path:'/'},{event:'page_view',path:'/admin/'},{event:'page_view',path:'/contact?email=private@example.com'},{event:'add_to_bag',path:'/shop',productId:-1},{event:'add_to_bag',path:'/shop',productId:1},{event:'store_entry',path:'/',productId:2}])assert.equal(validAnalyticsEvent(body),null);
});
test('public collection requires same-origin browser requests and stores only server-dated aggregates',async()=>{
 const writes=[];const env={PUBLIC_BASE_URL:base,DB:{prepare:sql=>({bind(...args){this.args=args;return this;},async run(){writes.push({sql,args:this.args});return {meta:{changes:1}};},async first(){return this.args[0]===99?{id:99}:null;}})}};
 const request=(body,origin=base,host=base)=>new Request(host+'/api/analytics',{method:'POST',headers:{...(origin?{origin}:{}),'content-type':'text/plain'},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await recordAnalytics(request({event:'page_view',path:'/',email:'not-stored@example.com'}),env)).status,204);
 assert.deepEqual(writes[0].args,['page_view','/',0]);assert.match(writes[0].sql,/date\('now'\)/);assert.match(writes[0].sql,/count=count\+1/);
 assert.equal((await recordAnalytics(request({event:'add_to_bag',path:'/shop',productId:99}),env)).status,204);
 assert.equal((await recordAnalytics(request({event:'add_to_bag',path:'/shop',productId:98}),env)).status,400);
 assert.equal((await recordAnalytics(request({event:'page_view',path:'/'},'https://other.example'),env)).status,403);
 assert.equal((await recordAnalytics(request({event:'page_view',path:'/'},''),env)).status,403);
 assert.equal((await recordAnalytics(request(' '.repeat(1025)),env)).status,413);
 assert.equal((await recordAnalytics(request('{broken'),env)).status,400);assert.equal(writes.length,2);
 assert.equal((await recordAnalytics(request({event:'page_view',path:'/'},'https://www.perverseworld.com','https://www.perverseworld.com'),env)).status,204);
});
const source=await readFile(new URL('../public/assets/js/analytics.js',import.meta.url),'utf8');
function client(navigator={}){const requests=[],listeners={};vm.runInNewContext(source,{navigator,location:{pathname:'/shop/',search:'?email=private@example.com'},document:{body:{dataset:{sitePage:'shop'}},addEventListener(name,fn){listeners[name]=fn;}},fetch(path,options){requests.push({path,...options});return Promise.resolve();}});return {requests,listeners};}
test('browser counts page views and successful actions without cookies, queries or visitor identifiers',()=>{
 const {requests,listeners}=client();listeners['pw:entered']();listeners['pw:bag-added']({detail:{productId:2}});listeners.click({target:{closest:selector=>selector==='#checkout'}});
 assert.deepEqual(requests.map(request=>JSON.parse(request.body).event),['page_view','store_entry','add_to_bag','bag_enquiry']);
 for(const request of requests){assert.equal(request.credentials,'omit');assert.equal(request.keepalive,true);assert.equal(JSON.parse(request.body).path,'/shop');assert.doesNotMatch(request.body,/email|private|visitor|session|referrer/);}
 assert.equal(client({doNotTrack:'1'}).requests.length,0);assert.equal(client({globalPrivacyControl:true}).requests.length,0);
});
