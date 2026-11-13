import {initDrawerCollapse} from './drawer.js';
import {editProduct,saveProduct,initProductEditor} from './product-editor.js';
import {mailbox,initMailbox} from './mailbox.js';
import {newsletterTemplate,defaultNewsletterBody} from '/assets/js/newsletter-template.js';
const $=id=>document.getElementById(id);let catalog=[],campaigns=[];
const el=(tag,t,cls)=>{const n=document.createElement(tag);if(t!=null)n.textContent=String(t);if(cls)n.className=cls;return n};
const empty=(target,cols,text='No records yet.')=>{const tr=el('tr'),td=el('td',text,'empty');td.colSpan=cols;tr.append(td);target.append(tr)};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const when=t=>t?new Date(t.includes('T')?t:t.replace(' ','T')+'Z').toLocaleString():'—';
const alertMsg=(s,error=false)=>{const x=$('alert');x.textContent=s;x.style.color=error?'#ff9f89':'#9ed7aa'};
async function api(path,options={}){const r=await fetch('/api/admin/'+path,{credentials:'same-origin',headers:{'content-type':'application/json',...(options.headers||{})},...options});const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.error||'Request failed ('+r.status+')');return b}
const safe=async f=>{try{await f()}catch(e){alertMsg(e.message,true)}};
const button=(name,fn,cls='secondary')=>{const b=el('button',name,cls);b.type='button';b.addEventListener('click',()=>safe(fn));return b};
const cell=(tr,...nodes)=>{const td=el('td');nodes.forEach(n=>td.append(typeof n==='string'?document.createTextNode(n):n));tr.append(td);return td};
function page(name){drawer(false);window.scrollTo(0,0);document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===name));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===name));$('pageTitle').textContent=({overview:'Overview',products:'Inventory & Products',submissions:'Submissions',mailbox:'Mailbox',newsletter:'Newsletter Builder',subscribers:'Subscribers'})[name];location.hash=name;safe(()=>load(name))}
async function load(name){switch(name){case 'overview':return overview();case 'products':return products();case 'submissions':return submissions();case 'mailbox':return mailbox();case 'newsletter':return newsletters();case 'subscribers':return subscribers()}}
async function overview(){const x=await api('overview');for(const k of ['Products','Subscribers','Submissions','Mailbox'])$('stat'+k).textContent=x[k.toLowerCase()]}
async function products(){catalog=(await api('products')).items;const t=$('productRows');t.replaceChildren();if(!catalog.length)return empty(t,6);for(const p of catalog){const tr=el('tr');cell(tr,el('strong',p.name));cell(tr,p.cat);cell(tr,(p.options?.length?'From ':'')+money(Math.round(p.price*100)));cell(tr,(p.options?.length?p.options.flatMap(option=>Object.values(option.sizes||p.sizes||{})):Object.values(p.sizes||{})).reduce((a,b)=>a+b,0).toLocaleString());cell(tr,el('span',p.active?'Live':'Hidden','pill '+(p.active?'active':'')));cell(tr,button('Edit',()=>editProduct(p)));t.append(tr)}}
async function submissions(){const rows=(await api('submissions')).items,t=$('submissionRows');t.replaceChildren();if(!rows.length)return empty(t,5);for(const s of rows){const tr=el('tr');cell(tr,when(s.created_at));cell(tr,el('strong',s.name),el('div',s.email,'muted small'));cell(tr,el('strong',s.subject),el('p',s.message,'mailcontent muted small'));cell(tr,el('span',s.status,'pill '+s.status));cell(tr,button(s.status==='new'?'Mark reviewed':'Close',async()=>{await api('submissions/'+s.id,{method:'PATCH',body:JSON.stringify({status:s.status==='new'?'reviewed':'closed'})});await submissions()}));t.append(tr)}}
async function subscribers(){const rows=(await api('subscribers')).items,t=$('subscriberRows');t.replaceChildren();if(!rows.length)return empty(t,3);for(const s of rows){const tr=el('tr');cell(tr,s.email);cell(tr,el('span',s.status,'pill '+s.status));cell(tr,when(s.consent_at));t.append(tr)}}
async function newsletters(){campaigns=(await api('newsletters')).items;const t=$('campaignRows');t.replaceChildren();if(!campaigns.length)return empty(t,5);for(const c of campaigns){const tr=el('tr');cell(tr,el('strong',c.subject),el('div',c.preheader,'muted small'));cell(tr,el('span',c.status,'pill '+c.status));cell(tr,String(c.sent_count));cell(tr,when(c.created_at));cell(tr,button('Preview',()=>previewCampaign(c)),button(c.status==='sent'?'Sent':'Send next 20',async()=>{if(!confirm('Send to the next 20 opted-in subscribers?'))return;const r=await api('newsletters/'+c.id+'/send',{method:'POST',body:'{}'});alertMsg('Sent '+r.sent+'; failed '+r.failed+'; remaining '+r.remaining);await newsletters()},c.status==='sent'?'secondary':'primary'));t.append(tr)}}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>{page(b.dataset.goto);if(b.dataset.goto==='products')editProduct(null)}));
$('newProduct').onclick=()=>editProduct(null);$('cancelProduct').onclick=()=>$('editorWrap').classList.remove('open');$('productForm').onsubmit=e=>safe(async()=>{await saveProduct(e);await products()});
$('newsletterForm').onsubmit=e=>safe(async()=>{e.preventDefault();const f=e.currentTarget;await api('newsletters',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});alertMsg('Newsletter draft saved.');await newsletters()});
const previewCampaign=campaign=>$('newsletterPreview').srcdoc=newsletterTemplate({...campaign||Object.fromEntries(new FormData($('newsletterForm'))),baseURL:location.origin});
$('previewNewsletter').onclick=()=>previewCampaign();
$('newsletterForm').addEventListener('input',()=>previewCampaign());
$('resetNewsletter').onclick=()=>{$('newsletterHTML').value=defaultNewsletterBody;previewCampaign()};
$('newsletterHTML').value=defaultNewsletterBody;previewCampaign();
for(const [id,fn] of [['reloadProducts',products],['reloadSubmissions',submissions],['reloadMailbox',mailbox],['reloadCampaigns',newsletters],['reloadSubscribers',subscribers]])$(id).onclick=()=>safe(fn);
(async()=>{try{const x=await api('session');$('identity').textContent=x.email;const hash=location.hash.slice(1);page(['overview','products','submissions','mailbox','newsletter','subscribers'].includes(hash)?hash:'overview')}catch(e){$('identity').textContent='Access unavailable';alertMsg(e.message+' · Configure Cloudflare Access and admin allowlist.',true)}})();

const mobileDrawer=matchMedia('(max-width:640px)');
function drawer(open){const mobile=matchMedia('(max-width:640px)').matches;open=!!open&&mobile;const side=$('adminDrawer');side.classList.toggle('open',open);side.inert=mobile&&!open;side.setAttribute('aria-hidden',String(mobile&&!open));document.querySelector('.main').inert=open;document.body.classList.toggle('admin-drawer-open',open);$('adminShade').hidden=!open;$('adminMenu').setAttribute('aria-expanded',String(open));if(open)$('closeAdminDrawer').focus();}
mobileDrawer.addEventListener('change',()=>drawer(false));drawer(false);
$('adminMenu').onclick=()=>drawer(true);$('closeAdminDrawer').onclick=()=>{drawer(false);$('adminMenu').focus()};$('adminShade').onclick=()=>drawer(false);
document.addEventListener('keydown',event=>{if(event.key==='Escape')drawer(false);if(event.key==='Tab'&&$('adminDrawer').classList.contains('open')){const nodes=[...$('adminDrawer').querySelectorAll('button,a[href]')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
initProductEditor();initMailbox();

initDrawerCollapse();
