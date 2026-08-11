'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AuthLayout from '@/components/AuthLayout';
import AuthInput from '@/components/AuthInput';
import AuthButton from '@/components/AuthButton';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (
          authError.message?.toLowerCase().includes('invalid login credentials') ||
          authError.status === 400
        ) {
          setError("Those login details don't look right.");
        } else if (authError.message?.toLowerCase().includes('email not confirmed')) {
          setError('Please confirm your email address before logging in.');
        } else {
          setError('Could not sign you in. Please check your network and try again.');
        }
        setLoading(false);
        return;
      }

      if (data?.session) {
        router.push('/feed');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Welcome back</h2>
          <p className="text-xs text-zinc-400 mt-1">The council is waiting.</p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs font-medium text-center animate-fadeIn">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
          <AuthInput
            id="login-email"
            label="Email"
            type="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <div>
            <AuthInput
              id="login-password"
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <div className="flex justify-end mt-1.5">
              <button
                type="button"
                onClick={() => alert("Password reset link will be sent if configured.")}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <div className="pt-2">
            <AuthButton loading={loading} loadingText="Logging in...">
              Log in
            </AuthButton>
          </div>
        </form>

        <div className="text-center pt-2 border-t border-zinc-900">
          <p className="text-xs text-zinc-400">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-white hover:underline transition-all">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}