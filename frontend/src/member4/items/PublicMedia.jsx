/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import {useState} from 'react';
import {publicMedia,safeMediaDescriptor} from '../mocks/mediaAdapter.js';
export default function PublicMedia({mediaId}){
 const media=safeMediaDescriptor(publicMedia(mediaId));
 const [failedId,setFailedId]=useState(null);
 const failed=failedId===mediaId;
 const approved=media.state==='approved'&&!failed;
 const messages={missing:'No public image provided',pending:'Public image pending review',withdrawn:'Public image withdrawn',unavailable:'Public image unavailable'};
 return <figure className="public-media">{approved?<><img src={media.src} alt={media.alt} width="640" height="400" onError={()=>setFailedId(mediaId)}/><figcaption>{media.caption}</figcaption></>:<div className="media-placeholder" role="img" aria-label={messages[failed?'unavailable':media.state]||messages.unavailable}><span aria-hidden="true">▧</span><p>{messages[failed?'unavailable':media.state]||messages.unavailable}</p></div>}</figure>;
}
