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
  CalendarDays,
  Users,
  Clock,
  TrendingUp,
  Plus,
  Check,
  X,
  ArrowRight,
  CalendarClock,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import { format, startOfWeek, addDays } from 'date-fns';
import { initialsFromName } from '@/lib/format';
import type { Shift, Employee, VacationRequest, Location } from '@/lib/types';

type DashboardData = {
  todayShifts: (Shift & { employee: Pick<Employee, 'id' | 'full_name' | 'color'> | null })[];
  weekShifts: Shift[];
  employees: Employee[];
  pendingVacations: (VacationRequest & {
    employee: Pick<Employee, 'id' | 'full_name' | 'job_title'>;
  })[];
  locations: Location[];
  weeklyHoursByDay: { day: string; hours: number; shifts: number }[];
  employeeStatus: { scheduled: number; unscheduled: number; total: number };
};

export function ManagerDashboard() {
  const { restaurant, profile } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingOnVacation, setActingOnVacation] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!restaurant) return;
    const supabase = createClient();

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);

    const [
      todayShiftsRes,
      weekShiftsRes,
      employeesRes,
      vacationsRes,
      locationsRes,
    ] = await Promise.all([
      supabase
        .from('shifts')
        .select('*, employee:employees(id, full_name, color)')
        .eq('restaurant_id', restaurant.id)
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString())
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select('id, start_time, end_time, status, employee_id')
        .eq('restaurant_id', restaurant.id)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString())
        .order('start_time', { ascending: true }),
      supabase
        .from('employees')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .order('full_name', { ascending: true }),
      supabase
        .from('vacation_requests')
        .select('*, employee:employees(id, full_name, job_title)')
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('locations')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('name', { ascending: true }),
    ]);

    const todayShifts = (todayShiftsRes.data as DashboardData['todayShifts']) ?? [];
    const weekShifts = (weekShiftsRes.data as Shift[]) ?? [];
    const employees = (employeesRes.data as Employee[]) ?? [];
    const pendingVacations = (vacationsRes.data as DashboardData['pendingVacations']) ?? [];
    const locations = (locationsRes.data as Location[]) ?? [];

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weeklyHoursByDay = dayLabels.map((day) => ({ day, hours: 0, shifts: 0 }));

    weekShifts.forEach((shift) => {
      const shiftDate = new Date(shift.start_time);
      const dayIndex = (shiftDate.getDay() + 6) % 7;
      const duration =
        (new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime()) /
        (1000 * 60 * 60);
      weeklyHoursByDay[dayIndex].hours += duration;
      weeklyHoursByDay[dayIndex].shifts += 1;
    });

    weeklyHoursByDay.forEach((d) => {
      d.hours = Math.round(d.hours * 10) / 10;
    });

    const scheduledEmployeeIds = new Set(
      weekShifts.map((s) => s.employee_id).filter(Boolean)
    );
    const employeeStatus = {
      scheduled: employees.filter((e) => scheduledEmployeeIds.has(e.id)).length,
      unscheduled: employees.filter((e) => !scheduledEmployeeIds.has(e.id)).length,
      total: employees.length,
    };

    setData({ todayShifts, weekShifts, employees, pendingVacations, locations, weeklyHoursByDay, employeeStatus });
    setLoading(false);
  }, [restaurant]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function handleVacationAction(requestId: string, action: 'approved' | 'rejected') {
    if (!profile) return;
    setActingOnVacation(requestId);
    const supabase = createClient();

    const { error } = await supabase
      .from('vacation_requests')
      .update({ status: action, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to update request');
    } else {
      toast.success(action === 'approved' ? 'Vacation request approved' : 'Vacation request rejected');
      loadDashboard();
    }
    setActingOnVacation(null);
  }

  const totalWeekHours = data?.weeklyHoursByDay.reduce((sum, d) => sum + d.hours, 0) ?? 0;
  const totalWeekShifts = data?.weekShifts.length ?? 0;

  const statCards = [
    { label: "Today's shifts", value: loading ? '…' : (data?.todayShifts.length ?? 0).toString(), icon: CalendarClock, hint: `${data?.todayShifts.filter((s) => s.employee_id).length ?? 0} assigned`, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'This week', value: loading ? '…' : totalWeekShifts.toString(), icon: CalendarDays, hint: `${totalWeekHours.toFixed(0)} total hours`, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Team members', value: loading ? '…' : (data?.employeeStatus.total ?? 0).toString(), icon: Users, hint: `${data?.employeeStatus.scheduled ?? 0} scheduled this week`, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Pending requests', value: loading ? '…' : (data?.pendingVacations.length ?? 0).toString(), icon: Clock, hint: 'Vacation approvals', color: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  const hoursChartConfig = { hours: { label: 'Hours', color: 'hsl(var(--primary))' } } satisfies ChartConfig;
  const statusChartConfig = { scheduled: { label: 'Scheduled', color: 'hsl(var(--success))' }, unscheduled: { label: 'Unscheduled', color: 'hsl(var(--muted-foreground))' } } satisfies ChartConfig;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{restaurant ? restaurant.name : 'Dashboard'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''} — {format(new Date(), 'EEEE, MMMM d')}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/schedule">
            <Plus className="mr-1.5 h-4 w-4" />
            Schedule shifts
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} ${s.color}`}>
                  <s.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold tabular-nums">{s.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="border-border/60 lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Weekly labor overview</CardTitle>
            <CardDescription>Hours and shift count by day for this week</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : totalWeekShifts === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No shifts this week</p>
                  <p className="text-xs text-muted-foreground">Schedule shifts to see labor distribution</p>
                </div>
                <Button size="sm" asChild>
                  <Link href="/dashboard/schedule"><Plus className="mr-1.5 h-3.5 w-3.5" />Schedule shifts</Link>
                </Button>
              </div>
            ) : (
              <ChartContainer config={hoursChartConfig} className="aspect-[2/1] w-full">
                <BarChart data={data?.weeklyHoursByDay} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="hours" fill="var(--color-hours)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Team coverage</CardTitle>
            <CardDescription>Scheduled vs. unscheduled this week</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : data?.employeeStatus.total === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <Users className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No team members yet</p>
                  <p className="text-xs text-muted-foreground">Invite employees to your workspace</p>
                </div>
                <Button size="sm" asChild>
                  <Link href="/dashboard/employees"><Plus className="mr-1.5 h-3.5 w-3.5" />Invite member</Link>
                </Button>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <ChartContainer config={statusChartConfig} className="aspect-square mx-auto max-h-[180px]">
                  <BarChart data={[{ name: 'Coverage', scheduled: data?.employeeStatus.scheduled ?? 0, unscheduled: data?.employeeStatus.unscheduled ?? 0 }]} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={false} width={0} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="scheduled" fill="var(--color-scheduled)" radius={[0, 4, 4, 0]} stackId="a" maxBarSize={28} />
                    <Bar dataKey="unscheduled" fill="var(--color-unscheduled)" radius={[0, 4, 4, 0]} stackId="a" maxBarSize={28} />
                  </BarChart>
                </ChartContainer>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-sm bg-success" />
                      <span className="text-xs text-muted-foreground">Scheduled</span>
                    </div>
                    <p className="mt-1 text-xl font-bold tabular-nums">{data?.employeeStatus.scheduled ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />
                      <span className="text-xs text-muted-foreground">Unscheduled</span>
                    </div>
                    <p className="mt-1 text-xl font-bold tabular-nums">{data?.employeeStatus.unscheduled ?? 0}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Today&apos;s shifts</CardTitle>
                <CardDescription>{format(new Date(), 'EEEE, MMMM d')}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/schedule">View schedule<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : !data?.todayShifts.length ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <CalendarClock className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No shifts today</p>
                  <p className="text-xs text-muted-foreground">There are no shifts scheduled for today</p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {data.todayShifts.map((shift) => {
                  const startTime = format(new Date(shift.start_time), 'h:mm a');
                  const endTime = format(new Date(shift.end_time), 'h:mm a');
                  const duration = (new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime()) / (1000 * 60 * 60);
                  return (
                    <li key={shift.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-accent/50">
                      <div className="flex w-16 shrink-0 flex-col items-center">
                        <span className="text-sm font-semibold tabular-nums">{startTime}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{endTime}</span>
                      </div>
                      <div className="h-10 w-px bg-border" />
                      <div className="flex flex-1 items-center gap-3">
                        {shift.employee ? (
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs font-medium" style={shift.employee.color ? { backgroundColor: shift.employee.color + '20' } : undefined}>
                              {initialsFromName(shift.employee.full_name)}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{shift.employee ? shift.employee.full_name : 'Unassigned'}</p>
                          <p className="text-xs text-muted-foreground">{shift.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="tabular-nums">{duration.toFixed(1)}h</Badge>
                        <Badge variant={shift.status === 'published' ? 'default' : shift.status === 'confirmed' ? 'secondary' : 'outline'} className="capitalize">{shift.status}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Pending requests</CardTitle>
                <CardDescription>Vacation approvals</CardDescription>
              </div>
              {data && data.pendingVacations.length > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/dashboard/time-off">View all<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : !data?.pendingVacations.length ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <Check className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">All caught up</p>
                  <p className="text-xs text-muted-foreground">No pending vacation requests</p>
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.pendingVacations.map((req) => (
                  <li key={req.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                          {initialsFromName(req.employee.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{req.employee.full_name}</p>
                        {req.employee.job_title && <p className="text-xs text-muted-foreground">{req.employee.job_title}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">{format(new Date(req.start_date), 'MMM d')} — {format(new Date(req.end_date), 'MMM d')}</p>
                        {req.reason && <p className="mt-1.5 text-xs italic text-muted-foreground">&ldquo;{req.reason}&rdquo;</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="default" className="flex-1" disabled={actingOnVacation === req.id} onClick={() => handleVacationAction(req.id, 'approved')}>
                        {actingOnVacation === req.id ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" /> : <><Check className="mr-1 h-3.5 w-3.5" />Approve</>}
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" disabled={actingOnVacation === req.id} onClick={() => handleVacationAction(req.id, 'rejected')}>
                        <X className="mr-1 h-3.5 w-3.5" />Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Team members</CardTitle>
              <CardDescription>
                {data?.employees.length ?? 0} active {data?.employees.length === 1 ? 'member' : 'members'}
                {data?.locations.length ? ` across ${data.locations.length} ${data.locations.length === 1 ? 'location' : 'locations'}` : ''}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/employees">View all<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !data?.employees.length ? (
            <div className="flex h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
              <UserCheck className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">No team members yet</p>
                <p className="text-xs text-muted-foreground">Invite employees to get started</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.employees.slice(0, 8).map((emp) => {
                const hasShiftsThisWeek = data.weekShifts.some((s) => s.employee_id === emp.id);
                return (
                  <div key={emp.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs font-medium" style={emp.color ? { backgroundColor: emp.color + '20' } : undefined}>
                        {initialsFromName(emp.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{emp.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{emp.job_title || 'Staff member'}</p>
                    </div>
                    {hasShiftsThisWeek && <div className="h-2 w-2 shrink-0 rounded-full bg-success" title="Scheduled this week" />}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
