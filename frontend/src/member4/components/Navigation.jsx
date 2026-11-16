/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import { useRef, useState } from 'react';
export function SiteHeader({links,brandHref="#overview",subtitle="Member 4 · Local studio",activeHref}) {
 const [open,setOpen]=useState(false); const toggle=useRef(null);
 function close(restore=false){setOpen(false);if(restore)toggle.current?.focus();}
 return <header className="site-header" onKeyDown={e=>{if(e.key==='Escape'&&open)close(true);}}>
 <div className="header-inner"><a className="brand" href={brandHref}><span className="brand-mark" aria-hidden="true">U</span><span>UIDS<small>{subtitle}</small></span></a>
 <button ref={toggle} className="menu-toggle button secondary" aria-expanded={open} aria-controls="primary-navigation" onClick={()=>setOpen(!open)}>{open?'Close menu':'Menu'}</button>
 <nav id="primary-navigation" aria-label="Primary" className={open?'nav open':'nav'}>{links.map(link=><a key={link.href} href={link.href} aria-current={link.href===activeHref?"page":undefined} onClick={()=>close()}>{link.label}</a>)}</nav><span className="local-label"><i aria-hidden="true"/> Local preview</span></div></header>;
}
export function SiteFooter(){return <footer className="site-footer"><div><strong>UIDS / Member 4</strong><p>Shared frontend foundation · D02</p></div><p>Fictional demonstration only.<br/>Not an official university information service.</p><a href="#overview">Back to top ↑</a></footer>;}
export function PublicLayout({links,children}){return <><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader links={links}/><main id="main-content" tabIndex="-1">{children}</main><SiteFooter/></>;}
