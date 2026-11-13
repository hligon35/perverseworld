import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker from '../src/worker.js';
import {drainOutbox} from '../src/email.js';
import {saveContact} from '../src/customer-messages.js';
const migrations=await Promise.all((await readdir(new URL('../migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort().map(name=>readFile(new URL('../migrations/'+name,import.meta.url),'utf8')));
function database(){
 const sql=new DatabaseSync(':memory:');for(const migration of migrations)sql.exec(migration);
 const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async all(){return {results:sql.prepare(query).all(...values)};},async first(){return sql.prepare(query).get(...values)||null;},async run(){const result=sql.prepare(query).run(...values);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}};},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};return {sql,db};
}
async function fixture(run){
 const {sql,db}=database(),sent=[],pending=[];const env={DB:db,PUBLIC_BASE_URL:'https://perverseworld.com',FROM_EMAIL:'updates@perverseworld.com',MAILBOX_FROM_EMAIL:'info@perverseworld.com',NOTIFICATION_EMAIL:'info@perverseworld.com',RESEND_API_KEY:'test-key',TURNSTILE_SITE_KEY:'public-test-key',TURNSTILE_SECRET:'test-secret'};let reject=false;const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/siteverify'))return Response.json({success:true,hostname:'perverseworld.com',action:options.body.get('response').startsWith('contact')?'contact':'newsletter'});
  assert.equal(url,'https://api.resend.com/emails');sent.push({payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return reject?Response.json({error:'Unavailable'},{status:503}):Response.json({id:'provider-'+sent.length});
 };
 const send=async(path,body,method='POST')=>{const response=await worker.fetch(new Request(env.PUBLIC_BASE_URL+path,{method,headers:{origin:env.PUBLIC_BASE_URL,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil:work=>pending.push(work)});await Promise.all(pending.splice(0));return response;};
 try{await run({sql,db,env,sent,send,reject:value=>{reject=value;}});}finally{globalThis.fetch=original;sql.close();}
}
const signup={email:'customer@example.com',turnstileToken:'newsletter-ok'};
const contact={name:'Customer <script>',email:'customer@example.com',subject:'Sizing & availability',message:'Can I order <b>two</b> pieces?',requestId:'11111111-1111-4111-8111-111111111111',turnstileToken:'contact-ok'};
test('newsletter requires explicit confirmation, sends branded welcome/owner notifications once and respects unsubscribe',async()=>{
 await fixture(async({sql,sent,send})=>{
  assert.equal((await send('/api/newsletter/subscribe',signup)).status,200);let subscriber=sql.prepare('SELECT * FROM subscribers').get();assert.equal(subscriber.status,'pending');assert.equal(subscriber.confirmed_at,null);assert.equal(sent.length,1);
  const url=sent[0].payload.html.match(/https:\/\/perverseworld.com\/newsletter\/confirm\?token=[a-f0-9]{48}/)[0],path=new URL(url).pathname+new URL(url).search;
  assert.ok(!subscriber.confirm_token_hash.includes(new URL(url).searchParams.get('token')));
  await send('/api/newsletter/subscribe',signup);assert.equal(sent.length,1,'pending sign-ups have a cooldown');
  const get=await send(path,undefined,'GET');assert.equal(get.status,200);assert.match(await get.text(),/CONFIRM MY EMAIL/);assert.equal(sql.prepare('SELECT status FROM subscribers').get().status,'pending','link scanners do not activate subscriptions');
  const confirmed=await send(path);assert.equal(confirmed.status,200);subscriber=sql.prepare('SELECT * FROM subscribers').get();assert.equal(subscriber.status,'active');assert.ok(subscriber.confirmed_at);assert.equal(sent.length,3);assert.match(sent[1].payload.html,/Welcome to Perverse World/);assert.match(sent[1].payload.html,/perverse-world-logo.png/);assert.equal(sent[2].payload.to[0],'info@perverseworld.com');assert.equal(sql.prepare("SELECT COUNT(*) n FROM email_outbox WHERE status='sent'").get().n,3);
  await send(path);await send('/api/newsletter/subscribe',signup);assert.equal(sent.length,3,'confirmation and active sign-up retries are idempotent');
  const unsubscribe='/unsubscribe?token='+subscriber.unsub_token;await send(unsubscribe,undefined,'GET');assert.equal(sql.prepare('SELECT status FROM subscribers').get().status,'active');await send(unsubscribe);assert.equal(sql.prepare('SELECT status FROM subscribers').get().status,'unsubscribed');
  await send('/api/newsletter/subscribe',signup);assert.equal(sql.prepare('SELECT status FROM subscribers').get().status,'pending');await send(path);assert.equal(sql.prepare('SELECT status FROM subscribers').get().status,'pending','old confirmation links cannot reactivate a new subscription');
 });
});
test('contact save and both notifications are durable, escaped and idempotent across browser retries',async()=>{
 await fixture(async({sql,sent,send})=>{
  const response=await send('/api/submissions',contact),result=await response.json();assert.equal(response.status,200);assert.equal(result.reference,'PW-1');assert.equal(sql.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);assert.equal(sent.length,2);assert.match(sent[0].payload.html,/PW-1/);assert.equal(sent[0].payload.reply_to,'info@perverseworld.com');assert.equal(sent[1].payload.reply_to,contact.email);assert.match(sent[0].payload.html,/Customer &lt;script&gt;/);assert.match(sent[0].payload.html,/&lt;b&gt;two&lt;\/b&gt;/);assert.doesNotMatch(sent[0].payload.html,/<script>/);
  assert.equal((await send('/api/submissions',contact)).status,200);assert.equal(sent.length,2);assert.equal((await send('/api/submissions',{...contact,message:'Different message'})).status,409);
 });
});
test('provider failures preserve contact messages and retry with stable idempotency keys',async()=>{
 await fixture(async({sql,env,sent,send,reject})=>{
  reject(true);assert.equal((await send('/api/submissions',contact)).status,200);assert.equal(sql.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);assert.equal(sql.prepare("SELECT COUNT(*) n FROM email_outbox WHERE status='queued'").get().n,2);const keys=sent.map(message=>message.key);
  sql.exec("UPDATE email_outbox SET next_attempt_at=datetime('now','-1 minute')");reject(false);const results=await Promise.all([drainOutbox(env),drainOutbox(env)]);assert.equal(results.reduce((sum,result)=>sum+result.sent,0),2);assert.equal(sql.prepare("SELECT COUNT(*) n FROM email_outbox WHERE status='sent'").get().n,2);assert.deepEqual(sent.slice(2).map(message=>message.key).sort(),keys.sort());
 });
});
test('expired or unsubscribed confirmations are cancelled and expired retry windows never send',async()=>{
 await fixture(async({sql,env,sent,send,reject})=>{
  reject(true);await send('/api/newsletter/subscribe',signup);const count=sent.length;sql.exec("UPDATE subscribers SET status='unsubscribed';UPDATE email_outbox SET next_attempt_at=datetime('now','-1 minute')");reject(false);await drainOutbox(env);assert.equal(sent.length,count);assert.equal(sql.prepare('SELECT status FROM email_outbox').get().status,'cancelled');
  await send('/api/submissions',contact);sql.exec("UPDATE email_outbox SET status='queued',first_attempt_at=datetime('now','-25 hours'),next_attempt_at=datetime('now','-1 minute') WHERE kind='contact-reply'");const before=sent.length;await drainOutbox(env);assert.equal(sent.length,before);assert.equal(sql.prepare("SELECT status FROM email_outbox WHERE kind='contact-reply'").get().status,'failed');
 });
});
test('contact transaction failure rolls back both the message and notification records',async()=>{
 const {sql,db}=database();try{sql.exec("CREATE TRIGGER reject_test_mail BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'test unavailable');END;");await assert.rejects(saveContact({DB:db,PUBLIC_BASE_URL:'https://perverseworld.com',FROM_EMAIL:'updates@perverseworld.com'},contact));assert.equal(sql.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);}finally{sql.close();}
});
