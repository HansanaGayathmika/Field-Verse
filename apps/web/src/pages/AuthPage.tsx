import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useSession } from '@/hooks/queries';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/Page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/StatusStates';
import { api } from '@/services/api';
import { FarmerMascot, markJustSignedIn, type MascotMood } from '@/features/mascot/FarmerMascot';

const LoginSchema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
const RegisterSchema = LoginSchema.extend({ name: z.string().trim().min(1, 'Enter your name').max(80), password: z.string().min(10, 'Use at least 10 characters').max(200) });
type Values = { name?: string; email: string; password: string };

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const session = useSession();
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({ resolver: zodResolver(mode === 'login' ? LoginSchema : RegisterSchema) as never, defaultValues: { name: '', email: '', password: '' } });
  const errors = form.formState.errors;

  // Visual layer only: the mascot reacts to the form; it never changes the login logic.
  const [fieldFocused, setFieldFocused] = useState(false);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!error) return;
    setShaking(true);
    const t = window.setTimeout(() => setShaking(false), 1200);
    return () => window.clearTimeout(t);
  }, [error]);
  const mood: MascotMood = form.formState.isSubmitting ? 'cheer' : shaking ? 'shake' : fieldFocused ? 'look' : 'idle';

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      if (mode === 'login') await api.login({ email: v.email, password: v.password });
      else await api.register({ name: v.name!, email: v.email, password: v.password });
      // Refresh the session first so the home page shows the full navigation immediately.
      await qc.refetchQueries({ queryKey: ['session'] });
      await qc.invalidateQueries();
      markJustSignedIn(mode); // lets the home page play the one-time "suit up" welcome
      navigate('/', { replace: true });
    } catch (e) {
      setError(e);
    }
  });

  if (session.data?.authenticated && !form.formState.isSubmitting) return <Navigate to="/" replace />;

  const input = 'mt-1 h-12 w-full rounded-xl border border-forest-900/20 px-4';
  return (
    <PageContainer className="grid max-w-5xl items-center gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] md:gap-10">
      <div className="relative mx-auto flex w-full max-w-xs flex-col items-center overflow-hidden rounded-[2rem] bg-gradient-to-b from-sage-100 via-cream-100 to-gold-100 px-6 pb-3 pt-4 md:max-w-sm md:pb-4 md:pt-10" data-testid="login-mascot">
        <span className="absolute -left-10 -top-10 size-40 rounded-full bg-emerald-100/70" aria-hidden />
        <span className="absolute -bottom-12 -right-8 size-44 rounded-full bg-gold-100" aria-hidden />
        <FarmerMascot mood={mood} className="relative w-28 sm:w-40 md:w-64" />
        <p className="relative mt-1 text-center font-display text-base text-forest-900 md:mt-2 md:text-xl">
          {mood === 'shake' ? 'Hmm, that didn’t work. Try again?' : mode === 'login' ? 'Welcome back to the field!' : 'Let’s get your farm growing!'}
        </p>
      </div>
      <Card className="w-full max-w-md justify-self-center p-6 sm:p-8">
        <h1 className="text-3xl">{mode === 'login' ? 'Log in' : 'Create an account'}</h1>
        <p className="mt-2 text-ink-muted">Log in or create a free account to explore farms, compare crop rotations and save your plans. Your farm details stay private to your account.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={onSubmit}
          noValidate
          onFocus={(e) => setFieldFocused(e.target instanceof HTMLInputElement)}
          onBlur={() => setFieldFocused(false)}
        >
          {mode === 'register' ? (
            <label className="block font-semibold">
              Name
              <input className={input} autoComplete="name" {...form.register('name')} aria-invalid={!!errors.name} />
              {errors.name ? <span role="alert" className="text-sm text-critical">{errors.name.message}</span> : null}
            </label>
          ) : null}
          <label className="block font-semibold">
            Email
            <input className={input} type="email" autoComplete="email" {...form.register('email')} aria-invalid={!!errors.email} />
            {errors.email ? <span role="alert" className="text-sm text-critical">{errors.email.message}</span> : null}
          </label>
          <label className="block font-semibold">
            Password
            <input className={input} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...form.register('password')} aria-invalid={!!errors.password} />
            {errors.password ? <span role="alert" className="text-sm text-critical">{errors.password.message}</span> : null}
          </label>
          {error ? <ErrorState error={error} /> : null}
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          {mode === 'login' ? (
            <>No account? <Link className="font-semibold text-emerald-700 underline" to="/register">Create one</Link></>
          ) : (
            <>Already have an account? <Link className="font-semibold text-emerald-700 underline" to="/login">Log in</Link></>
          )}
        </p>
        <p className="mt-3 text-center text-xs text-ink-muted">Password reset by email is not available yet (no email service is configured).</p>
      </Card>
    </PageContainer>
  );
}
