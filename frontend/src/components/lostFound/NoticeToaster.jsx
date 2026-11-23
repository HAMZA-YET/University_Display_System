import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { takeMyNotices } from '../../api/lostFound';
import '../../styles/lostFound.css';

const SHOW_MS = 5000;
const POLL_MS = 30000;

/**
 * 5-second popups for lost-and-found decisions (e.g. "Your claim was
 * approved"). Shown on any page for signed-in members. The server returns
 * each notice once. Checks on page change and every 30 seconds.
 */
export default function NoticeToaster() {
  const { user } = useAuth();
  const ownerId = user && (user.id || user._id);
  return ownerId ? <AccountNotices key={ownerId} /> : null;
}

function AccountNotices() {
  const location = useLocation();
  const [toasts, setToasts] = useState([]);
  const busy = useRef(false);
  const active = useRef(false);
  const dismissals = useRef(new Map());

  useEffect(() => {
    active.current = true;
    const timers = dismissals.current;
    return () => {
      active.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  function dismiss(id) {
    clearTimeout(dismissals.current.get(id));
    dismissals.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }

  const check = useCallback(async () => {
    if (!active.current || busy.current) return;
    busy.current = true;
    try {
      const notices = await takeMyNotices();
      if (!active.current) return;
      if (notices.length) {
        setToasts((list) => [...list, ...notices.filter((notice) => !list.some((toast) => toast.id === notice.id))]);
        notices.forEach((notice) => {
          clearTimeout(dismissals.current.get(notice.id));
          const timer = setTimeout(() => {
            dismissals.current.delete(notice.id);
            if (active.current) setToasts((list) => list.filter((toast) => toast.id !== notice.id));
          }, SHOW_MS);
          dismissals.current.set(notice.id, timer);
        });
      }
    } catch {
      // Notices are a convenience; ignore failures (for example when logged out).
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    // First check right after the page changes, then every 30 seconds.
    const first = setTimeout(check, 0);
    const timer = setInterval(check, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [location.pathname, check]);

  if (!toasts.length) return null;
  return (
    <div className="lf-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`lf-toast ${t.kind}`}>
          <span className="lf-toast-icon" aria-hidden="true">
            {t.kind === 'success' ? '✓' : t.kind === 'error' ? '✕' : 'i'}
          </span>
          <div>
            {t.text}
            {t.link && (
              <div>
                <Link to={t.link}>View</Link>
              </div>
            )}
          </div>
          <button
            type="button"
            className="lf-toast-close"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
