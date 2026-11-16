/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import {useEffect,useState} from 'react';
import {Button} from '../components/Primitives.jsx';
import {interests,selectedSyntheticAccount,storageWarning} from '../mocks/memberAdapter.js';
export default function BookmarkControl({recordId,account=selectedSyntheticAccount()}){
 const [saved,setSaved]=useState(false),[pending,setPending]=useState(account!=='visitor'),[message,setMessage]=useState('');
 useEffect(()=>{
 let active=true;
 if(account!=='visitor')interests.list().then(rows=>{if(active){setSaved(rows.some(row=>row.id===recordId));setPending(false);}}).catch(()=>{if(active){setMessage('Mock bookmarks could not load.');setPending(false);}});
 return ()=>{active=false;};
 },[account,recordId]);
 async function toggle(){
 setPending(true);setMessage('');
 try{if(saved){await interests.remove(recordId);setSaved(false);setMessage('Removed from synthetic bookmarks.');}else{await interests.save(recordId);setSaved(true);setMessage('Saved for this synthetic account.');}if(storageWarning())setMessage(storageWarning());}
 catch{setMessage('The sample could not be saved. It may no longer be available.');}
 finally{setPending(false);}
 }
 return <div className="bookmark-control">{account==='visitor'?<p><a href="/saved-interests">Choose a synthetic account</a> to try mock bookmarks.</p>:<><p className="mock-label">Mock bookmarks · Synthetic {account==='alpha'?'Alpha':'Beta'} only</p><Button variant="secondary" pending={pending} onClick={toggle}>{saved?'Remove bookmark':'Save bookmark'}</Button><p role="status">{message}</p></>}</div>;
}
