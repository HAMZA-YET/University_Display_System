import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { pendingCount } from '../../api/notices';
import Icon from '../ui/Icon';

/** Unauthorized links are not rendered. The server still enforces every rule. */
export default function NavBar() {
  const { user, hasRole, logout } = useAuth();
  const [openPath, setOpenPath] = useState(null);
  const [pendingResult, setPendingResult] = useState(null);
  const [logoutError, setLogoutError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const open = openPath === location.pathname;
  const canReview = hasRole('REVIEWER', 'ADMIN');
  const pending = canReview && pendingResult?.path === location.pathname ? pendingResult.count : null;

  useEffect(() => {
    let active = true;
    if (canReview) {
      pendingCount()
        .then((count) => active && setPendingResult({ path: location.pathname, count }))
        .catch(() => active && setPendingResult(null));
    }
    return () => {
      active = false;
    };
  }, [canReview, location.pathname]);

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logout();
      navigate('/');
    } catch (error) {
      setLogoutError(error.message || 'Could not log out. Please try again.');
    }
  }

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            KDU
          </span>
          <span className="brand-text">
            KDU Global UIDS
            <small>University Information Display System</small>
          </span>
        </Link>
        <button
          type="button"
          className="menu-button"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpenPath(open ? null : location.pathname)}
        >
          <Icon name={open ? 'close' : 'menu'} />
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
        <nav id="main-nav" className={`nav-links ${open ? 'open' : ''}`} aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/notices">Notices</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/professors">Professors</NavLink>
          <NavLink to="/items">Lost &amp; found</NavLink>
          {hasRole('AUTHOR', 'ADMIN') && <NavLink to="/author/notices">My Notices</NavLink>}
          {hasRole('REVIEWER', 'ADMIN') && (
            <NavLink to="/reviewer/queue">
              Review Queue
              {pending !== null && (
                <span className="nav-count" aria-label={`${pending} pending`}>
                  {pending}
                </span>
              )}
            </NavLink>
          )}
          {hasRole('ADMIN') && (
            <>
              <NavLink to="/admin" end>
                Admin Dashboard
              </NavLink>
              <NavLink to="/admin/professors">Manage Professors</NavLink>
              <NavLink to="/admin/users">Users</NavLink>
            </>
          )}
          {hasRole('REVIEWER') && <NavLink to="/admin/domain-events">Domain Events</NavLink>}
          {user ? (
            <>
              <NavLink to="/saved-interests">Saved interests</NavLink>
              <NavLink to="/notifications">Notifications</NavLink>
              <span className="nav-user">
                <Icon name="user" size={14} /> {user.name} ({user.role})
              </span>
              <button type="button" className="linklike" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login">Login</NavLink>
          )}
        </nav>
        {logoutError && <p role="alert">{logoutError}</p>}
      </div>
    </header>
  );
}
