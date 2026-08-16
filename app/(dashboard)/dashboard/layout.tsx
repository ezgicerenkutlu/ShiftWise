'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { fetchProfileAndRestaurant } from '@/lib/auth/session';
import { Sidebar } from '@/components/dashboard/sidebar';
import { TopBar } from '@/components/dashboard/top-bar';
import { ErrorState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const {
    loading,
    error,
    setLoading,
    setError,
    setUser,
    setSession,
    setProfile,
    setRestaurant,
  } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const supabase = createClient();

    const init = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session) {
          router.replace('/login');
          return;
        }

        setSession(data.session);
        setUser(data.session.user);

        const { profile, restaurant } = await fetchProfileAndRestaurant(supabase);
        if (!profile) {
          setError('Unable to load your profile. Please try again.');
          setLoading(false);
          return;
        }
        setProfile(profile);
        setRestaurant(restaurant);
        setLoading(false);
      } catch (err) {
        console.error('Auth initialization failed:', err);
        setError('Failed to initialize. Please refresh the page.');
        setLoading(false);
      }
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event: string, session: Session | null) => {
        if (event === 'SIGNED_OUT' || !session) {
          router.replace('/login');
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session.user);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="max-w-md">
          <ErrorState title="Loading failed" description={error} />
          <Button
            onClick={() => window.location.reload()}
            className="mt-4 w-full"
            variant="outline"
          >
            Refresh page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto scrollbar-thin" id="main-content">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
