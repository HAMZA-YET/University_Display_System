// D06 bridge reuses D05 identity, service environment and storage.
import {notificationTools} from './memberAdapter.js';
export {notificationTools};
export async function readInbox({scenario='ready',signal}={}){
 await new Promise((resolve,reject)=>{
 const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},scenario==='loading'?30000:160);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 });
 if(scenario==='error')throw Error('Local inbox demo failure');
 if(scenario==='empty')return {rows:[],unread:0};
 const result=await notificationTools.fetch();
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 return result;
}
