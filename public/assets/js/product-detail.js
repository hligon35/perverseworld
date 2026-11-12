(() => {
 'use strict';
 const $=id=>document.getElementById(id),detail=$('productDetail');
 if(!detail)return;
 const money=value=>'$'+Number(value).toFixed(2);
 let selected=new URLSearchParams(location.search).get('item')||'',size='S',current=null;
 function gallery(item){
  const views=item.images?.length?item.images:[{src:item.img,label:'Front'}];
  const target=$('detailViews');target.replaceChildren();
  const show=index=>{
   $('detailImg').src=views[index].src;$('detailImg').alt=item.name+' — '+views[index].label;
   target.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  };
  views.forEach((view,index)=>{const button=document.createElement('button');button.type='button';button.textContent=view.label;button.onclick=()=>show(index);target.append(button);});
  show(0);
 }
 function render(){
  const parent=window.PWStore.getProduct(detail.dataset.productId);
  if(!parent){$('detailAdd').disabled=true;$('detailStatus').textContent='This piece is currently unavailable.';return;}
  if(parent.options?.length&&!parent.options.some(option=>option.id===selected))selected=parent.options[0].id;
  current=window.PWStore.saleItem(parent,selected);
  $('detailAdd').disabled=false;$('detailName').textContent=parent.name;
  $('detailPrice').textContent=money(current.price);$('detailSelectedName').textContent=current.name;
  document.querySelectorAll('#detailOptions button').forEach(button=>{
   const option=parent.options?.find(item=>item.id===button.dataset.option);if(!option)return;
   button.setAttribute('aria-pressed',String(button.dataset.option===selected));
   button.querySelector('strong').textContent=money(option.price);
  });
  gallery(current);
 }
 document.querySelectorAll('#detailOptions button').forEach(button=>button.onclick=()=>{
  selected=button.dataset.option;
  const url=new URL(location.href);url.searchParams.set('item',selected);history.replaceState(null,'',url);
  render();
 });
 $('detailSizes').querySelectorAll('button').forEach(button=>button.onclick=()=>{size=button.dataset.size;$('detailSizes').querySelectorAll('button').forEach(item=>item.classList.toggle('selected',item===button));});
 $('detailAdd').onclick=()=>{if(window.PWStore.addItem(current,size))$('detailStatus').textContent=current.name+' — size '+size+' added to your bag.';};
 document.addEventListener('pw:catalog-updated',render);
 render();
})();
