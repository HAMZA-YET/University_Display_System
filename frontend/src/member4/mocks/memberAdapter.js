import {createSyntheticInterestsEnvironment,productionProtectedRoutesEnabled} from '../../../../backend/member4/mock/savedInterestsService.mjs';
import {currentPublicItem} from './itemAdapter.js';
import {readPublicNotices} from './publicNoticeAdapter.js';
import {filterOptions} from '../search/searchState.js';
const storageKey='uids-d05-synthetic-interests',identityKey='uids-d05-synthetic-account';
function readSnapshot(){try{return JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{return {};}}
export async function resolveSavedRecord(id){
 if(id.startsWith('notice-')){const data=await readPublicNotices({reference:id.slice(7)});return data.notice?{id,title:data.notice.title,href:'/notices/'+encodeURIComponent(data.notice.reference),kind:'notice',category:data.notice.category,department:data.notice.department,summary:data.notice.summary}:null;}
 const item=currentPublicItem(id);return item?{id,title:item.title,href:'/items/'+encodeURIComponent(item.id),kind:item.type,category:'Items',department:'Example Welcome Desk',summary:item.description}:null;
}
const environment=createSyntheticInterestsEnvironment({resolveRecord:resolveSavedRecord,topics:{category:filterOptions.category,department:filterOptions.department},snapshot:readSnapshot()});
export const protectedRoutesEnabled=productionProtectedRoutesEnabled;
let volatileAccount;
export function selectedSyntheticAccount(){if(volatileAccount)return volatileAccount;try{const account=sessionStorage.getItem(identityKey);return ['alpha','beta'].includes(account)?account:'visitor';}catch{return 'visitor';}}
export function chooseSyntheticAccount(account){if(!['visitor','alpha','beta'].includes(account))throw Error('Invalid synthetic account');volatileAccount=account;try{sessionStorage.setItem(identityKey,account);}catch{/* Selection still works for the current page. */}}
function context(){return environment.sessionForSyntheticAccount(selectedSyntheticAccount());}
let warning='';
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(environment.snapshot()));warning='';}catch{warning='Mock storage is unavailable. Changes last only for this page.';}}
export function storageWarning(){return warning;}
export const interests={
 async save(id){const result=await environment.service.saveBookmark(context(),id);persist();return result;},
 async remove(id){const result=environment.service.removeBookmark(context(),id);persist();return result;},
 list:()=>environment.service.listBookmarks(context()),
 open:id=>environment.service.openBookmark(context(),id),
 async follow(kind,target){const result=environment.service.follow(context(),kind,target);persist();return result;},
 async unfollow(kind,target){const result=environment.service.unfollow(context(),kind,target);persist();return result;},
 follows:()=>environment.service.listFollows(context()),
 preferences:()=>environment.service.preferences(context()),
 async updatePreferences(changes){const result=environment.service.updatePreferences(context(),changes);persist();return result;}
};

// D06 uses this same environment, identity selector and snapshot; no second store.
export const notificationTools={
 async fetch(){const rows=await environment.service.listNotifications(context());return {rows,unread:rows.filter(row=>row.available&&!row.read).length};},
 count:()=>environment.service.unreadNotificationCount(context()),
 async setRead(id,read){const result=environment.service.setNotificationRead(context(),id,read);persist();return result;},
 async markAllRead(){const result=await environment.service.markAllNotificationsRead(context());persist();return result;},
 open:id=>environment.service.openNotification(context(),id),
 preferences:()=>environment.service.notificationPreferences(context()),
 async updatePreferences(changes){const result=environment.service.updateNotificationPreferences(context(),changes);persist();return result;},
 async processEvents(events){let delivered=0,duplicates=0,ineligible=0;for(const event of events){const result=await environment.processMockEvent(event);delivered+=result.delivered;duplicates+=Number(result.duplicate);ineligible+=Number(!result.eligible);}persist();return {delivered,duplicates,ineligible};}
};
