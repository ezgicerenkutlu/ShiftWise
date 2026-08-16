'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Clock,
  CalendarDays,
  TrendingUp,
  CalendarCheck,
  Plane,
  Bell,
  CheckCircle2,
  AlertCircle,
  Timer,
  ArrowRight,
  Briefcase,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  format,
  isToday,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  differenceInHours,
  startOfWeek,
  addDays,
} from 'date-fns';
import { initialsFromName, formatTime } from '@/lib/format';
import type {
  Shift,
  Employee,
  Contract,
  VacationRequest,
  Notification,
  Location,
} from '@/lib/types';

type EmployeeDashboardData = {
  employee: Employee | null;
  todayShifts: Shift[];
  upcomingShifts: (Shift & { location: Pick<Location, 'id' | 'name'> | null })[];
  contract: Contract | null;
  monthlyHours: { date: string; hours: number; label: string }[];
  monthlyTotalHours: number;
  attendance: { completed: number; missed: number; upcoming: number; rate: number };
  vacationBalance: {
    totalRequested: number;
    approved: number;
    pending: number;
    rejected: number;
    approvedDays: number;
  };
  notifications: Notification[];
  unreadCount: number;
  weeklyHours: number;
  contractWeeklyHours: number | null;
  contractHoursRemaining: number | null;
};

export function EmployeeDashboard() {
  const { profile, restaurant } = useAuthStore();
  const [data, setData] = useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile || !restaurant) return;
    const supabase = createClient();

    // Find the employee record linked to this profile
    const { data: employee } = await supabase
      .from('employees')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (!employee) {
      setLoading(false);
      return;
    }

    const emp = employee as Employee;
    const now = new Date();

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);

    const [
      todayShiftsRes,
      upcomingShiftsRes,
      monthShiftsRes,
      weekShiftsRes,
      contractRes,
      vacationsRes,
      notificationsRes,
    ] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('restaurant_id', restaurant.id)
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString())
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select('*, location:locations(id, name)')
        .eq('employee_id', emp.id)
        .eq('restaurant_id', restaurant.id)
        .gt('start_time', dayEnd.toISOString())
        .order('start_time', { ascending: true })
        .limit(5),
      supabase
        .from('shifts')
        .select('id, start_time, end_time, status')
        .eq('employee_id', emp.id)
        .eq('restaurant_id', restaurant.id)
        .gte('start_time', monthStart.toISOString())
        .lt('start_time', monthEnd.toISOString())
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select('id, start_time, end_time')
        .eq('employee_id', emp.id)
        .eq('restaurant_id', restaurant.id)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString()),
      supabase
        .from('contracts')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vacation_requests')
        .select('*')
        .eq('employee_id', emp.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const todayShifts = (todayShiftsRes.data as Shift[]) ?? [];
    const upcomingShifts =
      (upcomingShiftsRes.data as EmployeeDashboardData['upcomingShifts']) ?? [];
    const monthShifts = (monthShiftsRes.data as Shift[]) ?? [];
    const weekShifts = (weekShiftsRes.data as Shift[]) ?? [];
    const contract = (contractRes.data as Contract) ?? null;
    const vacations = (vacationsRes.data as VacationRequest[]) ?? [];
    const notifications = (notificationsRes.data as Notification[]) ?? [];

    // Monthly hours by day
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const monthlyHours = monthDays.map((d) => {
      const dayShifts = monthShifts.filter((s) =>
        isSameDay(new Date(s.start_time), d)
      );
      const hours = dayShifts.reduce(
        (sum, s) =>
          sum +
          differenceInHours(new Date(s.end_time), new Date(s.start_time)),
        0
      );
      return {
        date: format(d, 'yyyy-MM-dd'),
        hours,
        label: format(d, 'd'),
      };
    });

    const monthlyTotalHours = monthlyHours.reduce((sum, d) => sum + d.hours, 0);

    // Weekly hours
    const weeklyHours = weekShifts.reduce(
      (sum, s) =>
        sum + differenceInHours(new Date(s.end_time), new Date(s.start_time)),
      0
    );

    // Attendance: completed, missed, upcoming
    const completed = monthShifts.filter((s) => s.status === 'completed').length;
    const missed = monthShifts.filter(
      (s) =>
        s.status !== 'completed' &&
        new Date(s.end_time) < now &&
        s.status !== 'draft'
    ).length;
    const upcoming = monthShifts.filter((s) => new Date(s.start_time) > now).length;
    const totalAttended = completed;
    const totalScheduled = completed + missed;
    const rate = totalScheduled > 0 ? (totalAttended / totalScheduled) * 100 : 100;

    // Vacation balance
    const approved = vacations.filter((v) => v.status === 'approved');
    const approvedDays = approved.reduce((sum, v) => {
      const days =
        Math.ceil(
          (new Date(v.end_date).getTime() - new Date(v.start_date).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;
      return sum + days;
    }, 0);

    const vacationBalance = {
      totalRequested: vacations.length,
      approved: approved.length,
      pending: vacations.filter((v) => v.status === 'pending').length,
      rejected: vacations.filter((v) => v.status === 'rejected').length,
      approvedDays,
    };

    // Contract hours remaining this week
    const contractWeeklyHours = contract?.weekly_hours ?? null;
    const contractHoursRemaining =
      contractWeeklyHours !== null
        ? Math.max(0, contractWeeklyHours - weeklyHours)
        : null;

    setData({
      employee: emp,
      todayShifts,
      upcomingShifts,
      contract,
      monthlyHours,
      monthlyTotalHours,
      attendance: {
        completed,
        missed,
        upcoming,
        rate: Math.round(rate),
      },
      vacationBalance,
      notifications,
      unreadCount: notifications.filter((n) => !n.is_read).length,
      weeklyHours,
      contractWeeklyHours,
      contractHoursRemaining,
    });
    setLoading(false);
  }, [profile, restaurant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function markAllRead() {
    if (!data?.unreadCount) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', profile?.id)
      .eq('is_read', false);

    if (error) {
      toast.error('Failed to mark notifications as read');
      return;
    }

    toast.success('All notifications marked as read');
    loadData();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data?.employee) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No employee profile linked</p>
            <p className="text-xs text-muted-foreground">
              Contact your manager to link your account to an employee record
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hoursChartConfig = {
    hours: { label: 'Hours', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const statCards = [
    {
      label: "Today's shifts",
      value: data.todayShifts.length.toString(),
      icon: Clock,
      hint:
        data.todayShifts.length > 0
          ? `Next at ${formatTime(data.todayShifts[0].start_time)}`
          : 'No shifts today',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'This week',
      value: `${data.weeklyHours}h`,
      icon: CalendarDays,
      hint:
        data.contractWeeklyHours !== null
          ? `${data.contractHoursRemaining}h remaining on contract`
          : 'Hours scheduled',
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'This month',
      value: `${data.monthlyTotalHours}h`,
      icon: TrendingUp,
      hint: `${data.attendance.completed} shifts completed`,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      label: 'Vacation days',
      value: data.vacationBalance.approvedDays.toString(),
      icon: Plane,
      hint: `${data.vacationBalance.pending} pending requests`,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hi, {data.employee.full_name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(), 'EEEE, MMMM d')} —{' '}
            {data.employee.job_title || 'Team member'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/time-off">
            <Plane className="mr-1.5 h-4 w-4" />
            Request time off
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} ${s.color}`}
                >
                  <s.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold tabular-nums">
                {s.value}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's shift + Notifications */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's shift */}
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s shift</CardTitle>
            <CardDescription>
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.todayShifts.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <CalendarCheck className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No shifts today</p>
                  <p className="text-xs text-muted-foreground">
                    Enjoy your day off
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.todayShifts.map((shift) => {
                  const startTime = formatTime(shift.start_time);
                  const endTime = formatTime(shift.end_time);
                  const duration = differenceInHours(
                    new Date(shift.end_time),
                    new Date(shift.start_time)
                  );
                  const isPast = new Date(shift.end_time) < new Date();
                  const isNow =
                    new Date(shift.start_time) <= new Date() &&
                    new Date(shift.end_time) >= new Date();

                  return (
                    <li
                      key={shift.id}
                      className="flex items-center gap-4 rounded-lg border border-border/60 p-4"
                    >
                      <div className="flex w-20 shrink-0 flex-col items-center rounded-lg bg-muted/50 py-2">
                        <span className="text-base font-bold tabular-nums">
                          {startTime}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          to {endTime}
                        </span>
                      </div>
                      <div className="h-12 w-px bg-border" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{shift.title}</p>
                        <div className="mt-1 flex items-center gap-2">
                          {isNow && (
                            <Badge className="bg-success text-success-foreground">
                              In progress
                            </Badge>
                          )}
                          {isPast && (
                            <Badge variant="secondary">Completed</Badge>
                          )}
                          {!isNow && !isPast && (
                            <Badge variant="outline">Upcoming</Badge>
                          )}
                          <Badge variant="outline" className="tabular-nums">
                            {duration}h
                          </Badge>
                        </div>
                        {shift.notes && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {shift.notes}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Notifications</CardTitle>
                <CardDescription>
                  {data.unreadCount > 0
                    ? `${data.unreadCount} unread`
                    : 'All caught up'}
                </CardDescription>
              </div>
              {data.unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Mark all read
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {data.notifications.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <Bell className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No notifications</p>
                  <p className="text-xs text-muted-foreground">
                    You&apos;ll see updates here
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                {data.notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`flex gap-3 rounded-lg p-2.5 transition-colors ${
                      n.is_read ? '' : 'bg-primary/5'
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                        n.is_read ? 'bg-transparent' : 'bg-primary'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.message}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {format(new Date(n.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming shifts + Monthly hours chart */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming shifts */}
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Upcoming shifts</CardTitle>
                <CardDescription>Your next scheduled shifts</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/schedule">
                  View schedule
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {data.upcomingShifts.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No upcoming shifts</p>
                  <p className="text-xs text-muted-foreground">
                    Check back later for new schedules
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {data.upcomingShifts.map((shift) => {
                  const shiftDate = new Date(shift.start_time);
                  const startTime = formatTime(shift.start_time);
                  const endTime = formatTime(shift.end_time);
                  const duration = differenceInHours(
                    new Date(shift.end_time),
                    new Date(shift.start_time)
                  );

                  return (
                    <li
                      key={shift.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-muted/50 py-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {format(shiftDate, 'EEE')}
                        </span>
                        <span className="text-lg font-bold tabular-nums">
                          {format(shiftDate, 'd')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(shiftDate, 'MMM')}
                        </span>
                      </div>
                      <div className="h-10 w-px bg-border" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{shift.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {startTime} — {endTime}
                          {shift.location?.name ? ` · ${shift.location.name}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="tabular-nums">
                        {duration}h
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Monthly hours chart */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Monthly worked hours</CardTitle>
            <CardDescription>
              {format(new Date(), 'MMMM yyyy')} — {data.monthlyTotalHours}h total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={hoursChartConfig}
              className="aspect-[2/1] w-full"
            >
              <AreaChart
                data={data.monthlyHours}
                margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
              >
                <defs>
                  <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-hours)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-hours)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={4}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="var(--color-hours)"
                  fill="url(#hoursGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Contract hours + Attendance + Vacation balance */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contract hours */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Contract hours</CardTitle>
            <CardDescription>
              {data.contract
                ? `${data.contract.contract_type.replace('_', ' ')} contract`
                : 'No active contract'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.contract ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {data.contract.contract_type.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${data.contract.hourly_rate}/hr
                    </p>
                  </div>
                </div>

                {data.contractWeeklyHours !== null && (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Weekly progress
                      </span>
                      <span className="font-medium tabular-nums">
                        {data.weeklyHours}h / {data.contractWeeklyHours}h
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, (data.weeklyHours / data.contractWeeklyHours) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {data.contractHoursRemaining}h remaining this week
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Started</p>
                    <p className="mt-0.5 text-sm font-medium">
                      {format(new Date(data.contract.start_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      {data.contract.end_date ? 'Ends' : 'Status'}
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      {data.contract.end_date
                        ? format(new Date(data.contract.end_date), 'MMM d, yyyy')
                        : 'Active'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
                <Briefcase className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No active contract
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Attendance</CardTitle>
            <CardDescription>This month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">
                      {data.attendance.rate}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attendance rate
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border/60 p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-success">
                    {data.attendance.completed}
                  </p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-destructive">
                    {data.attendance.missed}
                  </p>
                  <p className="text-xs text-muted-foreground">Missed</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-primary">
                    {data.attendance.upcoming}
                  </p>
 <p className="text-xs text-muted-foreground">Upcoming</p>
                </div>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${data.attendance.rate}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vacation balance */}
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Vacation balance</CardTitle>
                <CardDescription>Time off overview</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/time-off">
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plane className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {data.vacationBalance.approvedDays}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Approved days off
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border/60 p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-success">
                    {data.vacationBalance.approved}
                  </p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-warning">
                    {data.vacationBalance.pending}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-destructive">
                    {data.vacationBalance.rejected}
                  </p>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <Link href="/dashboard/time-off">
                  <Plane className="mr-1.5 h-4 w-4" />
                  Request time off
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
