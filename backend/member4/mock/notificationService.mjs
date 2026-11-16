// MOCK extension of D05 member state. No HTTP routes/auth/event authenticity.
const eventIdPattern=/^[a-z0-9-]{1,100}$/;
export function safeNotificationDestination(href){
 return typeof href==='string'&&/^\/(?:notices|items)\/[a-z0-9-]+$/.test(href)?href:null;
}
export function initializeNotificationState(row,raw={}){
 row.notificationPreferences={inApp:raw.notificationPreferences?.inApp!==false,notices:raw.notificationPreferences?.notices!==false,items:raw.notificationPreferences?.items!==false};
 row.notifications=new Map();
 for(const delivery of Array.isArray(raw.notifications)?raw.notifications:[]){
 if(typeof delivery?.id==='string'&&eventIdPattern.test(delivery.id)&&typeof delivery.occurredAt==='string'&&typeof delivery.sourceId==='string'&&delivery.sourceId.length<=180&&Number.isFinite(Date.parse(delivery.occurredAt)))row.notifications.set(delivery.id,{id:delivery.id,sourceId:delivery.sourceId,occurredAt:new Date(delivery.occurredAt).toISOString(),read:delivery.read===true});
 }
}
export function createMockNotificationExtension({owner,members,resolveRecord,ledgerSnapshot=[]}){
 const ledger=new Map((Array.isArray(ledgerSnapshot)?ledgerSnapshot:[]).filter(value=>Array.isArray(value)&&typeof value[0]==='string'&&eventIdPattern.test(value[0])&&typeof value[1]==='string'));
 let processing=Promise.resolve();
 async function current(sourceId){
 const record=await resolveRecord(sourceId);
 if(!record||!safeNotificationDestination(record.href)||!['notice','lost','found'].includes(record.kind))return null;
 return record;
 }
 async function list(context,{requestedOwner}={}){
 const row=owner(context,requestedOwner);
 const values=await Promise.all([...row.notifications.values()].map(async delivery=>{
 const record=await current(delivery.sourceId);
 return record?{id:delivery.id,read:delivery.read,occurredAt:delivery.occurredAt,available:true,title:record.title,summary:record.summary||'Fictional public update.',kind:record.kind}:{id:delivery.id,occurredAt:delivery.occurredAt,available:false};
 }));
 return values.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
 }
 const methods={
 listNotifications:list,
 async unreadNotificationCount(context,options){return (await list(context,options)).filter(value=>value.available&&!value.read).length;},
 setNotificationRead(context,id,read,{requestedOwner}={}){const row=owner(context,requestedOwner);if(typeof read!=='boolean')throw Error('Invalid read state');const value=row.notifications.get(id);if(!value)throw Error('Mock access denied');value.read=read;return {id,read};},
 async markAllNotificationsRead(context,{requestedOwner}={}){const row=owner(context,requestedOwner),values=await list(context,{requestedOwner});let updated=0;for(const value of values)if(value.available&&!value.read){row.notifications.get(value.id).read=true;updated++;}return {updated};},
 async openNotification(context,id,{requestedOwner}={}){const row=owner(context,requestedOwner),value=row.notifications.get(id);if(!value)throw Error('Mock access denied');return await current(value.sourceId);},
 notificationPreferences(context,{requestedOwner}={}){return {...owner(context,requestedOwner).notificationPreferences};},
 updateNotificationPreferences(context,changes,{requestedOwner}={}){const row=owner(context,requestedOwner);if(!changes||Object.keys(changes).some(key=>!['inApp','notices','items'].includes(key)||typeof changes[key]!=='boolean'))throw Error('Invalid notification preferences');Object.assign(row.notificationPreferences,changes);return {...row.notificationPreferences};}
 };
 async function handle(event){
 if(!event||typeof event.id!=='string'||!eventIdPattern.test(event.id)||typeof event.occurredAt!=='string'||typeof event.sourceId!=='string'||event.sourceId.length>180||!Number.isFinite(Date.parse(event.occurredAt)))throw Error('Invalid synthetic event');
 const occurredAt=new Date(event.occurredAt).toISOString(),fingerprint=JSON.stringify([event.sourceId,occurredAt]);
 if(ledger.has(event.id)){if(ledger.get(event.id)!==fingerprint)throw Error('Synthetic event identifier conflict');return {delivered:0,duplicate:true,eligible:true};}
 const record=await current(event.sourceId);
 if(!record)return {delivered:0,duplicate:false,eligible:false};
 let delivered=0;
 for(const row of members.values()){
 const prefs=row.notificationPreferences;
 const sourceEnabled=record.kind==='notice'?prefs.notices:prefs.items;
 const followed=row.follows.has('category:'+record.category)||row.follows.has('department:'+record.department);
 if(prefs.inApp&&sourceEnabled&&followed&&!row.notifications.has(event.id)){
 row.notifications.set(event.id,{id:event.id,sourceId:event.sourceId,occurredAt,read:false});delivered++;
 }
 }
 ledger.set(event.id,fingerprint);
 return {delivered,duplicate:false,eligible:true};
 }
 return {methods,processMockEvent:event=>{const task=processing.then(()=>handle(event));processing=task.catch(()=>{});return task;},ledgerSnapshot:()=>[...ledger]};
}
