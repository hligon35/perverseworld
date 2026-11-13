import catalog from './site/products.json' with {type:'json'};
import {pageGraph} from './site/seo.js';
import {messagePage} from './email.js';
export async function storefrontResponse(request,env,mapProduct){
 const response=await env.ASSETS.fetch(request),path=new URL(request.url).pathname.replace(/\/+$/,'');
 const source=catalog.find(product=>path==='/shop/'+product.slug);
 if(!source||!env.DB||typeof HTMLRewriter==='undefined'||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
 let row;try{row=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(source.id).first();}catch{return response;}
 if(!row||!row.active)return messagePage(env,{title:'This piece is currently unavailable',message:'Explore the shop for the latest pieces, or contact us about availability.',status:404});
 const product=mapProduct(row),first=product.options?.[0]||product,route={path,page:'product',title:product.name+' — Perverse World',description:product.sub};
 const structured=JSON.stringify(pageGraph(route,[product])).replace(/</g,'\\u003c');
 let rewriter=new HTMLRewriter().on('title',{element:element=>element.setInnerContent(route.title)}).on('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]',{element:element=>element.setAttribute('content',product.sub)}).on('meta[property="og:title"],meta[name="twitter:title"]',{element:element=>element.setAttribute('content',route.title)}).on('meta[property="og:image"],meta[name="twitter:image"]',{element:element=>element.setAttribute('content',new URL(product.img,env.PUBLIC_BASE_URL).href)}).on('script[type="application/ld+json"]',{element:element=>element.setInnerContent(structured,{html:true})}).on('#detailName',{element:element=>element.setInnerContent(product.name)}).on('#detailDescription',{element:element=>element.setInnerContent(product.sub)}).on('#detailSelectedName',{element:element=>element.setInnerContent(first.name)}).on('#detailPrice',{element:element=>element.setInnerContent('$'+first.price.toFixed(2))}).on('#detailImg',{element:element=>element.setAttribute('src',first.img).setAttribute('alt',first.name+' — Front')});
 for(const option of product.options||[])rewriter=rewriter.on(`#detailOptions [data-option="${option.id}"] strong`,{element:element=>element.setInnerContent('$'+option.price.toFixed(2))});
 const headers=new Headers(response.headers);headers.set('cache-control','no-cache');headers.delete('etag');headers.delete('content-length');
 return rewriter.transform(new Response(response.body,{status:response.status,headers}));
}
