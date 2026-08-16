import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, Restaurant } from '@/lib/types';

export async function fetchProfileAndRestaurant(
  supabase: SupabaseClient
): Promise<{ profile: Profile | null; restaurant: Restaurant | null }> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .maybeSingle();

  if (profileError) {
    console.error('Failed to fetch profile:', profileError.message);
  }

  if (!profile) {
    return { profile: null, restaurant: null };
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
