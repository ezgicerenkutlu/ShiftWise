import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Restaurant } from '@/lib/types';

export async function fetchProfileAndRestaurant(
  supabase: SupabaseClient,
  userId: string
): Promise<{ profile: Profile | null; restaurant: Restaurant | null }> {
  // A manager can read multiple profiles under RLS, so always scope this
  // lookup to the authenticated user instead of calling maybeSingle() on all rows.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('Failed to fetch profile:', profileError.message);
    return { profile: null, restaurant: null };
  }

  if (!profile) {
    return { profile: null, restaurant: null };
  }

  if (!profile.restaurant_id) {
    console.error('Profile has no restaurant_id');
    return { profile: profile as Profile, restaurant: null };
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', profile.restaurant_id)
    .maybeSingle();

  if (restaurantError) {
    console.error('Failed to fetch restaurant:', restaurantError.message);
  }

  return {
    profile: profile as Profile,
    restaurant: restaurant as Restaurant | null,
  };
}
