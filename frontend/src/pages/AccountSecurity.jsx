import { useEffect, useState } from 'react';
import PageHeader from '../components/layout/PageHeader';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import useAuth from '../hooks/useAuth';
import { securityRequest } from '../api/security';
export default function AccountSecurity() {
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [enabled, setEnabled] = useState(null);
  const [secret, setSecret] = useState(null);
  const [codes, setCodes] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { securityRequest('mfa', undefined, 'get').then(x => setEnabled(x.enabled)).catch(e => setError(e.message)); }, []);
  async function submit(event, operation) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    try {
      const result = await securityRequest(operation, values, operation === 'profile' ? 'patch' : 'post');
      if (operation === 'profile') { await refreshProfile(); setMessage('Profile updated.'); }
      if (operation === 'mfa/enroll') setSecret(result.secret);
      if (operation === 'mfa/confirm') { setCodes(result.recoveryCodes); setSecret(null); setEnabled(true); }
      if (operation === 'invitations') setMessage('Invitation written to the configured private delivery destination.');
      if (operation !== 'profile') form.reset();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <><PageHeader title="Account security" description="Manage your profile and authenticator protection." />
    {error && <Alert type="error">{error}</Alert>}{message && <Alert>{message}</Alert>}
    <form className="panel stack" onSubmit={e => submit(e, 'profile')}>
      <Input label="Display name" name="name" value={name} onChange={e => setName(e.target.value)} required maxLength={80} />
      <Button type="submit" busy={busy}>Save profile</Button>
    </form>
    <section className="panel stack"><h2>Authenticator protection</h2>
      <p>{enabled === null ? 'Checking status…' : enabled ? 'MFA is enabled. Every new login requires a code.' : 'Enroll before using this account for privileged work.'}</p>
      {enabled === false && !secret && <form className="stack" onSubmit={e => submit(e, 'mfa/enroll')}>
        <Input label="Current password" type="password" name="password" autoComplete="current-password" required />
        <Button type="submit" busy={busy}>Start enrollment</Button></form>}
      {secret && <><p>Enter this setup key in your authenticator. Keep it private:</p><code>{secret}</code>
        <form className="stack" onSubmit={e => submit(e, 'mfa/confirm')}><Input label="Authenticator code" name="code" autoComplete="one-time-code" required />
        <Button type="submit" busy={busy}>Confirm enrollment</Button></form></>}
      {codes.length > 0 && <><p>Store these recovery codes privately now. Each works once; they are not shown again.</p>
        <pre>{codes.join('\n')}</pre><Button onClick={() => setCodes([])}>I saved my codes</Button></>}
    </section>
    {user?.role === 'ADMIN' && <form className="panel stack" onSubmit={e => submit(e, 'invitations')}><h2>Invite a reader</h2>
      <Input label="Name" name="name" required /><Input label="Email" name="email" type="email" required />
      <Button type="submit" busy={busy}>Create invitation</Button></form>}
  </>;
}
