export const $=id=>document.getElementById(id);
export const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(cls)node.className=cls;return node;};
export const alertMsg=(text,error=false)=>{const node=$('alert');node.textContent=text;node.style.color=error?'#ff9f89':'#9ed7aa';};
export async function api(path,options={}){const response=await fetch('/api/admin/'+path,{credentials:'same-origin',...options,headers:{'content-type':'application/json',...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'Request failed ('+response.status+')');return body;}
export const safe=async fn=>{try{await fn();}catch(error){alertMsg(error.message,true);}};
export const button=(label,fn,cls='secondary')=>{const node=el('button',label,cls);node.type='button';node.addEventListener('click',()=>safe(fn));return node;};
export const when=t=>t?new Date(t.includes('T')?t:t.replace(' ','T')+'Z').toLocaleString():'—';
