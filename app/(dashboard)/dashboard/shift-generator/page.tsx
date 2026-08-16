'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wand2,
  Save,
  Trash2,
  ChevronDown,
  Clock,
  Users,
  Calendar,
  Layers,
  Info,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { generateSchedule } from '@/lib/schedule/generator';
import type { GeneratedShift, ShiftGeneratorConfig, Employee } from '@/lib/types';
import type { AvailableEmployee } from '@/lib/schedule/generator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOURS = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, '0')}:00`
);

const DURATIONS = [
  { label: '2 hours', value: 2 },
  { label: '3 hours', value: 3 },
  { label: '4 hours', value: 4 },
  { label: '5 hours', value: 5 },
  { label: '6 hours', value: 6 },
  { label: '7 hours', value: 7 },
  { label: '7.5 hours', value: 7.5 },
  { label: '8 hours', value: 8 },
  { label: '9 hours', value: 9 },
  { label: '10 hours', value: 10 },
  { label: '12 hours', value: 12 },
];

function getWeekOptions() {
  const today = new Date();
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  return Array.from({ length: 8 }, (_, i) => {
    const start = addWeeks(thisMonday, i);
    const end = addDays(start, 6);
    return {
      value: format(start, 'yyyy-MM-dd'),
      label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}${i === 0 ? ' (This week)' : i === 1 ? ' (Next week)' : ''}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfigField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-default" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-[200px]">{hint}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
    </div>
  );
}

type ShiftTableProps = {
  shifts: GeneratedShift[];
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  locationId: string | null;
};

function ShiftTable({ shifts, onSave, saving, saved, locationId }: ShiftTableProps) {
  const byDay = shifts.reduce<Record<string, GeneratedShift[]>>((acc, s) => {
    (acc[s.day_label] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Generated Schedule</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {shifts.length} shift slot{shifts.length !== 1 ? 's' : ''} across{' '}
            {Object.keys(byDay).length} day{Object.keys(byDay).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onClick={onSave}
          disabled={saving || saved || !locationId}
          className="gap-2"
        >
          {saved ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save to Schedule'}
            </>
          )}
        </Button>
      </div>

      {!locationId && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          No location found — shifts will be saved once a location exists.
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(byDay).map(([day, dayShifts]) => {
          const slots = Array.from(new Map(dayShifts.map((s) => [s.time_label, s])).values());
          return (
            <div key={day} className="rounded-lg border border-border/60 overflow-hidden">
              <div className="flex items-center gap-2 bg-muted/40 px-4 py-2.5 border-b border-border/60">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{day}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(dayShifts[0].start_time), 'EEEE, MMM d')}
                </span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {dayShifts.length} slot{dayShifts.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="divide-y divide-border/40">
                {slots.map((slot, i) => {
                  const assigned = dayShifts.filter((s) => s.time_label === slot.time_label);
                  return (
                    <div key={i} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-36 shrink-0">
                        <span className="text-sm font-mono font-medium">{slot.time_label}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {assigned.map((s, j) =>
                          s.employee_name ? (
                            <Badge key={j} variant="outline" className="text-xs font-medium">
                              {s.employee_name}
                            </Badge>
                          ) : (
                            <Badge
                              key={j}
                              variant="outline"
                              className="text-xs text-muted-foreground border-dashed"
                            >
                              Unassigned
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const WEEK_OPTIONS = getWeekOptions();

type FormState = {
  name: string;
  opening_time: string;
  closing_time: string;
  shift_duration_hours: number;
  min_employees_per_shift: number;
  days_of_week: number[];
  target_week_start: string;
};

const DEFAULT_FORM: FormState = {
  name: 'Default Config',
  opening_time: '09:00',
  closing_time: '22:00',
  shift_duration_hours: 8,
  min_employees_per_shift: 2,
  days_of_week: [1, 2, 3, 4, 5],
  target_week_start: WEEK_OPTIONS[1]?.value ?? WEEK_OPTIONS[0]?.value ?? '',
};

export default function ShiftGeneratorPage() {
  const { restaurant } = useAuthStore();
  const supabase = createClient();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [employees, setEmployees] = useState<AvailableEmployee[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<ShiftGeneratorConfig[]>([]);

  const [generatedShifts, setGeneratedShifts] = useState<GeneratedShift[] | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Load employees + location + saved configs
  useEffect(() => {
    if (!restaurant?.id) return;
    (async () => {
      setLoadingData(true);
      const [empResult, locResult, configResult] = await Promise.all([
        supabase
          .from('employees')
          .select('id, full_name, max_weekly_hours')
          .eq('restaurant_id', restaurant.id)
          .eq('is_active', true),
        supabase
          .from('locations')
          .select('id')
          .eq('restaurant_id', restaurant.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('shift_generator_configs')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('updated_at', { ascending: false }),
      ]);
      if (empResult.data) setEmployees(empResult.data);
      if (locResult.data) setLocationId(locResult.data.id);
      if (configResult.data) setSavedConfigs(configResult.data);
      setLoadingData(false);
    })();
  }, [restaurant?.id]);

  const toggleDay = (dow: number) => {
    setSaved(false);
    setGeneratedShifts(null);
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(dow)
        ? f.days_of_week.filter((d) => d !== dow)
        : [...f.days_of_week, dow].sort((a, b) => a - b),
    }));
  };

  const validateConfig = (): string | null => {
    const openH = parseInt(form.opening_time.split(':')[0], 10);
    const closeH = parseInt(form.closing_time.split(':')[0], 10);
    if (closeH <= openH) return 'Closing time must be after opening time.';
    if (form.days_of_week.length === 0) return 'Select at least one day.';
    if (form.shift_duration_hours <= 0) return 'Shift duration must be greater than 0.';
    const windowHours = closeH - openH;
    if (form.shift_duration_hours > windowHours)
      return `Shift duration (${form.shift_duration_hours}h) exceeds the ${windowHours}h operating window.`;
    return null;
  };

  const handleGenerate = useCallback(() => {
    const err = validateConfig();
    if (err) {
      setConfigError(err);
      return;
    }
    setConfigError(null);
    setGenerating(true);
    setSaved(false);

    // Small async tick so React can show loading state
    setTimeout(() => {
      const config: ShiftGeneratorConfig = {
        id: '',
        restaurant_id: restaurant?.id ?? '',
        ...form,
        notes: null,
        created_at: '',
        updated_at: '',
      };
      const shifts = generateSchedule({ config, availableEmployees: employees });
      setGeneratedShifts(shifts);
      setGenerating(false);
    }, 300);
  }, [form, employees, restaurant?.id]);

  const handleSave = async () => {
    if (!restaurant?.id || !locationId || !generatedShifts) return;
    setSaving(true);
    try {
      // Upsert the config
      await supabase.from('shift_generator_configs').upsert(
        {
          restaurant_id: restaurant.id,
          name: form.name,
          opening_time: form.opening_time,
          closing_time: form.closing_time,
          shift_duration_hours: form.shift_duration_hours,
          min_employees_per_shift: form.min_employees_per_shift,
          days_of_week: form.days_of_week,
          target_week_start: form.target_week_start,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,name' }
      );

      // Insert shifts as draft
      const shiftRows = generatedShifts.map((s) => ({
        restaurant_id: restaurant.id,
        location_id: locationId,
        employee_id: s.employee_id,
        title: s.employee_name ? `${s.employee_name} – ${s.time_label}` : `Shift – ${s.time_label}`,
        start_time: s.start_time,
        end_time: s.end_time,
        status: 'draft' as const,
      }));

      await supabase.from('shifts').insert(shiftRows);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const loadConfig = (cfg: ShiftGeneratorConfig) => {
    setForm({
      name: cfg.name,
      opening_time: cfg.opening_time,
      closing_time: cfg.closing_time,
      shift_duration_hours: Number(cfg.shift_duration_hours),
      min_employees_per_shift: cfg.min_employees_per_shift,
      days_of_week: cfg.days_of_week,
      target_week_start: cfg.target_week_start ?? DEFAULT_FORM.target_week_start,
    });
    setGeneratedShifts(null);
    setSaved(false);
    setConfigError(null);
  };

  // Derived preview: how many slots will be generated
  const previewSlots = (() => {
    const openH = parseInt(form.opening_time.split(':')[0], 10);
    const closeH = parseInt(form.closing_time.split(':')[0], 10);
    const windowHours = closeH - openH;
    if (windowHours <= 0 || form.shift_duration_hours <= 0) return 0;
    const slotsPerDay = Math.floor(windowHours / form.shift_duration_hours);
    return slotsPerDay * form.days_of_week.length * form.min_employees_per_shift;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shift Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your operating parameters and generate a draft schedule automatically.
          </p>
        </div>
        {savedConfigs.length > 0 && (
          <Select onValueChange={(id) => { const c = savedConfigs.find((x) => x.id === id); if (c) loadConfig(c); }}>
            <SelectTrigger className="w-52 text-sm">
              <SelectValue placeholder="Load saved config…" />
            </SelectTrigger>
            <SelectContent>
              {savedConfigs.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── Config panel ── */}
        <div className="space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                Define the parameters for schedule generation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Config name */}
              <ConfigField label="Config name" hint="Give this config a name so you can reuse it later.">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Weekday Standard"
                />
              </ConfigField>

              <Separator />

              {/* Target week */}
              <ConfigField label="Target week" hint="Which week this schedule applies to.">
                <Select
                  value={form.target_week_start}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, target_week_start: v }));
                    setGeneratedShifts(null);
                    setSaved(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEK_OPTIONS.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ConfigField>

              <Separator />

              {/* Hours */}
              <div className="grid grid-cols-2 gap-3">
                <ConfigField label="Opening time">
                  <Select
                    value={form.opening_time}
                    onValueChange={(v) => {
                      setForm((f) => ({ ...f, opening_time: v }));
                      setGeneratedShifts(null);
                      setSaved(false);
                    }}
                  >
                    <SelectTrigger>
                      <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ConfigField>
                <ConfigField label="Closing time">
                  <Select
                    value={form.closing_time}
                    onValueChange={(v) => {
                      setForm((f) => ({ ...f, closing_time: v }));
                      setGeneratedShifts(null);
                      setSaved(false);
                    }}
                  >
                    <SelectTrigger>
                      <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ConfigField>
              </div>

              {/* Shift duration */}
              <ConfigField
                label="Shift duration"
                hint="How long each shift slot is. Consecutive non-overlapping slots will fill the operating window."
              >
                <Select
                  value={String(form.shift_duration_hours)}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, shift_duration_hours: Number(v) }));
                    setGeneratedShifts(null);
                    setSaved(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ConfigField>

              {/* Min employees */}
              <ConfigField
                label="Minimum staff per shift"
                hint="How many employees must be assigned to every shift slot."
              >
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        min_employees_per_shift: Math.max(1, f.min_employees_per_shift - 1),
                      }))
                    }
                  >
                    –
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-bold tabular-nums">
                      {form.min_employees_per_shift}
                    </span>
                    <span className="ml-1.5 text-sm text-muted-foreground">
                      {form.min_employees_per_shift === 1 ? 'employee' : 'employees'}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        min_employees_per_shift: f.min_employees_per_shift + 1,
                      }))
                    }
                  >
                    +
                  </Button>
                </div>
              </ConfigField>

              <Separator />

              {/* Days of week */}
              <ConfigField label="Days to schedule">
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      className={cn(
                        'h-9 w-9 rounded-md text-xs font-semibold border transition-colors',
                        form.days_of_week.includes(i)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </ConfigField>

              <Separator />

              {/* Preview pill */}
              <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Estimated slots</span>
                  <span className="font-semibold tabular-nums">{previewSlots}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted-foreground">Available staff</span>
                  <span className="font-semibold tabular-nums">
                    {loadingData ? '…' : employees.length}
                  </span>
                </div>
              </div>

              {configError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {configError}
                </div>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={generating || loadingData}
              >
                <Wand2 className="h-4 w-4" />
                {generating ? 'Generating…' : 'Generate Schedule'}
              </Button>
            </CardContent>
          </Card>

          {/* Engine info card */}
          <Card className="border-border/60 bg-muted/30">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium">Rule-based engine active</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Uses round-robin assignment across available staff. The architecture supports
                swapping in a Google OR-Tools constraint solver for optimal coverage and
                fairness — no UI changes required.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Results panel ── */}
        <div>
          {!generatedShifts && !generating && (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-center p-8">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Wand2 className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base font-semibold">No schedule yet</h3>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
                Configure the parameters on the left and click{' '}
                <span className="font-medium text-foreground">Generate Schedule</span> to see
                the draft shifts here.
              </p>
            </div>
          )}

          {generating && (
            <div className="flex h-full min-h-[400px] items-center justify-center">
              <div className="space-y-3 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Generating shifts…</p>
              </div>
            </div>
          )}

          {generatedShifts && !generating && (
            generatedShifts.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-8 text-center">
                <AlertCircle className="h-8 w-8 text-amber-500 mb-3" />
                <h3 className="text-base font-semibold">No slots generated</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
                  The shift duration may exceed the operating window, or no days are selected.
                </p>
              </div>
            ) : (
              <Card className="border-border/60">
                <CardContent className="p-6">
                  <ShiftTable
                    shifts={generatedShifts}
                    onSave={handleSave}
                    saving={saving}
                    saved={saved}
                    locationId={locationId}
                  />
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}
