'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import type { Location } from '@/lib/types';

export default function SettingsPage() {
  const { restaurant, profile, setRestaurant } = useAuthStore();
  const [restaurantName, setRestaurantName] = useState(restaurant?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);

  useEffect(() => {
    if (restaurant) setRestaurantName(restaurant.name);
  }, [restaurant]);

  useEffect(() => {
    const supabase = createClient();
    const loadLocations = async () => {
      if (!restaurant) return;
      const { data } = await supabase
        .from('locations')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: true });
      setLocations((data as Location[]) ?? []);
      setLoadingLocations(false);
    };
    loadLocations();
  }, [restaurant]);

  async function saveRestaurant(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurant) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('restaurants')
      .update({ name: restaurantName })
      .eq('id', restaurant.id)
      .select()
      .maybeSingle();

    if (error) {
      toast.error('Failed to update restaurant name.');
    } else if (data) {
      setRestaurant(data);
      toast.success('Restaurant updated.');
    }
    setSaving(false);
  }

  const isManager = profile?.role === 'manager';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace, locations, and team invitations
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card className="max-w-2xl border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Restaurant details</CardTitle>
              <CardDescription>
                Update your workspace name and settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveRestaurant} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="restaurantName">Restaurant name</Label>
                  <Input
                    id="restaurantName"
                    placeholder="Restaurant name"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    disabled={!isManager || saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Workspace slug</Label>
                  <Input
                    id="slug"
                    value={restaurant?.slug ?? ''}
                    readOnly
                    disabled
                    className="bg-muted/50 text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Slug is auto-generated and cannot be changed.
                  </p>
                </div>
                {isManager && (
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Locations</CardTitle>
                  <CardDescription>
                    Manage your restaurant locations
                  </CardDescription>
                </div>
                {isManager && (
                  <Button variant="outline" size="sm">
                    Add location
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingLocations ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : locations.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  No locations configured yet
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {locations.map((loc) => (
                    <li
                      key={loc.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{loc.name}</p>
                        {loc.address && (
                          <p className="text-xs text-muted-foreground">
                            {loc.address}
                          </p>
                        )}
                      </div>
                      {isManager && (
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Team members</CardTitle>
                  <CardDescription>
                    Invite and manage team access
                  </CardDescription>
                </div>
                {isManager && (
                  <Button variant="outline" size="sm">
                    Invite member
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                {isManager
                  ? 'No team members invited yet'
                  : 'Contact your manager to invite team members'}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Card className="max-w-2xl border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Billing</CardTitle>
              <CardDescription>Manage your subscription</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm text-muted-foreground">Current plan</p>
                <p className="mt-1 text-lg font-semibold">Free trial</p>
              </div>
              <Separator />
              <Button>Upgrade plan</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
