import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { takeMyNotices } from '../../api/lostFound';

const SHOW_MS = 5000;
const POLL_MS = 30000;

/**
 * 5-second popups for lost-and-found decisions (e.g. "Your claim was
 * approved"). Shown on any page for signed-in members. The server returns
 * each notice once. Checks on page change and every 30 seconds.
 */
export default function NoticeToaster() {
  const { user } = useAuth();
  const location = useLocation();
  const [toasts, setToasts] = useState([]);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const notices = await takeMyNotices();
      if (notices.length) {
        setToasts((list) => [...list, ...notices]);
        notices.forEach((n) => setTimeout(() => setToasts((list) => list.filter((t) => t.id !== n.id)), SHOW_MS));
      }
    } catch (err) {
      // Notices are a convenience; ignore failures (for example when logged out).
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [user, location.pathname, check]);

  if (!user || !toasts.length) return null;
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
            onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
