import {initializeNotificationState,createMockNotificationExtension} from './notificationService.mjs';
// Isolated in-process MOCK service. No HTTP routes or production auth/storage.
export const productionProtectedRoutesEnabled=false;
export function createSyntheticInterestsEnvironment({resolveRecord,topics,snapshot={}}){
 const contexts=new WeakMap(),members=new Map();
 const accounts=['alpha','beta'];
 for(const account of accounts){
 const row=snapshot?.[account]||{};
 const safeStrings=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.length<=180):[];
 members.set(account,{bookmarks:new Set(safeStrings(row.bookmarks)),follows:new Set(safeStrings(row.follows)),preferences:{compactCards:row.preferences?.compactCards===true,showResolved:row.preferences?.showResolved!==false}});
 }
 for(const account of accounts)initializeNotificationState(members.get(account),snapshot?.[account]||{});
 const sessions=new Map(accounts.map(account=>{const context=Object.freeze({mockOnly:true});contexts.set(context,account);return [account,context];}));
 function owner(context,requestedOwner){
 const account=context&&typeof context==='object'?contexts.get(context):null;
 if(!account||(requestedOwner!==undefined&&requestedOwner!==account))throw Error('Mock access denied');
 return members.get(account);
 }
 function validReference(id){if(typeof id!=='string'||!id||id.length>180)throw Error('Invalid record reference');}
 function topicKey(kind,target){if(!Object.hasOwn(topics,kind)||!topics[kind].includes(target))throw Error('Unknown mock topic');return kind+':'+target;}
 const service={
 async saveBookmark(context,id,{requestedOwner}={}){const row=owner(context,requestedOwner);validReference(id);if(!await resolveRecord(id))throw Error('Information unavailable');const existed=row.bookmarks.has(id);row.bookmarks.add(id);return {saved:true,duplicate:existed};},
 removeBookmark(context,id,{requestedOwner}={}){const row=owner(context,requestedOwner);validReference(id);row.bookmarks.delete(id);return {saved:false};},
 async listBookmarks(context,{requestedOwner}={}){const row=owner(context,requestedOwner);return Promise.all([...row.bookmarks].map(async id=>{const record=await resolveRecord(id);return record?{id,available:true,record}:{id,available:false};}));},
 async openBookmark(context,id,{requestedOwner}={}){const row=owner(context,requestedOwner);validReference(id);if(!row.bookmarks.has(id))throw Error('Mock access denied');return await resolveRecord(id)||null;},
 follow(context,kind,target,{requestedOwner}={}){const row=owner(context,requestedOwner),key=topicKey(kind,target),existed=row.follows.has(key);row.follows.add(key);return {followed:true,duplicate:existed};},
 unfollow(context,kind,target,{requestedOwner}={}){const row=owner(context,requestedOwner);row.follows.delete(topicKey(kind,target));return {followed:false};},
 listFollows(context,{requestedOwner}={}){return [...owner(context,requestedOwner).follows].flatMap(key=>{const index=key.indexOf(':'),kind=key.slice(0,index),target=key.slice(index+1);return Object.hasOwn(topics,kind)&&topics[kind].includes(target)?[{kind,target}]:[];});},
 preferences(context,{requestedOwner}={}){return {...owner(context,requestedOwner).preferences};},
 updatePreferences(context,changes,{requestedOwner}={}){const row=owner(context,requestedOwner);if(!changes||Object.keys(changes).some(key=>!['compactCards','showResolved'].includes(key)||typeof changes[key]!=='boolean'))throw Error('Invalid mock preferences');Object.assign(row.preferences,changes);return {...row.preferences};}
 };
 const notifications=createMockNotificationExtension({owner,members,resolveRecord,ledgerSnapshot:snapshot?._notificationEvents});
 Object.assign(service,notifications.methods);
 return {service,processMockEvent:notifications.processMockEvent,sessionForSyntheticAccount:account=>sessions.get(account)||null,
 snapshot:()=>({...Object.fromEntries([...members].map(([id,row])=>[id,{bookmarks:[...row.bookmarks],follows:[...row.follows],preferences:{...row.preferences},notificationPreferences:{...row.notificationPreferences},notifications:[...row.notifications.values()].map(value=>({...value}))}])),_notificationEvents:notifications.ledgerSnapshot()})};
}
