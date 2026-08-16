'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ZAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, DollarSign, Clock, Users, AlertTriangle, Scale, BatteryLow, Activity } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { computeAnalytics, type AnalyticsData } from '@/lib/analytics/compute';
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Employee, Shift, Contract, RestaurantSettings } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  'hsl(221 83% 53%)',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(340 75% 55%)',
  'hsl(199 89% 48%)',
  'hsl(262 83% 58%)',
  'hsl(0 72% 51%)',
];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
};

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

type SummaryCardProps = {
  label: string;
  value: string;
  icon: React.ReactNode;
  accentClass: string;
  hint?: string;
};

function SummaryCard({ label, value, icon, accentClass, hint }: SummaryCardProps) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', accentClass)}>
            {icon}
          </div>
        </div>
        <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chart Card wrapper
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  description,
  icon,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('border-border/60', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border/50">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { restaurant } = useAuthStore();
  const supabase = createClient();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [referenceWeek, setReferenceWeek] = useState(new Date());

  useEffect(() => {
    if (!restaurant?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [shiftRes, empRes, contractRes, settingsRes] = await Promise.all([
        supabase
          .from('shifts')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('start_time', { ascending: true }),
        supabase
          .from('employees')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('is_active', true),
        supabase
          .from('contracts')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('status', 'active'),
        supabase
          .from('restaurant_settings')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (shiftRes.data) setShifts(shiftRes.data as Shift[]);
      if (empRes.data) setEmployees(empRes.data as Employee[]);
      if (contractRes.data) setContracts(contractRes.data as Contract[]);
      if (settingsRes.data) setSettings(settingsRes.data as RestaurantSettings);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  const data: AnalyticsData | null = useMemo(() => {
    if (loading || !shifts.length) return null;
    return computeAnalytics({
      shifts,
      employees,
      contracts,
      settings,
      referenceWeek,
    });
  }, [shifts, employees, contracts, settings, loading, referenceWeek]);

  const weekStart = startOfWeek(referenceWeek, { weekStartsOn: 1 });
  const weekEnd = addWeeks(weekStart, 0);
  // end of this week = start + 6 days
  const weekEndDate = new Date(weekStart.getTime() + 6 * 86400000);
  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEndDate, 'MMM d, yyyy')}`;

  const hasData = data && employees.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Labor cost, coverage, and scheduling insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setReferenceWeek((d) => subWeeks(d, 1))}
          >
            ←
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReferenceWeek(new Date())}>
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setReferenceWeek((d) => addWeeks(d, 1))}
          >
            →
          </Button>
          <span className="ml-2 text-sm font-medium text-muted-foreground">{weekLabel}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasData ? (
        <Card className="border-border/60">
          <CardContent className="flex h-[50vh] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Activity className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-base font-semibold">No analytics yet</h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">
              Once you have employees and scheduled shifts, your labor cost, coverage, fairness,
              and fatigue metrics will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <SummaryCard
              label="Scheduled hours"
              value={data.summary.totalScheduledHours.toFixed(1)}
              icon={<Clock className="h-4 w-4 text-blue-500" />}
              accentClass="bg-blue-500/10"
              hint="This week"
            />
            <SummaryCard
              label="Labor cost"
              value={`$${data.summary.estimatedLaborCost.toFixed(0)}`}
              icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
              accentClass="bg-emerald-500/10"
              hint="Estimated"
            />
            <SummaryCard
              label="Coverage gaps"
              value={String(data.summary.coverageGaps)}
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              accentClass="bg-amber-500/10"
              hint="Hours uncovered"
            />
            <SummaryCard
              label="Fairness score"
              value={`${data.summary.fairnessScore}/100`}
              icon={<Scale className="h-4 w-4 text-violet-500" />}
              accentClass="bg-violet-500/10"
              hint="Hours distribution"
            />
            <SummaryCard
              label="Avg utilization"
              value={`${data.summary.avgUtilization.toFixed(1)}%`}
              icon={<TrendingUp className="h-4 w-4 text-cyan-500" />}
              accentClass="bg-cyan-500/10"
              hint="Of max capacity"
            />
            <SummaryCard
              label="Avg fatigue"
              value={`${data.summary.avgFatigueIndex.toFixed(1)}`}
              icon={<BatteryLow className="h-4 w-4 text-rose-500" />}
              accentClass="bg-rose-500/10"
              hint="0–100 scale"
            />
          </div>

          {/* Row 1: Labor cost trend + Hours per employee */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Labor Cost Trend"
              description="Daily labor cost and hours for the selected week"
              icon={<DollarSign className="h-4 w-4" />}
            >
              {data.laborCostTrend.every((p) => p.cost === 0) ? (
                <EmptyChart message="No shifts with assigned employees this week." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.laborCostTrend}>
                    <defs>
                      <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area
                      type="monotone"
                      dataKey="cost"
                      stroke={CHART_COLORS[0]}
                      strokeWidth={2}
                      fill="url(#costGradient)"
                      name="Cost ($)"
                    />
                    <Line type="monotone" dataKey="hours" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} name="Hours" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Hours per Employee"
              description="Scheduled hours vs. contracted maximum"
              icon={<Users className="h-4 w-4" />}
            >
              {data.hoursPerEmployee.length === 0 ? (
                <EmptyChart message="No active employees found." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.hoursPerEmployee} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={90}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="hours" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} name="Scheduled hours" />
                    <Bar dataKey="maxHours" fill={CHART_COLORS[3]} fillOpacity={0.3} radius={[0, 4, 4, 0]} name="Max hours" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Row 2: Coverage + Fairness */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Coverage"
              description="Scheduled vs. required staff per day"
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              {data.coverage.every((p) => p.scheduled === 0) ? (
                <EmptyChart message="No shifts scheduled this week." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.coverage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="required" fill={CHART_COLORS[3]} fillOpacity={0.3} radius={[4, 4, 0, 0]} name="Required" />
                    <Bar dataKey="scheduled" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Scheduled" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Fairness Score"
              description="Hours deviation from the team average"
              icon={<Scale className="h-4 w-4" />}
            >
              {data.fairness.length === 0 ? (
                <EmptyChart message="No employee data." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.fairness}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="hours" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Hours" />
                    <Bar dataKey="deviation" radius={[4, 4, 0, 0]} name="Deviation from avg">
                      {data.fairness.map((entry, i) => (
                        <Cell key={i} fill={entry.deviation >= 0 ? CHART_COLORS[1] : CHART_COLORS[5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Row 3: Utilization (radar) + Fatigue (scatter) */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Employee Utilization"
              description="Percentage of contracted hours used"
              icon={<TrendingUp className="h-4 w-4" />}
            >
              {data.utilization.length === 0 ? (
                <EmptyChart message="No employee data." />
              ) : data.utilization.length === 1 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.utilization}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="utilization" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Utilization %" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={data.utilization}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Radar
                      name="Utilization %"
                      dataKey="utilization"
                      stroke={CHART_COLORS[0]}
                      fill={CHART_COLORS[0]}
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Fatigue Index"
              description="Consecutive days vs. short rest periods"
              icon={<BatteryLow className="h-4 w-4" />}
            >
              {data.fatigue.length === 0 || data.fatigue.every((f) => f.fatigueIndex === 0) ? (
                <EmptyChart message="No fatigue patterns detected this week." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="consecutiveDays"
                      name="Consecutive days"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="number"
                      dataKey="shortRests"
                      name="Short rests"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ZAxis type="number" dataKey="fatigueIndex" range={[60, 400]} name="Fatigue" />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ strokeDasharray: '3 3' }}
                    />
                    <Scatter name="Employees" data={data.fatigue}>
                      {data.fatigue.map((entry, i) => {
                        const color =
                          entry.fatigueIndex >= 60
                            ? CHART_COLORS[5]
                            : entry.fatigueIndex >= 30
                            ? CHART_COLORS[2]
                            : CHART_COLORS[1];
                        return <Cell key={i} fill={color} />;
                      })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Row 4: Weekly + Monthly staffing cost */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Weekly Staffing Cost"
              description="Labor cost breakdown per day"
              icon={<DollarSign className="h-4 w-4" />}
            >
              {data.weeklyStaffingCost.every((p) => p.cost === 0) ? (
                <EmptyChart message="No cost data this week." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.weeklyStaffingCost}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="cost" radius={[4, 4, 0, 0]} name="Cost ($)">
                      {data.weeklyStaffingCost.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Monthly Staffing Cost"
              description="Labor cost per week for the current month"
              icon={<DollarSign className="h-4 w-4" />}
            >
              {data.monthlyStaffingCost.every((p) => p.cost === 0) ? (
                <EmptyChart message="No cost data this month." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.monthlyStaffingCost}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      stroke={CHART_COLORS[0]}
                      strokeWidth={2}
                      dot={{ r: 5, fill: CHART_COLORS[0] }}
                      activeDot={{ r: 7 }}
                      name="Cost ($)"
                    />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      stroke={CHART_COLORS[1]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Hours"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
