'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff, MailOpen, AlertCircle } from 'lucide-react';
import { PasswordInput, PasswordRequirements } from '@/components/ui/password-input';

function AcceptInviteForm() {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(async ({ data }: { data: { session: { user: { email?: string | null } } | null } }) => {
      if (data.session) {
        setInviteEmail(data.session.user.email ?? null);
        setVerifying(false);
        return;
      }

      const code = searchParams.get('code');
      const token = searchParams.get('token');
      const type = searchParams.get('type');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setInviteError(
            'This invitation link is invalid or has expired. Please ask your manager to send a new invitation.'
          );
          setVerifying(false);
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        setInviteEmail(sessionData.session?.user.email ?? null);
        setVerifying(false);
      } else if (token && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: type as 'invite' | 'recovery',
        });
        if (error) {
          setInviteError(
            'This invitation link is invalid or has expired. Please ask your manager to send a new invitation.'
          );
        }
        const { data: sessionData } = await supabase.auth.getSession();
        setInviteEmail(sessionData.session?.user.email ?? null);
        setVerifying(false);
      } else {
        setInviteError(
          'No invitation token found. Please use the link from your invitation email.'
        );
        setVerifying(false);
      }
    });
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      toast.error('Session expired. Please request a new invitation.');
      router.push('/login');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName },
    });

    if (updateError) {
      toast.error(updateError.message);
      setLoading(false);
      return;
    }

    if (fullName) {
      await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', sessionData.session.user.id);
    }

    toast.success('Welcome to the team! Redirecting to your dashboard…');
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

  if (inviteError) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Invitation invalid</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">
          {inviteError}
        </p>
        <Button variant="outline" className="mt-8 w-full" asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MailOpen className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">You&apos;ve been invited</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {inviteEmail
            ? `Set up your account for ${inviteEmail}`
            : 'Set up your account to join the team'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="fullName">Your full name</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Jordan Smith"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
          />
        </div>

        <div>
          <PasswordInput
            id="password"
            label="Create a password"
            value={password}
            onChange={setPassword}
            placeholder="Create a password"
            autoComplete="new-password"
            disabled={loading}
            minLength={8}
          />
          <PasswordRequirements password={password} />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Accept invitation
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        By accepting this invitation, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
