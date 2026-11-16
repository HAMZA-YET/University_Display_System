// Allowlisted local demonstration assets, never arbitrary URLs or private evidence.
const assets=Object.freeze({
 'notebook-demo':{state:'approved',src:'/media/member4/notebook.svg',alt:'Illustration of a fictional blue notebook, not an actual item photograph.',caption:'Fictional local illustration · not an actual item photograph'},
 'missing-demo':{state:'missing'},'pending-demo':{state:'pending'},'withdrawn-demo':{state:'withdrawn'}
});
export function publicMedia(id){
 const value=assets[id];
 if(!value)return {state:'unavailable'};
 return {...value};
}
export function safeMediaDescriptor(descriptor){
 if(descriptor?.state!=='approved')return {state:['missing','pending','withdrawn'].includes(descriptor?.state)?descriptor.state:'unavailable'};
 return descriptor.src==='/media/member4/notebook.svg'&&typeof descriptor.alt==='string'&&descriptor.alt.trim()?{...descriptor}:{state:'unavailable'};
}
