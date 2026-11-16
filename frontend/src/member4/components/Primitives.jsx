/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import { useId } from 'react';
export function Button({children,pending=false,disabled=false,variant='primary',type='button',...props}) {
 return <button type={type} className={'button '+variant} disabled={disabled||pending} aria-busy={pending||undefined} {...props}>{pending?'Working…':children}</button>;
}
export function Field({label,hint,error,id,children}) {
 const generated=useId(); const fieldId=id||generated;
 return <div className="field"><label htmlFor={fieldId}>{label}</label>{children({id:fieldId,'aria-invalid':error?true:undefined,'aria-describedby':[hint?fieldId+'-hint':null,error?fieldId+'-error':null].filter(Boolean).join(' ')||undefined})}{hint&&<small id={fieldId+'-hint'}>{hint}</small>}{error&&<p className="field-error" id={fieldId+'-error'}>{error}</p>}</div>;
}
export function TextInput({label,hint,error,id,...props}) { return <Field {...{label,hint,error,id}}>{attributes=><input {...props} {...attributes}/>}</Field>; }
export function SelectInput({label,hint,error,id,options,...props}) { return <Field {...{label,hint,error,id}}>{attributes=><select {...props} {...attributes}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}</Field>; }
export function StatusLabel({children,tone='neutral'}) {return <span className={'badge '+tone}>{children}</span>;}
