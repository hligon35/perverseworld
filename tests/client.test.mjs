import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {retiredProductIds} from '../src/site/catalog-policy.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const products=JSON.parse(await read('src/site/products.json'));
const storefront=await read('public/assets/js/storefront.js');
const forms=await read('public/assets/js/forms.js');
function element(){
  const classes=new Set();
  return {dataset:{},value:'featured',innerHTML:'',textContent:'',disabled:false,
    setAttribute(){},querySelectorAll(){return [];},
    classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,force){const value=force??!classes.has(x);if(value)classes.add(x);else classes.delete(x);return value;}}
  };
}
function shop(storage,category='all',catalog=true,featuredId=0){
  const nodes=Object.fromEntries(['toast','shop','products','sort','drawer','modal','overlay','modalImg','modalName','modalPrice','sizes','cartCount','subtotal','cartItems','modalAdd','cartBtn','closeCart','closeModal','checkout','mobileMenu','menuBtn'].map(id=>[id,element()]));
  nodes.shop.dataset.category=category;
  nodes.shop.dataset.featuredId=String(featuredId);
  if(!catalog){delete nodes.shop;delete nodes.products;delete nodes.sort;}
  const context={window:{PW_CATALOG:products,PW_CATALOG_CONFIG:{retiredProductIds}},sessionStorage:storage,setTimeout:()=>{},document:{getElementById:id=>nodes[id],querySelectorAll:()=>[],addEventListener(){}}};
  vm.runInNewContext(storefront,context);return {nodes,context};
}
test('old and API-only bags survive independent pages and refreshes',()=>{
  let value=JSON.stringify([{id:2,size:'M'},{id:99,name:'API item',price:42,img:'https://example.com/product.jpg',size:'XL'}]);
  const storage={getItem:()=>value,setItem:(_,text)=>value=text};
  const first=shop(storage);
  assert.equal(first.nodes.cartCount.textContent,2);assert.equal(first.nodes.subtotal.textContent,'$80.00');
  first.context.window.PWStore.updateCatalog([{id:99,name:'Live item',cat:'tees',price:45,img:'https://example.com/product.jpg'}]);
  for(const category of ['tees','hoodies','sets']){
    const next=shop(storage,category,false);
    assert.equal(next.nodes.cartCount.textContent,2);
    assert.equal(next.nodes.subtotal.textContent,'$83.00');
    assert.match(next.nodes.cartItems.innerHTML,/Live item/);
  }
});
test('collection filtering applies after live API refresh; content is escaped',()=>{
  const storage={getItem:()=>'{bad',setItem(){}};
  const {context,nodes}=shop(storage,'hoodies');
  assert.match(nodes.products.innerHTML,/Midnight Riot Hoodie/);assert.doesNotMatch(nodes.products.innerHTML,/Worldscape Tee/);
  context.window.PWStore.updateCatalog([{id:9,name:'<img onerror=bad>',cat:'hoodies',sub:'<script>',price:60,img:'javascript:bad'},{id:10,name:'TEE',cat:'tees',price:30}]);
  assert.match(nodes.products.innerHTML,/&lt;img onerror=bad&gt;/);assert.doesNotMatch(nodes.products.innerHTML,/javascript:bad|>TEE</);
  assert.equal(nodes.cartCount.textContent,0);
});
test('storage failures do not break pages without a catalog',()=>{
  const {nodes}=shop({getItem(){throw Error('disabled');},setItem(){throw Error('disabled');}},'all',false);
  nodes.cartBtn.onclick();assert.equal(nodes.drawer.classList.contains('open'),true);
});

test('home keeps only the World Logo Hoodie after API refresh and does not substitute other products',()=>{
  const {nodes,context}=shop({getItem:()=>'[]',setItem(){}},'all',true,5);
  assert.match(nodes.products.innerHTML,/World Logo Hoodie/);
  assert.doesNotMatch(nodes.products.innerHTML,/Worldscape Tee|Green Flame Set|Midnight Riot Hoodie/);
  context.window.PWStore.updateCatalog([...products].reverse().map(p=>({...p,img:'builtin:'+p.id})));
  assert.equal((nodes.products.innerHTML.match(/<article /g)||[]).length,1);
  assert.match(nodes.products.innerHTML,/World Logo Hoodie/);
  context.window.PWStore.updateCatalog(products.filter(p=>p.id!==5));
  assert.doesNotMatch(nodes.products.innerHTML,/<article /);
  assert.match(nodes.products.innerHTML,/currently unavailable/);
});

test('retired items cannot return through stale API responses or saved bags',()=>{
  const storage={getItem:()=>JSON.stringify([{id:1,name:'Otherworld Graphic Tee',price:35,size:'M'},{id:6,name:'Possessed Hand Graphic',price:30,size:'S'},{id:5,size:'L'}]),setItem(){}};
  const {nodes,context}=shop(storage);
  assert.equal(nodes.cartCount.textContent,1);assert.match(nodes.cartItems.innerHTML,/World Logo Hoodie/);
  context.window.PWStore.updateCatalog([...products,{id:1,name:'Otherworld Graphic Tee',cat:'tees',price:35,img:'builtin:1'},{id:6,name:'Possessed Hand Graphic',cat:'sets',price:30,img:'builtin:6'}]);
  assert.doesNotMatch(nodes.products.innerHTML,/Otherworld Graphic Tee|Possessed Hand Graphic/);
  assert.equal(nodes.cartCount.textContent,1);
});
test('forms mount only existing challenges, send matching tokens, and reset after success/failure',async()=>{
  for(const action of ['newsletter','contact']){
    const form=element(),button=element(),status=element(),mount=element();let options,script,posted,resets=0;
    form.querySelector=()=>button;form.reset=()=>{};
    const ids=action==='contact'?{contactForm:form,'contact-status':status,'contact-challenge':mount}:{signup:form,signupMsg:status,'newsletter-challenge':mount,email:{value:'test@example.com'}};
    const context={URLSearchParams,window:{PWStore:{updateCatalog(){}},turnstile:{render(el,config){assert.equal(el,mount);options=config;return 0;},reset(){resets++;}}},
      FormData:class{*[Symbol.iterator](){yield ['message','Hello'];}},console,
      document:{getElementById:id=>ids[id],createElement:()=>({}),head:{append:el=>script=el}},
      fetch:async(path,opt)=>{if(path==='/api/config')return Response.json({turnstileSiteKey:'public'});if(path==='/api/products')return Response.json({products:[]});posted=JSON.parse(opt.body);return Response.json({ok:true});}
    };
    vm.runInNewContext(forms,context);
    await new Promise(resolve=>setImmediate(resolve));script.onload();
    assert.equal(options.action,action);assert.equal(button.disabled,true);
    options.callback('verified-token');assert.equal(button.disabled,false);
    await form.onsubmit({preventDefault(){}});
    assert.equal(posted.turnstileToken,'verified-token');assert.equal(button.disabled,true);assert.equal(resets,1);
    posted=null;await form.onsubmit({preventDefault(){}});assert.equal(posted,null);
    options.callback('expired');options['expired-callback']();assert.equal(button.disabled,true);
    options.callback('rejected');context.fetch=async()=>Response.json({error:'Rejected'},{status:403});
    await form.onsubmit({preventDefault(){}});assert.equal(status.textContent,'Rejected');assert.equal(resets,2);
  }
});

test('catalog and Turnstile stay idle until the launch gate opens',async()=>{
  let entered,calls=0;
  const context={URLSearchParams,window:{PWStore:{updateCatalog(){}}},console,
    document:{getElementById:id=>id==='launchGate'?{}:null,addEventListener:(event,fn)=>{assert.equal(event,'pw:entered');entered=fn;}},
    fetch:async()=>{calls++;return Response.json({products:[]});}
  };
  vm.runInNewContext(forms,context);assert.equal(calls,0);
  await entered();assert.equal(calls,1);
});

test('bag enquiries populate the contact form without sending anything',()=>{
  const form={elements:{subject:{value:''},message:{value:''}},querySelector:()=>({})};
  const context={URLSearchParams,window:{location:{search:'?enquiry=bag'}},sessionStorage:{getItem:()=>JSON.stringify([{name:'World Logo Hoodie',size:'M'}])},
    document:{getElementById:id=>id==='contactForm'?form:id==='launchGate'?{}:null,addEventListener(){}},
    fetch:()=>{throw Error('No request before entry');}
  };
  vm.runInNewContext(forms,context);
  assert.equal(form.elements.subject.value,'Order enquiry');
  assert.match(form.elements.message.value,/World Logo Hoodie — Size M/);
});
