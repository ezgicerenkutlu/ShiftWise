'use client';

import { useAuthStore } from '@/lib/stores/auth-store';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { EmployeeDashboard } from '@/components/dashboard/employee-dashboard';
import { StatCardSkeleton } from '@/components/ui/states';

export default function DashboardPage() {
  const { profile, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="grid gap-6 lg:grid-cols-7">
          <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-card lg:col-span-4" />
          <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-card lg:col-span-3" />
        </div>
      </div>
    );
  }

  if (profile?.role === 'manager') {
    return <ManagerDashboard />;
  }

  return <EmployeeDashboard />;
}
