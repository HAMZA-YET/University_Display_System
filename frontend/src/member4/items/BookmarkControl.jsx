import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import Button from '../../components/ui/Button.jsx';
import { bookmarkStatus, saveBookmark, removeBookmark } from '../data/memberApi.js';

export default function BookmarkControl({ noticeId, recordId }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const id = noticeId || (recordId?.startsWith('notice-') ? recordId.slice(7) : recordId);
  if (loading || !id) return null;
  if (!user) return <p className="small"><Link to="/login" state={{ from: location.pathname + location.search }}>Log in</Link> to save this notice.</p>;
  return <AccountBookmark key={`${user.id}:${id}`} noticeId={id} />;
}
function AccountBookmark({ noticeId }) {
  const [saved, setSaved] = useState(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    bookmarkStatus(noticeId, controller.signal)
      .then((data) => { if (active) { setSaved(data.saved); setMessage(''); } })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; controller.abort(); };
  }, [noticeId, attempt]);
  async function toggle() {
    setPending(true);
    setMessage('');
    try {
      if (saved) { await removeBookmark(noticeId); setSaved(false); setMessage('Bookmark removed.'); }
      else { await saveBookmark(noticeId); setSaved(true); setMessage('Notice saved to your account.'); }
    } catch (error) { setMessage(error.message); }
    finally { setPending(false); }
  }
  return <div className="stack" style={{ marginTop: 12 }}>
    <Button variant="secondary" size="sm" busy={pending} disabled={saved === null} aria-pressed={saved === true} onClick={toggle}>{saved ? 'Remove bookmark' : 'Save notice'}</Button>
    {message && <p className="small" role="status">{message}{saved === null && <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry bookmark status</button>}</p>}
  </div>;
}
