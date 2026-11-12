import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/assets/js/launch.js',import.meta.url),'utf8');
function harness(saved=null,blocked=false){
  let now=0,click,focused=0,events=0;
  const gate={hidden:false},store={hidden:true,querySelector:()=>({setAttribute(){},focus(){focused++;}})},cloud={addEventListener:(name,fn)=>click=fn};
  const storage={getItem(){if(blocked)throw Error('disabled');return saved;},setItem(_,value){if(blocked)throw Error('disabled');saved=value;}};
  const context={window:{scrollTo(){}},sessionStorage:storage,performance:{now:()=>now},Event:class{constructor(type){this.type=type;}},document:{title:'Home — Perverse World',getElementById:id=>({launchGate:gate,storefront:store,launchCloud:cloud})[id],dispatchEvent(){events++;}}};
  vm.runInNewContext(source,context);
  return {gate,store,context,click:time=>{now=time;click();},saved:()=>saved,focused:()=>focused,events:()=>events};
}
test('six cloud clicks remain locked; seven within five seconds enter exactly once',()=>{
  const page=harness();assert.equal(page.context.document.title,'Coming Soon — Perverse World');
  for(let i=0;i<6;i++)page.click(i*500);
  assert.equal(page.store.hidden,true);assert.equal(page.gate.hidden,false);
  page.click(5000);assert.equal(page.store.hidden,false);assert.equal(page.gate.hidden,true);
  assert.equal(page.saved(),'1');assert.equal(page.focused(),1);assert.equal(page.events(),1);
  page.click(5001);assert.equal(page.events(),1);
});
test('expired clicks fall outside the rolling window',()=>{
  const page=harness();page.click(0);
  for(let i=0;i<6;i++)page.click(5001+i);
  assert.equal(page.store.hidden,true);
  page.click(5010);assert.equal(page.store.hidden,false);
});
test('session access survives navigation and refresh without moving focus',()=>{
  const page=harness('1');assert.equal(page.store.hidden,false);assert.equal(page.focused(),0);
  assert.equal(page.context.document.title,'Home — Perverse World');
});
test('unavailable storage still allows entry on the current page',()=>{
  const page=harness(null,true);for(let i=0;i<7;i++)page.click(i);
  assert.equal(page.store.hidden,false);
});
