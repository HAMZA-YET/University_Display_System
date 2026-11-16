/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import {useEffect,useRef,useState} from 'react';
import {SiteHeader} from '../components/Navigation.jsx';
import {Button,SelectInput,StatusLabel} from '../components/Primitives.jsx';
import {Card} from '../components/Content.jsx';
import {LoadingState,EmptyState,ErrorState,UnavailableState} from '../components/Feedback.jsx';
import {readItems,safeItemReturn,setSyntheticVisibility,restoreSyntheticItems} from '../mocks/itemAdapter.js';
import {safeSearchReturn,filterOptions} from '../search/searchState.js';
import {chooseSyntheticAccount,selectedSyntheticAccount,interests,storageWarning} from '../mocks/memberAdapter.js';
import PublicMedia from './PublicMedia.jsx';
import BookmarkControl from './BookmarkControl.jsx';
import {integrationTargets} from '../mocks/integrationTargets.js';
import NotificationPreferences from '../notifications/NotificationPreferences.jsx';
import {safeInboxReturn} from '../notifications/navigation.js';
const links=[{href:'/',label:'Home'},{href:'/notices',label:'Notices'},{href:'/search',label:'Search'},{href:'/items',label:'Lost & found'},{href:'/saved-interests',label:'Saved interests'},{href:'/notifications',label:'Inbox'}];
const scenarios=['ready','loading','empty','error','unavailable'];
function IntegrationLinks(){return <aside className="integration-links"><h3>Team integrations</h3>{['report','claim','account','directory'].map(key=><div key={key}><Button variant="secondary" disabled>{integrationTargets[key].label}</Button><small>{integrationTargets[key].owner}'s destination is awaiting confirmation.</small></div>)}</aside>;}
function ItemContent({account}){
 const pathname=window.location.pathname,params=new URLSearchParams(window.location.search);
 const match=pathname.match(/^\/(?:items|search-record)\/([^/]+)\/?$/);
 let id;try{id=match?decodeURIComponent(match[1]):undefined;}catch{id='invalid';}
 const type=params.get('type')||'';
 const [scenario,setScenario]=useState(scenarios.includes(params.get('demo'))?params.get('demo'):'ready');
 const [result,setResult]=useState({kind:'loading'}),[revision,setRevision]=useState(0),[labMessage,setLabMessage]=useState('');
 const heading=useRef(null);
 const returnUrl=safeInboxReturn(params.get('inboxReturn'))||safeSearchReturn(params.get('returnTo'))||safeItemReturn(params.get('returnTo'))||'/items';
 useEffect(()=>{
 const controller=new AbortController();
 readItems({id,type,scenario,signal:controller.signal}).then(value=>setResult(value)).catch(e=>{if(e.name!=='AbortError')setResult({kind:'error'});});
 return ()=>controller.abort();
 },[id,type,scenario,revision]);
 useEffect(()=>{
 document.title=(result.item?.title||'Lost and found')+' · UIDS fictional preview';
 if(result.kind==='list'&&/^#item-[a-z0-9-]+$/.test(window.location.hash))requestAnimationFrame(()=>{(document.getElementById(window.location.hash.slice(1))||heading.current)?.focus();});
 },[result]);
 function recover(){setResult({kind:'loading'});setScenario('ready');setRevision(value=>value+1);}
 function restore(){try{restoreSyntheticItems();recover();setLabMessage('Synthetic public items restored.');}catch{setLabMessage('Mock storage is unavailable.');}}
 const preferences=account==='visitor'?{compactCards:false,showResolved:true}:interests.preferences();
 const visibleItems=(result.items||[]).filter(item=>preferences.showResolved||item.status!=='resolved');
 const backLabel=returnUrl.startsWith('/notifications')?'← Back to notification inbox':returnUrl.startsWith('/search')?'← Back to search results':'← Back to items';
 return <><div className="public-page-heading"><p className="eyebrow">FICTIONAL CAMPUS ITEM DISCOVERY</p><h1 ref={heading} tabIndex="-1">{id?'Item details':'Lost & found'}</h1><p>Public-safe sample items. No reporting, claim verification or handover decisions.</p></div>
 {!id&&<form className="item-filter" action="/items" method="get"><SelectInput id="item-type" label="Item type" name="type" defaultValue={type} options={[{value:'',label:'Lost and found'},{value:'lost',label:'Lost items'},{value:'found',label:'Found items'}]}/><Button type="submit">Apply item filter</Button><a className="button secondary" href="/items">Clear filter</a></form>}
 {result.kind==='loading'?<LoadingState label="Loading public item examples…"/>:result.kind==='error'?<ErrorState message="The mock item catalogue could not load." onRetry={recover}/>:result.kind==='invalid'?<EmptyState title="Invalid item filter" message="Choose lost or found, or reset the filter." action={<a className="button secondary" href="/items">Reset filter</a>}/>:result.kind==='detail'&&!result.item?<><UnavailableState/><a className="button secondary" href={returnUrl}>{backLabel}</a></>:result.kind==='detail'?<article className="notice-detail item-detail"><a className="back-link" href={returnUrl}>{backLabel}</a><div className="detail-topline"><StatusLabel tone="green">{result.item.type} · {result.item.status} · fictional</StatusLabel></div><h2>{result.item.title}</h2><div className="item-detail-grid"><PublicMedia key={result.item.mediaId} mediaId={result.item.mediaId}/><div><p>{result.item.description}</p><dl className="item-metadata">{[['Item type',result.item.type],['Status',result.item.status],['Sample record date',result.item.date],['Last sample update',result.item.updated],['Public location',result.item.location||'Location not supplied for public display']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></div><aside className="detail-note"><strong>Safe office instructions · fictional example</strong><p>Use the university's verified official directory to contact the designated lost/found office. Do not publish ownership evidence here. No real office contact, address or hours are provided by this demo.</p></aside><BookmarkControl key={account+result.item.id} recordId={result.item.id} account={account}/><IntegrationLinks/><details className="mock-lab"><summary>Mock-only visibility test</summary><p>This changes only the synthetic catalogue on this browser. It does not publish, withdraw or decide ownership of a real case.</p><Button variant="secondary" onClick={()=>{try{setSyntheticVisibility(result.item.id,false);recover();}catch{setLabMessage('Mock storage is unavailable.');}}}>Make this sample unavailable</Button></details></article>:result.kind==='list'&&visibleItems.length===0?<EmptyState title="No public item examples" message="No samples match this view. Resolved samples may be hidden by your personal display preference." action={<Button onClick={recover} variant="secondary">Retry sample list</Button>}/>:result.kind==='list'?<><p className="results-summary" role="status">{visibleItems.length} fictional public items</p><div className={'d05-item-grid '+(preferences.compactCards?'compact':'')}>{visibleItems.map(item=><Card key={item.id} eyebrow={item.type+' · '+item.status} title={<a id={'item-'+item.id} href={'/items/'+encodeURIComponent(item.id)+'?returnTo='+encodeURIComponent('/items'+(type?'?type='+type:'')+'#item-'+item.id)}>{item.title}</a>} footer={<StatusLabel>Fictional · {item.date}</StatusLabel>}><PublicMedia key={item.mediaId} mediaId={item.mediaId}/><p>{item.description}</p></Card>)}</div></>:null}
 <details className="mock-lab"><summary>Preview item states and reset samples</summary><p>Local fixtures only. Reset restores mock visibility overrides, not real records.</p>{['loading','empty','error','unavailable'].map(demo=><a key={demo} href={pathname+'?'+new URLSearchParams({...(type?{type}:{}),demo})}>{demo}</a>)}<Button variant="secondary" onClick={restore}>Restore synthetic public items</Button><p role="status">{labMessage}</p></details></>;
}
function SavedContent({account}){
 const params=new URLSearchParams(window.location.search);
 const [result,setResult]=useState({kind:'loading'}),[revision,setRevision]=useState(0),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const [category,setCategory]=useState(filterOptions.category[0]),[department,setDepartment]=useState(filterOptions.department[0]);
 const [preferences,setPreferences]=useState(()=>account==='visitor'?{compactCards:false,showResolved:true}:interests.preferences());
 const [scenario,setScenario]=useState(scenarios.includes(params.get('demo'))?params.get('demo'):'ready');
 useEffect(()=>{
 let active=true;let timer;
 if(account!=='visitor'){
 timer=setTimeout(()=>{if(scenario==='error'){if(active)setResult({kind:'error'});return;}
 interests.list().then(rows=>{if(active)setResult({kind:'ready',rows:scenario==='empty'?[]:rows,follows:interests.follows()});}).catch(()=>{if(active)setResult({kind:'error'});});
 },scenario==='loading'?30000:120);
 }
 return ()=>{active=false;clearTimeout(timer);};
 },[account,revision,scenario]);
 async function action(fn,success){
 setPending(true);setMessage('');
 try{await fn();setMessage(storageWarning()||success);setRevision(value=>value+1);}catch{setMessage('The mock operation could not complete. Please retry.');}
 finally{setPending(false);}
 }
 function recover(){setResult({kind:'loading'});setScenario('ready');setRevision(value=>value+1);}
 async function open(id){
 setPending(true);
 try{const record=await interests.open(id);if(record)window.location.assign(record.href);else{setMessage('This saved information is unavailable.');setRevision(value=>value+1);}}catch{setMessage('The saved record cannot be opened for this synthetic context.');}
 finally{setPending(false);}
 }
 return <><div className="public-page-heading"><p className="eyebrow">SYNTHETIC MEMBER TOOLS · MOCK ONLY</p><h1>Saved interests</h1><p>Bookmarks, follows and display preferences for fictional Alpha/Beta accounts.</p></div>
 {account==='visitor'?<EmptyState title="Choose a synthetic account" message="Use the selector above to test local member tools. This is not a sign-in or authentication system."/>:result.kind==='loading'?<LoadingState label="Loading synthetic saved interests…"/>:result.kind==='error'?<ErrorState message="The local mock member tools could not load." onRetry={recover}/>:result.kind==='ready'?<>
 <p className="mock-label">Synthetic {account==='alpha'?'Alpha':'Beta'} · No production identity or security claim</p><p role="status" className="saved-message">{message}</p>
 <section className="section saved-bookmarks"><div className="section-heading"><div><h2>My mock bookmarks</h2><p>Current visibility is checked again when listing and opening.</p></div><a href="/items">Browse sample items →</a></div>{result.rows.length===0?<EmptyState title="No saved examples" message="Open an eligible sample item or notice to save it."/>:<div className="saved-grid">{result.rows.map(row=><Card key={row.id} title={row.available?row.record.title:'Saved information unavailable'} eyebrow={row.available?'Fictional · '+row.record.kind:'No source details shown'}><div className="saved-actions">{row.available&&<Button pending={pending} onClick={()=>open(row.id)}>Open saved record</Button>}<Button variant="secondary" disabled={pending} onClick={()=>action(()=>interests.remove(row.id),'Bookmark removed.')}>{row.available?'Remove '+row.record.title:'Remove unavailable bookmark'}</Button></div></Card>)}</div>}</section>
 <section className="section"><h2>Follow topics</h2><p>Follows are synthetic interests, not permission grants. They feed the D06 mock inbox; no real notifications are sent.</p><div className="follow-grid"><div><SelectInput id="follow-category" label="Category to follow" value={category} onChange={e=>setCategory(e.target.value)} options={filterOptions.category.map(value=>({value,label:value}))}/><Button pending={pending} onClick={()=>action(()=>interests.follow('category',category),'Category followed.')}>Follow category</Button></div><div><SelectInput id="follow-department" label="Department to follow" value={department} onChange={e=>setDepartment(e.target.value)} options={filterOptions.department.map(value=>({value,label:value}))}/><Button pending={pending} onClick={()=>action(()=>interests.follow('department',department),'Department followed.')}>Follow department</Button></div></div><ul className="follow-list">{result.follows.map(row=><li key={row.kind+row.target}><span>{row.kind}: {row.target}</span><Button variant="secondary" disabled={pending} onClick={()=>action(()=>interests.unfollow(row.kind,row.target),'Topic unfollowed.')}>Unfollow {row.target}</Button></li>)}</ul>{result.follows.length===0&&<p>No topics followed.</p>}</section>
 <section className="section"><h2>Personal display preferences</h2><form className="preference-form" onSubmit={e=>{e.preventDefault();action(()=>interests.updatePreferences(preferences),'Display preferences saved.');}}><label><input type="checkbox" checked={preferences.compactCards} onChange={e=>setPreferences({...preferences,compactCards:e.target.checked})}/> Compact item cards</label><label><input type="checkbox" checked={preferences.showResolved} onChange={e=>setPreferences({...preferences,showResolved:e.target.checked})}/> Show resolved item examples</label><Button type="submit" pending={pending}>Save preferences</Button></form><p>Preferences affect only the item browsing presentation for this synthetic account.</p></section><NotificationPreferences/><IntegrationLinks/></>:null}
 <details className="mock-lab"><summary>Preview saved-interest states</summary>{['loading','empty','error'].map(demo=><a key={demo} href={'/saved-interests?demo='+demo}>{demo}</a>)}<a href="/saved-interests">Reset preview state</a></details></>;
}
export default function ItemsApp(){
 const [account,setAccount]=useState(selectedSyntheticAccount);
 useEffect(()=>{const revalidate=event=>{if(event.persisted)window.location.reload();};window.addEventListener('pageshow',revalidate);return ()=>window.removeEventListener('pageshow',revalidate);},[]);
 const saved=window.location.pathname.startsWith('/saved-interests');
 return <div className="public-app d05-app"><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader links={links} brandHref="/" subtitle="Item discovery · Fictional preview" activeHref={saved?'/saved-interests':'/items'}/><main id="main-content" tabIndex="-1"><div className="demo-banner public-disclaimer"><p><strong>D05 mock-only preview.</strong> All records/accounts are fictional; media is representative or illustrative. No production authentication, protected routes or real claims are enabled.</p></div><div className="synthetic-selector"><SelectInput id="synthetic-account" label="Synthetic account (mock only)" value={account} onChange={e=>{chooseSyntheticAccount(e.target.value);setAccount(e.target.value);}} options={[{value:'visitor',label:'Public visitor'},{value:'alpha',label:'Synthetic Alpha'},{value:'beta',label:'Synthetic Beta'}]}/><p>This selector is a test harness, not a trusted login. Synthetic interests are stored on this browser only.</p></div><div key={account}>{saved?<SavedContent account={account}/>:<ItemContent account={account}/>}</div></main><footer className="site-footer"><strong>UIDS · D05 local demonstration</strong><a href="/">Homepage</a><a href="/search">Unified search</a></footer></div>;
}
