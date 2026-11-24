import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { securityRequest } from '../api/security';
export default function AccountRecovery() {
  const [purpose, setPurpose] = useState('recovery');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  useEffect(() => {
    let active = true;
    securityRequest('capabilities', undefined, 'get').then(value => { if (active) setCapabilities(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function submit(event, operation) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
    const form = event.currentTarget;
    try { await securityRequest(operation, Object.fromEntries(new FormData(form))); form.reset();
      setMessage(operation.endsWith('request') ? 'If an eligible account exists, recovery instructions will be delivered.' : 'Completed. You can now log in. MFA remains enabled if previously enrolled.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <><PageHeader title="Account activation and recovery" description="Use a private code from your account message. Never share it." />
    {error && <Alert type="error">{error}</Alert>}{message && <Alert>{message}</Alert>}
    {capabilities === null && <p className="muted">Checking account recovery availability…</p>}
    {capabilities && !capabilities.accountMessagesAvailable && <Alert>Recovery messages are unavailable. Contact an administrator if you need account access.</Alert>}
    {capabilities?.accountMessagesAvailable && <form className="panel stack" onSubmit={e => submit(e, 'recovery/request')}>
      <Input label="Account email" name="email" type="email" required /><Button type="submit" busy={busy}>Request recovery</Button></form>
    }
    {capabilities?.accountCompletionAvailable && <form className="panel stack" onSubmit={e => submit(e, purpose + '/complete')}>
      <label>Message type <select value={purpose} onChange={e => setPurpose(e.target.value)}><option value="recovery">Password recovery</option><option value="activation">Account activation</option></select></label>
      <Input label="Private message code" name="token" type="password" autoComplete="off" required />
      <Input label="New password" name="password" type="password" autoComplete="new-password" required />
      <Button type="submit" busy={busy}>Complete</Button></form>}
    <Link to="/login">Return to login</Link></>;
}
