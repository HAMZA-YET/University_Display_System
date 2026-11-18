import { useState } from 'react';
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
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  async function onSubmit(values) {
    setError(null);
    try {
      const user = await login(values.email, values.password);
      const from = location.state && location.state.from;
      navigate(from || HOME_BY_ROLE[user.role] || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

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
          No account? <Link to="/register" state={location.state?.from === '/setup' ? { from: '/setup' } : null}>Register as a reader</Link>
        </p>
      </form>
    </div>
  );
}
