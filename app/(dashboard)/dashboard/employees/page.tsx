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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, Mail, Clock, Check, X, Send } from 'lucide-react';
import type { Invitation } from '@/lib/types';

export default function EmployeesPage() {
  const { profile, restaurant } = useAuthStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'employee'>('employee');
  const [fullName, setFullName] = useState('');
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  const isManager = profile?.role === 'manager';

  useEffect(() => {
    if (!restaurant || !isManager) return;
    const supabase = createClient();
    supabase
      .from('invitations')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (error) {
          toast.error('Failed to load invitations');
          return;
        }
        setInvitations((data as Invitation[]) ?? []);
        setLoadingInvites(false);
      });
  }, [restaurant, isManager]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);

    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;

      if (!accessToken) {
        toast.error('You must be signed in to invite team members');
        setSending(false);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-employee`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            email,
            role,
            full_name: fullName || undefined,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Failed to send invitation');
        setSending(false);
        return;
      }

      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(`Invitation sent to ${email}`);
      }

      // Refresh invitation list
      if (result.invitation) {
        setInvitations([result.invitation, ...invitations]);
      }

      // Reset form
      setEmail('');
      setFullName('');
      setRole('employee');
      setDialogOpen(false);
    } catch {
      toast.error('An unexpected error occurred');
    }

    setSending(false);
  }

  if (!isManager) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View your team members and invitations
          </p>
        </div>
        <Card className="border-border/60">
          <CardContent className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Only managers can send invitations. Contact your manager if you need
              someone added to the team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite and manage your restaurant team
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Invite member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                They&apos;ll receive an email with a link to join your workspace.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inviteName">Full name (optional)</Label>
                <Input
                  id="inviteName"
                  type="text"
                  placeholder="Jordan Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={sending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">Email address</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  placeholder="jordan@restaurant.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inviteRole">Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as 'manager' | 'employee')}
                >
                  <SelectTrigger id="inviteRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Managers can create schedules, invite team members, and manage
                  settings. Employees can view their schedule and request time off.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={sending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={sending}>
                  {sending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending invitations */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Pending invitations</CardTitle>
          <CardDescription>
            Team members who haven&apos;t accepted yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInvites ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.filter((i) => i.status === 'pending').length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              No pending invitations
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {invitations
                .filter((i) => i.status === 'pending')
                .map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{inv.email}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge variant="secondary" className="capitalize">
                            {inv.role}
                          </Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Expires{' '}
                            {new Date(inv.expires_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-warning">
                      Pending
                    </Badge>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Accepted invitations history */}
      {invitations.filter((i) => i.status !== 'pending').length > 0 && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Invitation history</CardTitle>
            <CardDescription>Previously sent invitations</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {invitations
                .filter((i) => i.status !== 'pending')
                .map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                        {inv.status === 'accepted' ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{inv.email}</p>
                        <Badge variant="secondary" className="mt-0.5 capitalize">
                          {inv.role}
                        </Badge>
                      </div>
                    </div>
                    <Badge
                      variant={inv.status === 'accepted' ? 'default' : 'outline'}
                    >
                      {inv.status === 'accepted' ? 'Accepted' : 'Declined'}
                    </Badge>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
