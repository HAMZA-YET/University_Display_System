/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import PublicNotices from './discovery/PublicNotices.jsx';
import SearchPage from './search/SearchPage.jsx';
import ItemsApp from './items/ItemsApp.jsx';
import InboxApp from './notifications/InboxApp.jsx';
import './styles.css';
import './discovery/public.css';
import './search/search.css';
import './items/items.css';
import './notifications/inbox.css';

// Optional component for L's integration review. Does not mount or replace the team app.
// Dependencies are explicitly mock-only; protected production endpoints stay disabled.
export default function Member4Routes() {
 const pathname=window.location.pathname;
 const inbox=/^\/notifications\/?$/.test(pathname);
 const items=/^\/items(?:\/|$)/.test(pathname)||pathname.startsWith('/saved-interests')||/^\/search-record\/(lost-|found-)/.test(pathname);
 const search=/^\/search\/?$/.test(pathname)||pathname.startsWith('/search-record/');
 return <div className="member4-root">{inbox?<InboxApp/>:items?<ItemsApp/>:search?<SearchPage/>:<PublicNotices/>}</div>;
}
