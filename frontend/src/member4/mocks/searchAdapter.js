import {readPublicNotices} from './publicNoticeAdapter.js';
import {normalizeSearch} from '../search/searchState.js';
import {currentPublicItem} from './itemAdapter.js';
// Public-safe fictional display models. No drafts, claims, contacts or private records.
const extra=[
{id:'lost-blue-notebook',type:'lost',title:'Blue notebook',summary:'A fictional anonymized lost-item description without owner or claim evidence.',category:'Items',department:'Example Welcome Desk',date:'2026-11-06',status:'open'},
{id:'lost-water-bottle',type:'lost',title:'Reusable water bottle',summary:'A fictional lost bottle for search layout evaluation.',category:'Items',department:'Example Welcome Desk',date:'2026-11-04',status:'resolved'},
{id:'found-study-folder',type:'found',title:'Study folder',summary:'A fictional found folder. No names, contents or private evidence are shown.',category:'Items',department:'Example Welcome Desk',date:'2026-11-05',status:'open'},
{id:'found-pencil-case',type:'found',title:'Green pencil case',summary:'A fictional anonymized found item used for filter examples.',category:'Items',department:'Example Welcome Desk',date:'2026-11-02',status:'resolved'},
{id:'directory-library',type:'directory',title:'Example Library information',summary:'A fictional directory entry for learning and quiet study spaces.',category:'University information',department:'Example Directory',date:'2026-11-06',status:''},
{id:'directory-learning',type:'directory',title:'Example learning support',summary:'A fictional university information record, with no real contact details.',category:'University information',department:'Example Directory',date:'2026-11-01',status:''}
].map(value=>Object.freeze(value));
export async function publicSearchRecords(signal){
 const data=await readPublicNotices({signal});
 return [...data.notices.map(n=>({id:'notice-'+n.reference,reference:n.reference,type:'notice',title:n.title,summary:n.summary,category:n.category,department:n.department,date:n.published,status:''})),...extra.filter(record=>!['lost','found'].includes(record.type)||currentPublicItem(record.id))];
}
function compareText(a,b){return a<b?-1:a>b?1:0;}
export function searchRecords(records,normalized,pageSize=3){
 if(normalized.errors.length)return {kind:'invalid',errors:normalized.errors,state:normalized.state,warnings:normalized.warnings};
 const state=normalized.state;
 const words=state.q.toLowerCase().split(/\s+/).filter(Boolean);
 const selected=records.filter(record=>{
 const text=[record.title,record.summary,record.department].join(' ').toLowerCase();
 return words.every(word=>text.includes(word))&&
 ['category','department','type','status'].every(field=>!state[field].length||state[field].includes(record[field]))&&
 (!state.from||record.date>=state.from)&&(!state.to||record.date<=state.to);
 });
 const score=record=>words.reduce((total,word)=>total+(record.title.toLowerCase().includes(word)?3:0)+(record.summary.toLowerCase().includes(word)?1:0),0);
 selected.sort((a,b)=>{
 const primary=state.sort==='title'?compareText(a.title.toLowerCase(),b.title.toLowerCase()):state.sort==='oldest'?compareText(a.date,b.date):state.sort==='relevance'?score(b)-score(a):compareText(b.date,a.date);
 return primary||compareText(a.id,b.id);
 });
 const total=selected.length,pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(state.page,pages);
 const warnings=[...normalized.warnings];if(page!==state.page)warnings.push('Page adjusted to the available results.');
 return {kind:'results',records:selected.slice((page-1)*pageSize,page*pageSize),total,pages,page,state:{...state,page},warnings};
}
export async function searchPublic(input,{signal}={}){
 const normalized=normalizeSearch(input);
 if(normalized.errors.length)return searchRecords([],normalized);
 if(normalized.state.demo==='loading')await new Promise((resolve,reject)=>{
 const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},30000);
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 });
 if(normalized.state.demo==='error')throw new Error('Local mock search failure');
 const records=normalized.state.demo==='empty'?[]:await publicSearchRecords(signal);
 return searchRecords(records,normalized);
}
export async function readSearchExample(id,{signal}={}){
 const records=await publicSearchRecords(signal);
 return records.find(record=>record.id===id&&record.type!=='notice')??null;
}
