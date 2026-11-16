// Local inbox context only; not a team production route contract.
export function safeInboxReturn(raw){
 if(typeof raw!=='string'||!raw.startsWith('/notifications')||raw.startsWith('//'))return null;
 try{
 const url=new URL(raw,'https://local.invalid');
 if(url.origin!=='https://local.invalid'||url.pathname!=='/notifications')return null;
 const params=new URLSearchParams();
 if(url.searchParams.getAll('view').length>1)return null;
 const view=url.searchParams.get('view');
 if(view&&!['all','unread'].includes(view))return null;
 if(view==='unread')params.set('view',view);
 return '/notifications'+(params.size?'?'+params:'')+(/^#notification-[a-z0-9-]+$/.test(url.hash)?url.hash:'');
 }catch{return null;}
}
