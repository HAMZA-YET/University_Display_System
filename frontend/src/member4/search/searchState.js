// Local URL/UI vocabulary. These are not production API fields.
export const filterOptions={
 category:['Academic','Campus life','Student life','Items','University information'],
 department:['Example Library','Example Academic Office','Example Student Support','Example Learning Centre','Example Campus Services','Example Computing Unit','Example Welcome Desk','Example Directory'],
 type:['notice','lost','found','directory'],
 status:['open','resolved']
};
export const sorts=['newest','oldest','title','relevance'];
export function normalizeSearch(input=''){
 const params=input instanceof URLSearchParams?input:new URLSearchParams(typeof input==='string'?input:'');
 const errors=[],warnings=[];
 const one=(key,fallback='')=>{if(params.getAll(key).length>1)errors.push('Use one value for '+key+'.');return params.get(key)??fallback;};
 const state={q:one('q').trim(),from:one('from'),to:one('to'),sort:one('sort','newest'),page:1,demo:one('demo','ready')};
 if(state.q.length>120)errors.push('Keyword must be 120 characters or fewer.');
 for(const field of Object.keys(filterOptions)){
  state[field]=[...new Set(params.getAll(field))].sort();
  if(state[field].some(value=>!filterOptions[field].includes(value)))errors.push('Unsupported '+field+' selection. Clear filters to recover.');
 }
 function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
 for(const field of ['from','to'])if(state[field]&&!validDate(state[field]))errors.push('Use a valid YYYY-MM-DD '+field+' date.');
 if(state.from&&state.to&&state.from>state.to)errors.push('Start date must be on or before end date.');
 if(!sorts.includes(state.sort))errors.push('Unsupported sort order.');
 const rawPage=one('page','1');
 if(!/^\d+$/.test(rawPage)||!Number.isSafeInteger(Number(rawPage))||Number(rawPage)<1||Number(rawPage)>1000000){warnings.push('Invalid page reset to 1.');}else state.page=Number(rawPage);
 if(!['ready','loading','error','empty'].includes(state.demo)){state.demo='ready';warnings.push('Unknown demo state reset.');}
 if(state.status.length&&state.type.length&&!state.type.some(type=>type==='lost'||type==='found'))errors.push('Item status requires a lost or found record type.');
 const known=['q','from','to','sort','page','demo',...Object.keys(filterOptions)];
 if([...params.keys()].some(key=>!known.includes(key)))warnings.push('Unrecognized URL parameters were discarded.');
 return {state,errors,warnings};
}
export function searchUrl(state){
 const params=new URLSearchParams();
 for(const key of ['q','from','to'])if(state[key])params.set(key,state[key]);
 for(const key of Object.keys(filterOptions))for(const value of [...new Set(state[key]||[])].sort())params.append(key,value);
 if(state.sort&&state.sort!=='newest')params.set('sort',state.sort);
 if(state.page>1)params.set('page',String(state.page));
 if(state.demo&&state.demo!=='ready')params.set('demo',state.demo);
 return '/search'+(params.size?'?'+params.toString():'');
}
export function safeSearchReturn(raw){
 if(!raw||typeof raw!=='string'||!raw.startsWith('/search')||raw.startsWith('//'))return null;
 try{const url=new URL(raw,'https://local.invalid');if(url.origin!=='https://local.invalid'||url.pathname!=='/search')return null;const normalized=normalizeSearch(url.searchParams);if(normalized.errors.length)return null;const hash=/^#result-[a-z0-9-]+$/.test(url.hash)?url.hash:'';return searchUrl(normalized.state)+hash;}catch{return null;}
}
