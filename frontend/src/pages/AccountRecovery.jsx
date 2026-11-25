import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { securityRequest } from '../api/security';

// Activation is reached through an administrator-issued invitation, not the login recovery menu.
export default function AccountRecovery({ activation = false }) {
  const [step, setStep] = useState(activation ? 'code' : 'email');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [capabilities, setCapabilities] = useState(null);
  useEffect(() => {
    let active = true;
    securityRequest('capabilities', undefined, 'get').then(value => { if (active) setCapabilities(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  async function submit(event, requestCode) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setError(''); setMessage('');
    if (!requestCode && values.password !== values.confirmPassword) {
      setError('Passwords do not match. Enter the same password in both fields.'); return;
    }
    submitting.current = true; setBusy(true);
    try {
      if (requestCode) {
        await securityRequest('recovery/request', { email: email.trim() });
        setMessage('If an eligible account exists, a verification code will be sent to that email. Check your inbox and spam folder.');
        setStep('code');
      } else {
        await securityRequest((activation ? 'activation' : 'recovery') + '/complete', { ...values, token: values.token.trim() });
        form.reset(); setStep('done');
        setMessage(activation ? 'Account activated. You can now log in.' : 'Password reset successfully. Log in with your new password. MFA remains enabled if previously enrolled.');
      }
    } catch (e) { setError(e.message); }
    finally { submitting.current = false; setBusy(false); }
  }

  const showCode = capabilities?.accountCompletionAvailable && (activation || step === 'code' || !capabilities.accountMessagesAvailable);
  return <div style={{ maxWidth: 480, margin: '0 auto' }}>
    <PageHeader title={activation ? 'Activate your account' : 'Forgot Password?'} description={activation ? 'Use the private code from your administrator’s invitation.' : 'Request a verification code to reset your password.'} />
    {error && <Alert type="error">{error}</Alert>}{message && <Alert>{message}</Alert>}
    {!capabilities && !error && <p className="muted">Checking account recovery availability…</p>}
    {capabilities && !capabilities.accountCompletionAvailable && <Alert>Password reset and activation are currently unavailable. Contact an administrator.</Alert>}
    {!activation && capabilities && !capabilities.accountMessagesAvailable && step !== 'done' && <Alert>Recovery messages are unavailable. Contact an administrator, or use an unexpired code you already received.</Alert>}
    {!activation && step === 'email' && capabilities?.accountMessagesAvailable && <form className="panel stack" onSubmit={e => submit(e, true)}>
      <Input label="Registered email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
      <Button type="submit" busy={busy}>Request verification code</Button>
      {capabilities.accountCompletionAvailable && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setError(''); setStep('code'); }}>I already have a code</Button>}
    </form>}
    {step !== 'done' && showCode && <form className="panel stack" onSubmit={e => submit(e, false)}>
      <Input label="Verification code" name="token" type="password" autoComplete="one-time-code" hint="Paste the complete code from your email." required maxLength={64} disabled={busy} />
      <Input label="New password" name="password" type="password" autoComplete="new-password" hint="Use at least 8 characters, including a letter and a number (maximum 72 UTF-8 bytes)." minLength={8} maxLength={128} required disabled={busy} />
      <Input label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} />
      <Button type="submit" busy={busy}>{activation ? 'Activate account' : 'Reset password'}</Button>
      {!activation && capabilities?.accountMessagesAvailable && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setMessage(''); setError(''); setStep('email'); }}>Request another code</Button>}
    </form>}
    <Link className="account-recovery-return" to="/login">Return to login</Link>
  </div>;
}
