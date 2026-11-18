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

// Same rules as the server (server/src/modules/auth/auth.schemas.js).
const schema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    email: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Za-z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export default function Register() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', confirm: '' } });

  async function onSubmit(values) {
    setError(null);
    try {
      await registerUser(values.name, values.email, values.password);
      navigate(location.state?.from === '/setup' ? '/setup' : '/', { replace: true });
    } catch (err) {
      (err.details || []).forEach((d) => setFieldError(d.field, { message: d.message }));
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <PageHeader title="Create an account" description="New accounts are reader accounts. Staff roles are assigned by an administrator." />
      <form className="panel stack" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input label="Full name" autoComplete="name" required error={errors.name && errors.name.message} {...register('name')} />
        <Input label="Email" type="email" autoComplete="email" required error={errors.email && errors.email.message} {...register('email')} />
        <Input label="Password" type="password" autoComplete="new-password" required hint="At least 8 characters with a letter and a number." error={errors.password && errors.password.message} {...register('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required error={errors.confirm && errors.confirm.message} {...register('confirm')} />
        {error && <Alert type="error">{error}</Alert>}
        <Button type="submit" busy={isSubmitting}>
          Create account
        </Button>
        <p className="small">
          Already registered? <Link to="/login" state={location.state?.from === '/setup' ? { from: '/setup' } : null}>Log in</Link>
        </p>
      </form>
    </div>
  );
}
