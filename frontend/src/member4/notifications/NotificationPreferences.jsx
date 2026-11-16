/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import {useState} from 'react';
import {Button} from '../components/Primitives.jsx';
import {notificationTools} from '../mocks/notificationAdapter.js';
import {storageWarning} from '../mocks/memberAdapter.js';
export default function NotificationPreferences(){
 const [draft,setDraft]=useState(()=>notificationTools.preferences()),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[failNext,setFailNext]=useState(false);
 async function submit(e){
 e.preventDefault();setPending(true);setMessage('');
 try{if(failNext){setFailNext(false);throw Error('Synthetic preference failure');}await notificationTools.updatePreferences(draft);setFailed(false);setMessage(storageWarning()||'Notification preferences saved for this synthetic account.');}
 catch{setFailed(true);setMessage('Notification preferences were not saved. Try again.');}
 finally{setPending(false);}
 }
 return <section className="section notification-preferences"><h2>Notification preferences</h2><p>These in-app mock controls affect future eligible events. They do not grant access or delete existing inbox history. Category and department follows above are reused.</p><form onSubmit={submit} className="preference-form"><fieldset disabled={pending}><legend>Mock in-app delivery</legend>{[['inApp','Enable in-app notifications'],['notices','Updates about eligible notices'],['items','Updates about eligible lost/found items']].map(([key,label])=><label key={key}><input type="checkbox" checked={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.checked})}/>{label}</label>)}</fieldset><Button type="submit" pending={pending}>Save notification preferences</Button></form><p role={failed?'alert':'status'} className="notification-preference-feedback">{message}</p><p><a href="/notifications">Open the mock notification inbox →</a></p><details className="mock-lab"><summary>Preference error preview</summary><label><input type="checkbox" checked={failNext} onChange={e=>setFailNext(e.target.checked)}/> Fail next mock preference save</label></details></section>;
}
