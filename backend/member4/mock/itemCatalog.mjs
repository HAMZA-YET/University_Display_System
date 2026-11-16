// Mock public display catalogue. Never a production visibility/ownership policy.
const fixtures=[
{id:'lost-blue-notebook',type:'lost',title:'Blue notebook',description:'Fictional anonymized notebook example. No contents, owner identity or claim evidence are displayed.',status:'open',date:'2026-11-06',updated:'2026-11-07',location:'Example shared study area',mediaId:'notebook-demo'},
{id:'lost-water-bottle',type:'lost',title:'Reusable water bottle',description:'Fictional lost bottle used to demonstrate a resolved item and a missing photograph.',status:'resolved',date:'2026-11-04',updated:'2026-11-06',location:null,mediaId:'missing-demo'},
{id:'found-study-folder',type:'found',title:'Study folder',description:'Fictional found folder. Its contents and identifying marks are deliberately not included.',status:'open',date:'2026-11-05',updated:'2026-11-07',location:'Example campus common area',mediaId:'pending-demo'},
{id:'found-pencil-case',type:'found',title:'Green pencil case',description:'Fictional anonymized item with a withdrawn demonstration image.',status:'resolved',date:'2026-11-02',updated:'2026-11-05',location:null,mediaId:'withdrawn-demo'}
].map(item=>Object.freeze(item));
export const publicItemIds=fixtures.map(item=>item.id);
export function createMockItemCatalog(withdrawn=[]){
 const hidden=new Set(withdrawn.filter(id=>publicItemIds.includes(id)));
 return {
 list:()=>fixtures.filter(item=>!hidden.has(item.id)).map(item=>({...item})),
 get:id=>hidden.has(id)?null:fixtures.find(item=>item.id===id)?{...fixtures.find(item=>item.id===id)}:null,
 setMockVisibility:(id,visible)=>{if(!publicItemIds.includes(id))throw Error('Unknown synthetic record');if(visible)hidden.delete(id);else hidden.add(id);},
 hiddenIds:()=>[...hidden]
 };
}
// Restricted/withdrawn test references deliberately have no content or personal metadata.
export const unavailableTestReferences=Object.freeze(['restricted-example','withdrawn-example']);
