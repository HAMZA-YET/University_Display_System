/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import {useEffect,useRef,useState} from 'react';
import {SiteHeader} from '../components/Navigation.jsx';
import {Button,StatusLabel} from '../components/Primitives.jsx';
import {Card,Pagination} from '../components/Content.jsx';
import {EmptyState,ErrorState,LoadingState,UnavailableState,RenderErrorBoundary} from '../components/Feedback.jsx';
import {readPublicNotices} from '../mocks/publicNoticeAdapter.js';
import {safeSearchReturn} from '../search/searchState.js';
import BookmarkControl from '../items/BookmarkControl.jsx';
import {safeInboxReturn} from '../notifications/navigation.js';
const navigation=[{href:'/',label:'Home'},{href:'/notices',label:'Public notices'},{href:'/search',label:'Search'},{href:'/items',label:'Lost & found'},{href:'/saved-interests',label:'Saved interests'},{href:'/notifications',label:'Inbox'}];
const dateLabel=date=>new Intl.DateTimeFormat('en',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Seoul'}).format(new Date(date+'T00:00:00+09:00'));
const noticeHref=record=>'/notices/'+encodeURIComponent(record.reference);
function NoticeCard({notice}){return <Card eyebrow={notice.category} title={<a href={noticeHref(notice)}>{notice.title}</a>} footer={<><span>{notice.department}</span><StatusLabel>Fictional</StatusLabel></>}><p>{notice.summary}</p><p className="record-date"><time dateTime={notice.published}>{dateLabel(notice.published)}</time></p></Card>;}
function PublicFooter(){return <footer className="site-footer"><div><strong>UIDS · Campus information</strong><p>Kyungdong University Global Campus · Student project</p></div><p>Fictional frontend preview only.<br/>Consult official university channels for real information.</p></footer>;}
export default function PublicNotices(){
 const pathname=window.location.pathname;
 const match=pathname.match(/^\/notices\/([^/]+)\/?$/);
 let reference;try{reference=match?decodeURIComponent(match[1]):undefined;}catch{reference='invalid';}
 const route=pathname==='/'?'home':/^\/notices\/?$/.test(pathname)?'list':match?'detail':'missing';
 const params=new URLSearchParams(window.location.search);
 const searchReturn=safeSearchReturn(params.get('returnTo'));
 const inboxReturn=safeInboxReturn(params.get('inboxReturn'));
 const allowed=['ready','empty','loading','error','unavailable'];
 const [scenario,setScenario]=useState(allowed.includes(params.get('demo'))?params.get('demo'):'ready');
 const requestedPage=Number(params.get('page'));
 const [page,setPage]=useState(Number.isInteger(requestedPage)&&requestedPage>0?requestedPage:1);
 const [result,setResult]=useState({kind:'loading'}),[attempt,setAttempt]=useState(0);
 const mainRef=useRef(null);
 useEffect(()=>{
  const controller=new AbortController();
  readPublicNotices({reference,scenario,signal:controller.signal}).then(value=>setResult(value)).catch(error=>{if(error.name!=='AbortError')setResult({kind:'error'});});
  return ()=>controller.abort();
 },[reference,scenario,attempt]);
 useEffect(()=>{document.title=(result.notice?.title||(route==='home'?'Campus information':route==='list'?'Public notices':'Notice unavailable'))+' · UIDS fictional preview';},[result,route]);
 function recover(){setResult({kind:'loading'});setScenario('ready');setAttempt(value=>value+1);}
 const notices=result.notices||[];
 const totalPages=Math.max(1,Math.ceil(notices.length/3));
 const currentPage=Math.min(page,totalPages);
 function changePage(next){setPage(next);const url=new URL(window.location.href);url.searchParams.set('page',next);window.history.replaceState(null,'',url);mainRef.current?.focus();}
 const unavailable=route==='missing'||result.kind==='unavailable';
 return <div className="public-app"><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader links={navigation} brandHref="/" subtitle="Campus information · Fictional preview" activeHref={route==='home'?'/':'/notices'}/><main id="main-content" tabIndex="-1" ref={mainRef}>
 <div className="demo-banner public-disclaimer"><span className="demo-icon" aria-hidden="true">i</span><p><strong>Fictional campus preview.</strong> All notices, dates and departments are sample information, not official university announcements.</p><StatusLabel>No live API</StatusLabel></div>
 {route==='home'?<section className="public-hero"><div><p className="eyebrow">KYUNGDONG UNIVERSITY GLOBAL CAMPUS · STUDENT PROJECT</p><h1>Your campus.<br/><em>Stay connected.</em></h1><p>A clear place for campus updates, useful information and the moments that bring a university together.</p><a className="button primary" href="/notices">Browse public notices <span aria-hidden="true">↗</span></a></div><aside><span className="public-monogram" aria-hidden="true">U</span><p className="eyebrow">UNIVERSITY INFORMATION DISPLAY SYSTEM</p><h2>Information for<br/>everyday campus life.</h2><p>D03 · Local fictional demonstration</p></aside></section>:<div className="public-page-heading"><nav aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true"> / </span>{route==='list'?<span>Public notices</span>:<a href="/notices">Public notices</a>}</nav><p className="eyebrow">CAMPUS INFORMATION · FICTIONAL PREVIEW</p><h1>{route==='list'?'Public notices':route==='missing'?'Page unavailable':'Notice details'}</h1><p>{route==='list'?'The latest sample updates from across campus.':'Public notice browsing · Member 4 frontend demonstration'}</p></div>}
 <RenderErrorBoundary>
 {result.kind==='loading'&&route!=='missing'?<section className="section" aria-busy="true"><LoadingState label="Loading public notice examples…"/></section>:
 result.kind==='error'&&route!=='missing'?<section className="section"><ErrorState message="The local sample could not be loaded. No university service was contacted." onRetry={recover}/></section>:
 unavailable?<section className="section"><UnavailableState/><div className="public-return"><a className="button secondary" href={inboxReturn||searchReturn||"/notices"}>{inboxReturn?"Back to notification inbox":searchReturn?"Back to search results":"Back to public notices"}</a></div></section>:
 result.kind==='detail'?<article className="notice-detail"><a className="back-link" href={inboxReturn||searchReturn||"/notices"}>{inboxReturn?"← Back to notification inbox":searchReturn?"← Back to search results":"← Back to public notices"}</a><div className="detail-topline"><StatusLabel tone="green">{result.notice.status}</StatusLabel><span>Sample record</span></div><h2>{result.notice.title}</h2><dl className="notice-metadata"><div><dt>Category</dt><dd>{result.notice.category}</dd></div><div><dt>Department</dt><dd>{result.notice.department}</dd></div><div><dt>Published</dt><dd><time dateTime={result.notice.published}>{dateLabel(result.notice.published)}</time></dd></div><div><dt>Status</dt><dd>{result.notice.status}</dd></div></dl><div className="notice-body">{result.notice.content.map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div><BookmarkControl recordId={'notice-'+result.notice.reference}/><aside className="detail-note">Fictional sample content. This page does not establish university policies, dates or arrangements.</aside></article>:
 result.kind==='list'&&notices.length===0?<section className="section"><EmptyState title="No public notice examples" message="The mock adapter returned an empty public collection." action={<Button onClick={recover} variant="secondary">Restore sample notices</Button>}/></section>:
 result.kind==='list'?<>
 {route==='home'&&<section className="section"><div className="section-heading"><div><p className="eyebrow">AT A GLANCE</p><h2>Important notices</h2><p>Highlighted fictional records, curated for this demonstration.</p></div><StatusLabel>Sample highlights</StatusLabel></div><div className="important-grid">{notices.filter(n=>result.important.includes(n.reference)).map(n=><NoticeCard key={n.reference} notice={n}/>)}</div></section>}
 <section className="section"><div className="section-heading"><div><p className="eyebrow">{route==='home'?'AROUND CAMPUS':'PUBLIC COLLECTION'}</p><h2>{route==='home'?'Latest announcements':'Latest sample notices'}</h2><p>{notices.length} fictional public notices · newest sample dates first</p></div>{route==='home'&&<a className="text-link" href="/notices">View all notices →</a>}</div><div className="card-grid">{(route==='home'?notices.slice(0,3):notices.slice((currentPage-1)*3,currentPage*3)).map(n=><NoticeCard key={n.reference} notice={n}/>)}</div>{route==='list'&&<Pagination page={currentPage} totalPages={totalPages} onPageChange={changePage}/>}</section></>:null}
 </RenderErrorBoundary>
 <div className="public-preview-help"><details><summary>Preview loading and recovery states</summary><p>Local demonstration links only. No server requests or publication rules are simulated.</p><div>{['loading','empty','error','unavailable'].map(value=><a key={value} href={pathname+'?demo='+value}>{value}</a>)}<a href={pathname}>Reset preview</a></div></details></div>
 </main><PublicFooter/></div>;
}
