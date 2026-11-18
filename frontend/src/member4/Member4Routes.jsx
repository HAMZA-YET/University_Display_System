import { useLocation } from 'react-router-dom';
import SearchPage from './search/SearchPage.jsx';
import ItemsApp from './items/ItemsApp.jsx';
import InboxApp from './notifications/InboxApp.jsx';
import SavedInterests from './items/SavedInterests.jsx';
import UnavailableFeature from './components/UnavailableFeature.jsx';

// The host owns navigation and public notice/event/directory views.
// Production routes never import synthetic adapters or fixtures.
export default function Member4Routes() {
  const { pathname } = useLocation();
  if (/^\/search\/?$/.test(pathname)) return <SearchPage />;
  if (/^\/items(?:\/|$)/.test(pathname)) return <ItemsApp />;
  if (/^\/notifications\/?$/.test(pathname)) return <InboxApp />;
  if (/^\/saved-interests\/?$/.test(pathname)) {
    return <SavedInterests />;
  }
  return <UnavailableFeature title="Information unavailable" message="This information is not available. You can search the connected public notices and professor directory." />;
}
