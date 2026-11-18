import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { LoadingState, EmptyState } from '../../components/ui/States.jsx';

export default function MemberPage({ title, description, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  return <>
    <PageHeader title={title} description={description} />
    {loading ? <LoadingState label="Checking your session…" /> : !user ? <EmptyState title="Sign in to continue"><p>Your saved notices, topic follows and inbox belong to your UIDS account.</p><Link className="btn" to="/login" state={{ from: location.pathname + location.search }}>Log in</Link></EmptyState> : <div key={user.id}>{children}</div>}
  </>;
}
