import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { ErrorState, LoadingState } from '../components/ui/States';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { getSetupStatus } from '../api/setup';

/** A token is kept only in App's memory so account sign-in can return here. */
export default function Setup({ token, onTokenChange }) {
  const { user, loading, completeSetup } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const status = useApi(getSetupStatus, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (!fragment.has('token')) return;
    onTokenChange(fragment.get('token') || '');
    fragment.delete('token');
    const remaining = fragment.toString();
    navigate({ pathname: location.pathname, search: location.search, hash: remaining ? `#${remaining}` : '' }, { replace: true, state: location.state });
  }, [location, navigate, onTokenChange]);

  async function submit(event) {
    event.preventDefault();
    if (!user || busy || !token.trim() || status.loading || !status.data?.bootstrapConfigured || status.data.administratorExists) return;
    setBusy(true);
    setError(null);
    try {
      await completeSetup(token.trim());
      onTokenChange('');
      navigate('/admin', { replace: true });
    } catch (failure) {
      setError(failure.message || 'Your account could not be updated. Please try again.');
      if (failure.code === 'SETUP_COMPLETE') {
        onTokenChange('');
        status.reload();
      }
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (status.loading || loading) {
    content = <LoadingState label="Checking administrator setup..." />;
  } else if (status.error) {
    content = <ErrorState title="Setup status unavailable" error={status.error} onRetry={status.reload} />;
  } else if (status.data.administratorExists) {
    content = <Alert type="info" title="Administrator setup is complete">An administrator already exists. <Link to={user?.role === 'ADMIN' ? '/admin' : '/'}>Continue</Link></Alert>;
  } else if (!status.data.bootstrapConfigured) {
    content = <Alert type="warning" title="Administrator setup is unavailable">A setup link has not been enabled. Contact the project owner.</Alert>;
  } else if (!user) {
    content = (
      <section className="panel stack">
        <h2>Sign in to your account</h2>
        <p>Create your own account or sign in, then return here to make that account the first administrator.</p>
        <div className="row">
          <Link className="btn" to="/login" state={{ from: '/setup' }}>Sign in</Link>
          <Link className="btn btn-secondary" to="/register" state={{ from: '/setup' }}>Create an account</Link>
        </div>
        <p className="small muted">Your setup token stays in memory during sign-in. After refreshing or closing this page, reopen your secure setup link or paste the token again.</p>
      </section>
    );
  } else {
    content = (
      <form className="panel stack" onSubmit={submit}>
        <div>
          <h2>Confirm your account</h2>
          <p>You are signed in as <strong>{user.name}</strong> (<strong>{user.email}</strong>).</p>
          <p>This account will manage users, notices and university information.</p>
        </div>
        <Input label="Setup token" type="password" value={token} onChange={(event) => onTokenChange(event.target.value)} autoComplete="off" spellCheck={false} required disabled={busy} hint="Use the token from your secure setup link. It is never saved in browser storage." />
        {error && <Alert type="error">{error}</Alert>}
        <Button type="submit" busy={busy} disabled={!token.trim()}>Make my account administrator</Button>
      </form>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader title="Set up the first administrator" description="This setup is available only until the first administrator is created." />
      {content}
    </div>
  );
}
