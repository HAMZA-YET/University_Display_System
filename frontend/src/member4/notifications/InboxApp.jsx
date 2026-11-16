/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import {useEffect,useRef,useState} from 'react';
import {SiteHeader} from '../components/Navigation.jsx';
import {Button,SelectInput,StatusLabel} from '../components/Primitives.jsx';
import {LoadingState,EmptyState,ErrorState} from '../components/Feedback.jsx';
import {chooseSyntheticAccount,selectedSyntheticAccount,interests,storageWarning} from '../mocks/memberAdapter.js';
import {setSyntheticVisibility,restoreSyntheticItems} from '../mocks/itemAdapter.js';
import {readInbox,notificationTools} from '../mocks/notificationAdapter.js';
import {mockEvents} from '../mocks/events.js';
const links=[{href:'/',label:'Home'},{href:'/notices',label:'Notices'},{href:'/search',label:'Search'},{href:'/items',label:'Lost & found'},{href:'/saved-interests',label:'Saved interests'},{href:'/notifications',label:'Inbox'}];
const timestamp=value=>new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(value))+' KST';
function Inbox({account}){
 const params=new URLSearchParams(window.location.search),view=params.get('view')==='unread'?'unread':'all';
 const [scenario,setScenario]=useState(['loading','empty','error'].includes(params.get('demo'))?params.get('demo'):'ready');
 const [result,setResult]=useState({kind:'loading'}),[revision,setRevision]=useState(0),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 const active=useRef(true),listHeading=useRef(null);
 useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
 useEffect(()=>{
 const controller=new AbortController();
 if(account!=='visitor')readInbox({scenario,signal:controller.signal}).then(data=>setResult({kind:'ready',...data})).catch(e=>{if(e.name!=='AbortError')setResult({kind:'error'});});
 return ()=>controller.abort();
 },[account,scenario,revision]);
 useEffect(()=>{
 if(result.kind!=='ready'||!/^#notification-[a-z0-9-]+$/.test(window.location.hash))return;
 const frame=requestAnimationFrame(()=>{(document.getElementById(window.location.hash.slice(1))||listHeading.current)?.focus();});
 return ()=>cancelAnimationFrame(frame);
 },[result]);
 function sameActor(){return active.current&&account===selectedSyntheticAccount();}
 async function action(fn,success){
 setPending(true);setMessage('');setFailed(false);
 try{const response=await fn();const data=await notificationTools.fetch();if(sameActor()){setResult({kind:'ready',...data});setMessage(storageWarning()||(typeof success==='function'?success(response):success));requestAnimationFrame(()=>listHeading.current?.focus());}}
 catch{if(sameActor()){setFailed(true);setMessage('The mock operation could not complete. Try again.');}}
 finally{if(sameActor())setPending(false);}
 }
 async function open(row){
 setPending(true);setMessage('');setFailed(false);
 try{
 const record=await notificationTools.open(row.id);
 if(!sameActor())return;
 if(!record){const data=await notificationTools.fetch();if(sameActor()){setResult({kind:'ready',...data});setMessage('This information is unavailable. No previous details were opened.');}return;}
 const returnTo='/notifications'+(view==='unread'?'?view=unread':'')+'#notification-'+row.id;
 window.location.assign(record.href+'?inboxReturn='+encodeURIComponent(returnTo));
 }catch{if(sameActor()){setFailed(true);setMessage('This update cannot be opened for the current synthetic context.');}}
 finally{if(sameActor())setPending(false);}
 }
 function recover(){setResult({kind:'loading'});setScenario('ready');setRevision(value=>value+1);}
 const rows=result.rows?.filter(row=>view!=='unread'||row.available&&!row.read)||[];
 return <><div className="public-page-heading"><p className="eyebrow">PERSONAL UPDATES · FICTIONAL MOCK INBOX</p><h1>Notification inbox</h1><p>Updates from your synthetic follows. Every source is checked again before display and opening.</p></div>
 {account==='visitor'?<EmptyState title="Choose a synthetic account" message="Use the test selector above. This is not a real login or trusted member session."/>:result.kind==='loading'?<LoadingState label="Loading synthetic notifications…"/>:result.kind==='error'?<ErrorState message="The local mock inbox could not load. Your follows and preferences are retained." onRetry={recover}/>:result.kind==='ready'?<>
 <div className="inbox-toolbar"><div><h2 ref={listHeading} tabIndex="-1" id="inbox-heading">Your notifications</h2><p className="inbox-count" role="status">{result.unread} unread {result.unread===1?'notification':'notifications'}</p></div><SelectInput id="inbox-view" label="Show notifications" value={view} onChange={e=>window.location.assign('/notifications'+(e.target.value==='unread'?'?view=unread':''))} options={[{value:'all',label:'All updates'},{value:'unread',label:'Unread updates'}]}/><Button disabled={pending||result.unread===0} onClick={()=>action(()=>notificationTools.markAllRead(),'All currently available updates marked as read.')}>Mark all as read</Button></div>
 <p className="inbox-feedback" role={failed?'alert':'status'}>{message}</p>
 {rows.length===0?<EmptyState title={view==='unread'?'No unread updates':'Your inbox is empty'} message="Follow categories or departments in Saved interests, then use the fictional-event preview below." action={<a className="button secondary" href="/saved-interests">Manage follows and preferences</a>}/>:<ul className="notification-list">{rows.map(row=><li key={row.id}><article id={'notification-'+row.id} tabIndex="-1" className={'notification-entry '+(row.available&&!row.read?'unread':'')} aria-labelledby={'title-'+row.id}><div className="notification-topline"><StatusLabel tone={row.available&&!row.read?'green':'neutral'}>{row.available?row.read?'Read':'Unread':'Unavailable source'}</StatusLabel><time dateTime={row.occurredAt}>{timestamp(row.occurredAt)}</time></div><h3 id={'title-'+row.id}>{row.available?row.title:'Information unavailable'}</h3><p>{row.available?row.summary:'This source cannot currently be displayed. No prior title, preview or destination is shown.'}</p>{row.available&&<div className="notification-actions"><Button disabled={pending} onClick={()=>open(row)}>Open update</Button><Button variant="secondary" disabled={pending} onClick={()=>action(()=>notificationTools.setRead(row.id,!row.read),row.read?'Update marked as unread.':'Update marked as read.')}>{row.read?'Mark as unread':'Mark as read'}</Button></div>}</article></li>)}</ul>}
 <details className="mock-lab event-lab"><summary>Fictional event processing and visibility preview</summary><p>Mock harness only. These controls do not emit trusted B/C events, publish records or authenticate recipients.</p><div><Button disabled={pending} variant="secondary" onClick={()=>action(async()=>{await interests.follow('category','Items');await interests.follow('department','Example Library');},'Sample interests added through the existing follow service.')}>Prepare sample interests</Button><Button disabled={pending} variant="secondary" onClick={()=>action(()=>notificationTools.processEvents(mockEvents),value=>'Processed fictional events: '+value.delivered+' deliveries; '+value.duplicates+' duplicate events skipped.')}>Process fictional events</Button><Button disabled={pending} variant="secondary" onClick={()=>action(()=>notificationTools.processEvents([{id:'c-demo-004',sourceId:'lost-blue-notebook',occurredAt:'2026-11-07T04:00:00Z'}]),value=>'Processed new fictional event: '+value.delivered+' deliveries; '+value.duplicates+' duplicate events skipped.')}>Process new fictional item event</Button></div><div><Button disabled={pending} variant="secondary" onClick={()=>action(()=>setSyntheticVisibility('lost-blue-notebook',false),'Notebook sample is unavailable; the inbox was rechecked.')}>Hide notebook source in mock</Button><Button disabled={pending} variant="secondary" onClick={()=>action(()=>restoreSyntheticItems(),'Synthetic item visibility restored.')}>Restore synthetic item sources</Button></div><p><a href="/saved-interests">Edit the shared follows and notification preferences</a></p></details>
 </>:null}
 <details className="mock-lab"><summary>Preview inbox loading and failures</summary>{['loading','empty','error'].map(demo=><a key={demo} href={'/notifications?'+new URLSearchParams({...(view==='unread'?{view}:{}),demo})}>{demo}</a>)}<a href="/notifications">Reset preview</a></details></>;
}
export default function InboxApp(){
 const [account,setAccount]=useState(selectedSyntheticAccount);
 useEffect(()=>{document.title='Notification inbox · UIDS fictional preview';const refresh=e=>{if(e.persisted)window.location.reload();};const storageRefresh=e=>{if(['uids-d05-synthetic-visibility','uids-d05-synthetic-interests'].includes(e.key))window.location.reload();};window.addEventListener('pageshow',refresh);window.addEventListener('storage',storageRefresh);return ()=>{window.removeEventListener('pageshow',refresh);window.removeEventListener('storage',storageRefresh);};},[]);
 return <div className="public-app d05-app d06-app"><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader links={links} brandHref="/" subtitle="Notification inbox · Fictional preview" activeHref="/notifications"/><main id="main-content" tabIndex="-1"><div className="demo-banner public-disclaimer"><p><strong>D06 mock-only preview.</strong> Synthetic accounts/events only. Production authentication, event authenticity and protected HTTP routes remain unavailable or disabled.</p></div><div className="synthetic-selector"><SelectInput id="synthetic-account" label="Synthetic account (mock only)" value={account} onChange={e=>{chooseSyntheticAccount(e.target.value);setAccount(e.target.value);}} options={[{value:'visitor',label:'Public visitor'},{value:'alpha',label:'Synthetic Alpha'},{value:'beta',label:'Synthetic Beta'}]}/><p>Reuses the D05 identity test selector, follows and preferences snapshot. It does not establish real member identity.</p></div><Inbox key={account} account={account}/></main><footer className="site-footer"><strong>UIDS · D06 local mock</strong><a href="/saved-interests">Follows and preferences</a><a href="/">Homepage</a></footer></div>;
}
