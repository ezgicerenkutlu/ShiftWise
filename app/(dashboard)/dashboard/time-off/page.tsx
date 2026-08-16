'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  Check,
  X,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import { format } from 'date-fns';
import type { VacationRequest, Employee, Profile } from '@/lib/types';
import {
  StatCardSkeleton,
  TableSkeleton,
  EmptyState,
  ErrorState,
} from '@/components/ui/states';

type VacationWithEmployee = VacationRequest & {
  employee: Pick<Employee, 'id' | 'full_name' | 'job_title'>;
};

export default function TimeOffPage() {
  const { profile, restaurant } = useAuthStore();
  const supabase = createClient();
  const isManager = profile?.role === 'manager';

  const [requests, setRequests] = useState<VacationWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!restaurant) return;
    setLoading(true);
    setError(false);

    const { data, error: queryError } = await supabase
      .from('vacation_requests')
      .select('*, employee:employees(id, full_name, job_title)')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(true);
      setLoading(false);
      return;
    }

    setRequests((data as VacationWithEmployee[]) ?? []);
    setLoading(false);
  }, [restaurant, supabase]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleAction(id: string, action: 'approved' | 'rejected') {
    if (!profile) return;
    setActingId(id);

    const { error: updateError } = await supabase
      .from('vacation_requests')
      .update({
        status: action,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      toast.error('Failed to update request');
    } else {
      toast.success(
        action === 'approved' ? 'Request approved' : 'Request rejected'
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: action } : r))
      );
    }
    setActingId(null);
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved');
  const rejected = requests.filter((r) => r.status === 'rejected');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Time Off</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isManager
            ? 'Review and approve time-off requests from your team'
            : 'View your time-off requests and their status'}
        </p>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load requests"
          description="We couldn't load the time-off requests. Please try again."
          onRetry={loadRequests}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Pending
                </span>
                <Clock className="h-4 w-4 text-warning" />
              </div>
              <div className="mt-3 text-2xl font-bold tabular-nums">
                {pending.length}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Approved
                </span>
                <Check className="h-4 w-4 text-success" />
              </div>
              <div className="mt-3 text-2xl font-bold tabular-nums">
                {approved.length}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Rejected
                </span>
                <X className="h-4 w-4 text-destructive" />
              </div>
              <div className="mt-3 text-2xl font-bold tabular-nums">
                {rejected.length}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Requests table */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : error ? null : requests.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No time-off requests"
              description="Time-off requests from your team will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="hidden sm:table-cell">Reason</TableHead>
                    <TableHead>Status</TableHead>
                    {isManager && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        {req.employee?.full_name ?? 'Unknown'}
                        {req.employee?.job_title && (
                          <span className="block text-xs text-muted-foreground">
                            {req.employee.job_title}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(req.start_date), 'MMM d')}
                        {' – '}
                        {format(new Date(req.end_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="hidden max-w-[200px] truncate sm:table-cell text-muted-foreground">
                        {req.reason || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.status === 'approved'
                              ? 'default'
                              : req.status === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="capitalize"
                        >
                          {req.status}
                        </Badge>
                      </TableCell>
                      {isManager && (
                        <TableCell className="text-right">
                          {req.status === 'pending' ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAction(req.id, 'approved')}
                                disabled={actingId === req.id}
                                className="gap-1.5 h-8"
                              >
                                {actingId === req.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5 text-success" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAction(req.id, 'rejected')}
                                disabled={actingId === req.id}
                                className="gap-1.5 h-8"
                              >
                                <X className="h-3.5 w-3.5 text-destructive" />
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {req.reviewed_at
                                ? format(new Date(req.reviewed_at), 'MMM d')
                                : '—'}
                            </span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
