'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck } from 'lucide-react';
import { PasswordInput, PasswordRequirements } from '@/components/ui/password-input';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function verifyResetLink() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const linkError = url.searchParams.get('error_description') || hashParams.get('error_description');

      if (linkError) {
        if (active) {
          toast.error(decodeURIComponent(linkError.replace(/\\+/g, ' ')));
          router.replace('/forgot-password');
        }
        return;
      }

      // Supabase may deliver recovery links as a PKCE code or as session tokens.
      // Exchange/set the session before checking it; getSession alone fails for PKCE links.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (active) {
            toast.error('This password reset link is invalid or expired. Please request a new one.');
            router.replace('/forgot-password');
          }
          return;
        }
        window.history.replaceState({}, document.title, url.pathname);
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          if (active) {
            toast.error('This password reset link is invalid or expired. Please request a new one.');
            router.replace('/forgot-password');
          }
          return;
        }
        window.history.replaceState({}, document.title, url.pathname);
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        toast.error('This password reset link is invalid or expired. Please request a new one.');
        router.replace('/forgot-password');
        return;
      }

      setVerifying(false);
    }

    void verifyResetLink();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success('Password updated successfully');
    router.push('/dashboard');
    router.refresh();
  }

  if (verifying) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choose a new password for your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <PasswordInput
            id="password"
            label="New password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={loading}
            minLength={8}
          />
          <PasswordRequirements password={password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Re-enter new password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update password
        </Button>
      </form>

      <div className="mt-8 text-center">
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
