/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import {useEffect,useRef,useState} from 'react';
import {SiteHeader} from '../components/Navigation.jsx';
import {Button,SelectInput,TextInput,StatusLabel} from '../components/Primitives.jsx';
import {Card,Pagination} from '../components/Content.jsx';
import {EmptyState,ErrorState,LoadingState,UnavailableState} from '../components/Feedback.jsx';
import {filterOptions,normalizeSearch,searchUrl,safeSearchReturn} from './searchState.js';
import {searchPublic,readSearchExample} from '../mocks/searchAdapter.js';
const links=[{href:'/',label:'Home'},{href:'/notices',label:'Public notices'},{href:'/search',label:'Search'},{href:'/items',label:'Lost & found'},{href:'/saved-interests',label:'Saved interests'},{href:'/notifications',label:'Inbox'}];
function Group({field,label,selected,onChange,disabled=false}){
 return <fieldset disabled={disabled} className="search-choice"><legend>{label}</legend>{filterOptions[field].map(value=><label key={value}><input type="checkbox" name={field} value={value} checked={selected.includes(value)} onChange={()=>onChange(field,selected.includes(value)?selected.filter(v=>v!==value):[...selected,value])}/><span>{value}</span></label>)}</fieldset>;
}
export default function SearchPage(){
 const [query]=useState(window.location.search);
 const initial=normalizeSearch(query);
 const [draft,setDraft]=useState(initial.state),[formErrors,setFormErrors]=useState([]);
 const [filtersOpen,setFiltersOpen]=useState(()=>window.matchMedia('(min-width:701px)').matches);
 const [result,setResult]=useState({kind:'loading'}),[retry,setRetry]=useState(0),[recovering,setRecovering]=useState(false);
 const resultHeading=useRef(null);
 const pathname=window.location.pathname,detail=pathname.startsWith('/search-record/');
 let id;try{id=decodeURIComponent(pathname.slice('/search-record/'.length));}catch{id='invalid';}
 const returnUrl=safeSearchReturn(new URLSearchParams(query).get('returnTo'))||'/search';
 useEffect(()=>{
 const controller=new AbortController();
 if(detail)readSearchExample(id,{signal:controller.signal}).then(record=>setResult(record?{kind:'detail',record}:{kind:'unavailable'})).catch(e=>{if(e.name!=='AbortError')setResult({kind:'error'});});
 else{
 const params=new URLSearchParams(query);if(recovering)params.delete('demo');
 searchPublic(params,{signal:controller.signal}).then(data=>{if(data.kind==='results')window.history.replaceState(null,'',searchUrl(data.state)+window.location.hash);setResult(data);}).catch(e=>{if(e.name!=='AbortError')setResult({kind:'error'});});
 }
 return ()=>controller.abort();
 },[query,retry,recovering,detail,id]);
 useEffect(()=>{
 document.title=(detail?result.record?.title||'Search example':'Search campus information')+' · UIDS fictional preview';
 if(result.kind!=='results'||!/^#result-[a-z0-9-]+$/.test(window.location.hash))return;
 const target=document.getElementById(window.location.hash.slice(1));
 const frame=requestAnimationFrame(()=>{
 (target||resultHeading.current)?.focus();
 try{const saved=JSON.parse(sessionStorage.getItem('uids-d04-return')||'null');if(saved?.url===searchUrl(result.state)&&saved.id===window.location.hash.slice(1))window.scrollTo(0,saved.scroll);}catch{/* Optional scroll restoration. */}
 });return ()=>cancelAnimationFrame(frame);
 },[result,detail]);
 useEffect(()=>{if(formErrors.length)document.getElementById('search-validation')?.focus();},[formErrors]);
 function update(field,value){setDraft(current=>{const next={...current,[field]:value};if(field==='type'&&value.length&&!value.some(t=>t==='lost'||t==='found'))next.status=[];return next;});setFormErrors([]);}
 function submit(e){
 e.preventDefault();const normalized=normalizeSearch(new URLSearchParams(searchUrl({...draft,page:1,demo:'ready'}).split('?')[1]||''));
 if(normalized.errors.length){setFormErrors(normalized.errors);return;}
 window.location.assign(searchUrl(normalized.state));
 }
 function recover(){setResult({kind:'loading'});setRecovering(true);setRetry(v=>v+1);}
 const canonical=result.kind==='results'?searchUrl(result.state):searchUrl(initial.state);
 function recordLink(record){
 const focusId='result-'+record.id,back=canonical+'#'+focusId;
 const href=(record.type==='notice'?'/notices/'+encodeURIComponent(record.reference):'/search-record/'+encodeURIComponent(record.id))+'?returnTo='+encodeURIComponent(back);
 return <Card key={record.id} eyebrow={record.type+' · '+record.category} title={<a id={focusId} href={href} onClick={()=>{try{sessionStorage.setItem('uids-d04-return',JSON.stringify({url:canonical,id:focusId,scroll:window.scrollY}));}catch{/* URL remains usable. */}}}>{record.title}</a>} footer={<><span>{record.department}</span><StatusLabel>Fictional{record.status?' · '+record.status:''}</StatusLabel></>}><p>{record.summary}</p><p className="record-date"><time dateTime={record.date}>{record.date}</time></p></Card>;
 }
 return <div className="public-app search-app"><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader links={links} brandHref="/" subtitle="Campus information · Fictional preview" activeHref="/search"/><main id="main-content" tabIndex="-1">
 <div className="demo-banner public-disclaimer"><p><strong>Fictional search preview.</strong> Public-safe sample notices, items and directory entries only. Frontend matching is not secure authorization.</p><StatusLabel>No live API</StatusLabel></div>
 <div className="public-page-heading"><nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/search">Search</a></nav><p className="eyebrow">FIND YOUR WAY AROUND CAMPUS</p><h1>{detail?'Search record preview':'Search campus information'}</h1><p>{detail?'A minimal fictional display, without claims or management actions.':'Search fictional public information. The URL retains your selections.'}</p></div>
 {detail?<>{result.kind==='loading'?<LoadingState label="Loading sample record…"/>:result.kind==='error'?<ErrorState onRetry={recover}/>:result.kind==='unavailable'?<UnavailableState/>:result.kind==='detail'?<article className="notice-detail"><a className="back-link" href={returnUrl}>← Back to search results</a><StatusLabel>Fictional · {result.record.type}</StatusLabel><h2>{result.record.title}</h2><dl className="notice-metadata">{[['Category',result.record.category],['Department',result.record.department],['Sample date',result.record.date],['Item status',result.record.status||'Not applicable']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{result.record.summary}</p><aside className="detail-note">Fictional public-safe preview only. No report, claim, handover, directory administration or authentication workflow.</aside></article>:null}{result.kind!=='detail'&&<p><a href={returnUrl}>Back to search results</a></p>}</>:
 <div className="search-workspace"><form onSubmit={submit} className="search-form" noValidate>
 <TextInput id="keyword" label="Keyword" hint="Matches every word, ignoring case." value={draft.q} onChange={e=>update('q',e.target.value)} maxLength={120}/>
 <details className="search-filter-panel" open={filtersOpen} onToggle={e=>setFiltersOpen(e.currentTarget.open)}><summary>Filters and sorting</summary><p className="filter-hint">Fields combine with AND. Selections within a group use OR.</p>
 <Group field="type" label="Record type" selected={draft.type} onChange={update}/>
 <Group field="category" label="Category" selected={draft.category} onChange={update}/>
 <Group field="department" label="Department" selected={draft.department} onChange={update}/>
 <div className="search-dates"><TextInput id="from" type="date" label="From date (inclusive)" value={draft.from} onChange={e=>update('from',e.target.value)}/><TextInput id="to" type="date" label="To date (inclusive)" value={draft.to} onChange={e=>update('to',e.target.value)}/></div>
 <p className="filter-hint">Sample date: publication for notices, display date for items/directory.</p>
 <Group field="status" label="Item status" selected={draft.status} onChange={update} disabled={draft.type.length>0&&!draft.type.some(t=>t==='lost'||t==='found')}/><p className="filter-hint">Status matches only items. Selecting only non-item types clears it.</p>
 <SelectInput id="sort" label="Sort results" value={draft.sort} onChange={e=>update('sort',e.target.value)} options={[{value:'newest',label:'Newest first'},{value:'oldest',label:'Oldest first'},{value:'title',label:'Title A–Z'},{value:'relevance',label:'Keyword relevance'}]}/></details>
 <div id="search-validation" tabIndex="-1" role={formErrors.length?'alert':undefined}>{formErrors.map(message=><p className="field-error" key={message}>{message}</p>)}</div>
 <div className="search-form-actions"><Button type="submit">Search</Button><a className="button secondary" href="/search">Clear all</a></div></form>
 <section className="search-results" aria-labelledby="results-heading"><h2 id="results-heading" ref={resultHeading} tabIndex="-1">Search results</h2>
 {result.kind==='loading'?<LoadingState label="Searching fictional public records…"/>:result.kind==='error'?<ErrorState message="The mock search could not complete. Your URL selections are retained." onRetry={recover}/>:result.kind==='invalid'?<div className="search-invalid" role="alert"><h3>Check your search parameters</h3>{result.errors.map(message=><p key={message}>{message}</p>)}<a className="button secondary" href="/search">Clear invalid filters</a></div>:result.kind==='results'?<><p className="search-count" role="status">{result.total} fictional {result.total===1?'result':'results'}{result.total>0?' · Page '+result.page+' of '+result.pages:''}</p>{result.warnings.map(warning=><p className="search-warning" key={warning}>{warning}</p>)}{result.total===0?<EmptyState title="No matching information" message="Try another keyword or clear the filters." action={<a className="button secondary" href="/search">Clear filters</a>}/>:<><div className="search-result-list">{result.records.map(recordLink)}</div><Pagination page={result.page} totalPages={result.pages} onPageChange={page=>window.location.assign(searchUrl({...result.state,page})+'#results-heading')}/></>}</>:null}
 </section></div>}
 {!detail&&<div className="public-preview-help"><details><summary>Preview mock search states</summary><p>Local deterministic examples, not server behavior.</p>{['loading','empty','error'].map(demo=><a key={demo} href={searchUrl({...initial.state,demo})}>{demo}</a>)}<a href={searchUrl({...initial.state,demo:'ready'})}>Reset preview</a></details></div>}
 </main><footer className="site-footer"><div><strong>UIDS · Local search preview</strong><p>Fictional public information · Team review pending</p></div><a href="/">Homepage</a></footer></div>;
}
