import {createMockItemCatalog} from '../../../../backend/member4/mock/itemCatalog.mjs';
const visibilityKey='uids-d05-synthetic-visibility';
function hidden(){try{const value=JSON.parse(localStorage.getItem(visibilityKey)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
export function currentPublicItem(id){return createMockItemCatalog(hidden()).get(id);}
export function currentPublicItems(){return createMockItemCatalog(hidden()).list();}
export function setSyntheticVisibility(id,visible){const catalog=createMockItemCatalog(hidden());catalog.setMockVisibility(id,visible);localStorage.setItem(visibilityKey,JSON.stringify(catalog.hiddenIds()));}
export function restoreSyntheticItems(){localStorage.removeItem(visibilityKey);}
export function safeItemReturn(raw){
 if(!raw||!raw.startsWith('/items')||raw.startsWith('//'))return null;
 try{const url=new URL(raw,'https://local.invalid');if(url.origin!=='https://local.invalid'||url.pathname!=='/items')return null;const params=new URLSearchParams();const type=url.searchParams.get('type');if(type&&['lost','found'].includes(type))params.set('type',type);return '/items'+(params.size?'?'+params:'')+(/^#item-[a-z0-9-]+$/.test(url.hash)?url.hash:'');}catch{return null;}
}
export async function readItems({id,type='',scenario='ready',signal}={}){
 await new Promise((resolve,reject)=>{
 const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},scenario==='loading'?30000:180);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 });
 if(scenario==='error')throw Error('Local item demo failed');
 if(scenario==='unavailable')return {kind:'detail',item:null};
 if(id)return {kind:'detail',item:currentPublicItem(id)};
 if(type&&!['lost','found'].includes(type))return {kind:'invalid'};
 return {kind:'list',items:scenario==='empty'?[]:currentPublicItems().filter(item=>!type||item.type===type)};
}
