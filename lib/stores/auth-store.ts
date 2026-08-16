import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import type { Profile, Restaurant } from '@/lib/types';

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  restaurant: Restaurant | null;
  loading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setRestaurant: (restaurant: Restaurant | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  restaurant: null,
  loading: true,
  error: null,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setRestaurant: (restaurant) => set({ restaurant }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      user: null,
      session: null,
      profile: null,
      restaurant: null,
      loading: true,
      error: null,
    }),
}));

export const useIsManager = () => useAuthStore((s) => s.profile?.role === 'manager');
