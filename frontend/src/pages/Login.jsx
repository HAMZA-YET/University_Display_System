import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PageHeader from '../components/layout/PageHeader';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import useAuth from '../hooks/useAuth';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const HOME_BY_ROLE = { ADMIN: '/admin', AUTHOR: '/author/notices', REVIEWER: '/reviewer/queue', READER: '/' };

export default function Login() {
  const { login, verifyMfa } = useAuth();
  const [mfaRequired, setMfaRequired] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const verificationPending = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  function finishLogin(user) {
    navigate(location.state?.from || HOME_BY_ROLE[user.role] || '/', { replace: true });
  }

  async function onSubmit(values) {
    setError(null);
    try {
      const user = await login(values.email, values.password);
      if (user.mfaRequired) { setMfaRequired(true); return; }
      finishLogin(user);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitMfa(event) {
    event.preventDefault();
    if (verificationPending.current) return;
    verificationPending.current = true;
    setVerifying(true);
    setError(null);
    try {
      const user = await verifyMfa(code);
      setCode('');
      finishLogin(user);
    } catch (err) {
      setCode('');
      setError(err.message);
    } finally {
      verificationPending.current = false;
      setVerifying(false);
    }
  }
  if (mfaRequired) return <div style={{ maxWidth: 480, margin: '0 auto' }}>
    <PageHeader title="Verify your sign-in" description="Enter your authenticator code or a one-use recovery code." />
    <form className="panel stack" onSubmit={submitMfa}>
      <Input label="Authentication code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" required disabled={verifying} />
      {error && <Alert type="error">{error}</Alert>}<Button type="submit" busy={verifying}>Verify</Button>
      <Button type="button" disabled={verifying} onClick={() => { setMfaRequired(false); setCode(''); }}>Restart login</Button>
    </form></div>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <PageHeader title="Log in" description="Staff and students sign in with their UIDS account." />
      <form className="panel stack" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Email" type="email" autoComplete="email" required error={errors.email && errors.email.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" required error={errors.password && errors.password.message} {...register('password')} />
        {error && <Alert type="error">{error}</Alert>}
        <Button type="submit" busy={isSubmitting}>
          Log in
        </Button>
        <p className="small">
          <Link to="/account-recovery">Recover or activate an account</Link><br />
          No account? <Link to="/register" state={location.state?.from === '/setup' ? { from: '/setup' } : null}>Register as a reader</Link>
        </p>
      </form>
    </div>
  );
}
