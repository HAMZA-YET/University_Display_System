// Local display models only. No endpoint, database schema or eligibility policy.
// Only explicitly fictional public-safe fixtures are included in this module.
const publicFixtures=[
{reference:'library-study-spaces',title:'Extended library study spaces',category:'Campus life',department:'Example Library',published:'2026-11-06',summary:'Find a little more room to focus during the study season.',content:['This fictional announcement demonstrates how a public notice can present useful information clearly.','In this example, additional quiet study spaces would be available in the library. Students would be encouraged to keep shared spaces comfortable and considerate.','These arrangements are invented for the UIDS demonstration. Do not use this record to plan a real visit.']},
{reference:'semester-planning',title:'A guide to planning your next semester',category:'Academic',department:'Example Academic Office',published:'2026-11-05',summary:'A fictional guide to preparing questions and organizing your study plans.',content:['This is a fictional academic notice, created only to demonstrate public browsing.','Make a list of the subjects you would like to explore and the questions you would bring to an academic adviser. The sample does not provide real registration dates or requirements.']},
{reference:'campus-welcome',title:'Meet your campus community',category:'Student life',department:'Example Student Support',published:'2026-11-04',summary:'A sample welcome gathering for conversation, ideas and new connections.',content:['This fictional gathering is an example of a student-life announcement.','No event is scheduled and no registration is offered. The record exists to demonstrate a readable notice detail page.']},
{reference:'learning-workshop',title:'Research poster workshop',category:'Academic',department:'Example Learning Centre',published:'2026-11-03',summary:'Explore a sample announcement about sharing research visually.',content:['This fictional workshop introduces an example of a concise academic announcement.','The demonstration does not advertise an actual workshop, speaker or booking process.']},
{reference:'shared-spaces',title:'Caring for our shared spaces',category:'Campus life',department:'Example Campus Services',published:'2026-11-02',summary:'A sample reminder about keeping common areas welcoming.',content:['This fictional reminder provides sample content for the public notice listing.','Please refer to official university channels for actual campus policies. No policy is established by this demonstration.']},
{reference:'student-projects',title:'Student project showcase',category:'Student life',department:'Example Computing Unit',published:'2026-11-01',summary:'A fictional spotlight on creative projects and collaborative learning.',content:['This fictional showcase is a sample record for the UIDS frontend.','All descriptions, departments and arrangements are invented. No student identities or personal records are included.']}
].map(record=>Object.freeze({...record,status:'Published · fictional',content:Object.freeze(record.content)}));
const importantReferences=['library-study-spaces','semester-planning']; // Demo curation, not B publishing priority rules.
function pause(signal,scenario){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},scenario==='loading'?30000:220);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
export async function readPublicNotices({reference,scenario='ready',signal}={}){
 await pause(signal,scenario);
 if(scenario==='error')throw new Error('Local demonstration failure');
 if(scenario==='unavailable')return {kind:'unavailable'};
 if(reference){const notice=publicFixtures.find(record=>record.reference===reference);return notice?{kind:'detail',notice}:{kind:'unavailable'};}
 const notices=scenario==='empty'?[]:[...publicFixtures];
 return {kind:'list',notices,important:importantReferences.filter(id=>notices.some(n=>n.reference===id))};
}
