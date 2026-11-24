import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import Button from '../../components/ui/Button.jsx';
import { bookmarkStatus, saveBookmark, removeBookmark, itemBookmarkStatus, saveItemBookmark, removeItemBookmark } from '../data/memberApi.js';

export default function BookmarkControl({ noticeId, recordId, itemId }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const id = itemId || noticeId || (recordId?.startsWith('notice-') ? recordId.slice(7) : recordId);
  const kind = itemId ? 'item' : 'notice';
  if (loading || !id) return null;
  if (!user) return <p className="small"><Link to="/login" state={{ from: location.pathname + location.search }}>Log in</Link> to save this {kind}.</p>;
  return <AccountBookmark key={`${user.id}:${kind}:${id}`} recordId={id} kind={kind} />;
}
function AccountBookmark({ recordId, kind }) {
  const [saved, setSaved] = useState(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const status = kind === 'item' ? itemBookmarkStatus : bookmarkStatus;
    status(recordId, controller.signal)
      .then((data) => { if (active) { setSaved(data.saved); setMessage(''); } })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; controller.abort(); };
  }, [recordId, kind, attempt]);
  async function toggle() {
    setPending(true);
    setMessage('');
    try {
      if (saved) { await (kind === 'item' ? removeItemBookmark : removeBookmark)(recordId); setSaved(false); setMessage('Bookmark removed.'); }
      else { await (kind === 'item' ? saveItemBookmark : saveBookmark)(recordId); setSaved(true); setMessage(kind === 'item' ? 'Item saved to your account.' : 'Notice saved to your account.'); }
    } catch (error) { setMessage(error.message); }
    finally { setPending(false); }
  }
  return <div className="stack" style={{ marginTop: 12 }}>
    <Button variant="secondary" size="sm" busy={pending} disabled={saved === null} aria-pressed={saved === true} onClick={toggle}>{saved ? 'Remove bookmark' : `Save ${kind}`}</Button>
    {message && <p className="small" role="status">{message}{saved === null && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry bookmark status</button>}</p>}
  </div>;
}
