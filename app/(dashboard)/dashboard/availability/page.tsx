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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Clock,
  Plus,
  Trash2,
  CalendarDays,
  Repeat,
  CalendarX,
  Save,
  Check,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import type {
  Availability,
  AvailabilityOverride,
  Employee,
} from '@/lib/types';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

type WeeklySlot = {
  day_of_week: number;
  is_available: boolean;
  start_time: string;
  end_time: string;
  dirty: boolean;
};

type OverrideEntry = AvailabilityOverride;

export default function AvailabilityPage() {
  const { profile, restaurant } = useAuthStore();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [weeklySlots, setWeeklySlots] = useState<WeeklySlot[]>([]);
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  type EditingOverride = {
    id?: string;
    date: Date;
    is_available: boolean;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
  };

  const [editingOverride, setEditingOverride] = useState<EditingOverride | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);

  const loadData = useCallback(async () => {
    if (!profile || !restaurant) return;
    const supabase = createClient();

    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (!emp) {
      setLoading(false);
      return;
    }

    setEmployee(emp as Employee);

    const [availRes, overridesRes] = await Promise.all([
      supabase
        .from('availability')
        .select('*')
        .eq('employee_id', emp.id)
        .order('day_of_week', { ascending: true }),
      supabase
        .from('availability_overrides')
        .select('*')
        .eq('employee_id', emp.id)
        .gte('date', format(new Date(), 'yyyy-MM-dd'))
        .order('date', { ascending: true }),
    ]);

    const existing = (availRes.data as Availability[]) ?? [];

    const slots: WeeklySlot[] = DAYS_OF_WEEK.map((d) => {
      const row = existing.find((a) => a.day_of_week === d.value);
      return {
        day_of_week: d.value,
        is_available: row ? row.is_available : false,
        start_time: row?.start_time ?? '09:00',
        end_time: row?.end_time ?? '17:00',
        dirty: false,
      };
    });

    setWeeklySlots(slots);
    setOverrides((overridesRes.data as OverrideEntry[]) ?? []);
    setLoading(false);
  }, [profile, restaurant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Weekly availability handlers ----
  function updateWeeklySlot(
    day: number,
    field: keyof Omit<WeeklySlot, 'dirty'>,
    value: string | boolean
  ) {
    setWeeklySlots((prev) =>
      prev.map((s) =>
        s.day_of_week === day ? { ...s, [field]: value, dirty: true } : s
      )
    );
  }

  async function saveWeekly() {
    if (!employee) return;
    setSavingWeekly(true);
    const supabase = createClient();

    const dirtySlots = weeklySlots.filter((s) => s.dirty);
    let errors = 0;

    for (const slot of dirtySlots) {
      const payload = {
        employee_id: employee.id,
        restaurant_id: employee.restaurant_id,
        day_of_week: slot.day_of_week,
        is_available: slot.is_available,
        start_time: slot.start_time,
        end_time: slot.end_time,
      };

      const { error } = await supabase
        .from('availability')
        .upsert(payload, { onConflict: 'employee_id,day_of_week' });

      if (error) errors++;
    }

    if (errors > 0) {
      toast.error(`Failed to save ${errors} day${errors > 1 ? 's' : ''}`);
    } else {
      toast.success('Weekly availability saved');
      setWeeklySlots((prev) => prev.map((s) => ({ ...s, dirty: false })));
    }
    setSavingWeekly(false);
  }

  // ---- Override handlers ----
  function openNewOverride(date: Date) {
    setEditingOverride({
      date,
      is_available: false,
      start_time: '09:00',
      end_time: '17:00',
      reason: '',
    });
    setOverrideDialogOpen(true);
  }

  function openEditOverride(override: OverrideEntry) {
    setEditingOverride({
      ...override,
      date: parseISO(override.date),
    });
    setOverrideDialogOpen(true);
  }

  async function saveOverride() {
    if (!employee || !editingOverride) return;
    setSavingOverride(true);
    const supabase = createClient();

    const dateStr = format(editingOverride.date, 'yyyy-MM-dd');
    const payload = {
      employee_id: employee.id,
      restaurant_id: employee.restaurant_id,
      date: dateStr,
      is_available: editingOverride.is_available ?? false,
      start_time: editingOverride.is_available
        ? editingOverride.start_time || null
        : null,
      end_time: editingOverride.is_available
        ? editingOverride.end_time || null
        : null,
      reason: editingOverride.reason || null,
    };

    const { data, error } = await supabase
      .from('availability_overrides')
      .upsert(payload, { onConflict: 'employee_id,date' })
      .select()
      .single();

    if (error) {
      toast.error('Failed to save override');
    } else {
      toast.success('Availability override saved');
      setOverrideDialogOpen(false);
      setEditingOverride(null);
      loadData();
    }
    setSavingOverride(false);
  }

  async function deleteOverride(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('availability_overrides')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete override');
    } else {
      toast.success('Override removed');
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    }
  }

  // Calendar day styling: check if date has an override
  function getDateOverride(date: Date): OverrideEntry | undefined {
    const dateStr = format(date, 'yyyy-MM-dd');
    return overrides.find((o) => o.date === dateStr);
  }

  const hasDirty = weeklySlots.some((s) => s.dirty);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!employee) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No employee profile linked</p>
            <p className="text-xs text-muted-foreground">
              Contact your manager to link your account
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Availability</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your weekly availability and temporary changes
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly recurring availability */}
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Repeat className="h-4 w-4 text-primary" />
                  Weekly availability
                </CardTitle>
                <CardDescription>
                  Set your recurring weekly availability schedule
                </CardDescription>
              </div>
              {hasDirty && (
                <Button size="sm" onClick={saveWeekly} disabled={savingWeekly}>
                  {savingWeekly ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <>
                      <Save className="mr-1 h-3.5 w-3.5" />
                      Save changes
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {weeklySlots.map((slot) => {
              const dayInfo = DAYS_OF_WEEK.find(
                (d) => d.value === slot.day_of_week
              )!;
              return (
                <div
                  key={slot.day_of_week}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    slot.is_available
                      ? 'border-border/60 bg-card'
                      : 'border-border/40 bg-muted/30'
                  }`}
                >
                  <div className="w-24 shrink-0">
                    <span className="text-sm font-medium">{dayInfo.label}</span>
                  </div>
                  <Switch
                    checked={slot.is_available}
                    onCheckedChange={(checked) =>
                      updateWeeklySlot(slot.day_of_week, 'is_available', checked)
                    }
                  />
                  {slot.is_available ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        type="time"
                        value={slot.start_time}
                        onChange={(e) =>
                          updateWeeklySlot(
                            slot.day_of_week,
                            'start_time',
                            e.target.value
                          )
                        }
                        className="h-8 w-28 text-xs tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={slot.end_time}
                        onChange={(e) =>
                          updateWeeklySlot(
                            slot.day_of_week,
                            'end_time',
                            e.target.value
                          )
                        }
                        className="h-8 w-28 text-xs tabular-nums"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        <CalendarX className="mr-1 h-3 w-3" />
                        Unavailable
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
            {hasDirty && (
              <p className="pt-2 text-xs text-muted-foreground">
                You have unsaved changes — click &ldquo;Save changes&rdquo; to
                persist them.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Calendar + overrides */}
        <div className="space-y-6">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Temporary changes
              </CardTitle>
              <CardDescription>
                Click a date to add a one-time availability override
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    setSelectedDate(d);
                    if (d) {
                      const existing = getDateOverride(d);
                      if (existing) {
                        openEditOverride(existing);
                      } else {
                        openNewOverride(d);
                      }
                    }
                  }}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date < today;
                  }}
                  modifiers={{
                    hasOverride: (date) => !!getDateOverride(date),
                    unavailable: (date) => {
                      const ov = getDateOverride(date);
                      return ov ? !ov.is_available : false;
                    },
                  }}
                  modifiersClassNames={{
                    hasOverride:
                      'ring-2 ring-primary ring-offset-1 ring-offset-background',
                    unavailable:
                      'after:absolute after:inset-x-1 after:top-1/2 after:h-px after:bg-destructive after:rotate-[-20deg] after:content-[""]',
                  }}
                  className="rounded-lg border border-border/60"
                />
              </div>
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded ring-2 ring-primary ring-offset-1 ring-offset-background" />
                  Has override
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-destructive/20" />
                  Unavailable
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Existing overrides list */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Upcoming overrides</CardTitle>
              <CardDescription>
                {overrides.length} scheduled{' '}
                {overrides.length === 1 ? 'change' : 'changes'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overrides.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No upcoming overrides
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Click a date on the calendar to add one
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {overrides.map((ov) => (
                    <li
                      key={ov.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
                    >
                      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-muted/50 py-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {format(parseISO(ov.date), 'EEE')}
                        </span>
                        <span className="text-lg font-bold tabular-nums">
                          {format(parseISO(ov.date), 'd')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {ov.is_available ? (
                          <div>
                            <Badge
                              variant="outline"
                              className="mb-1 bg-success/10 text-success"
                            >
                              <Check className="mr-1 h-3 w-3" />
                              Available
                            </Badge>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {ov.start_time && ov.end_time
                                ? `${ov.start_time.slice(0, 5)} — ${ov.end_time.slice(0, 5)}`
                                : 'All day'}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <Badge
                              variant="outline"
                              className="mb-1 bg-destructive/10 text-destructive"
                            >
                              <CalendarX className="mr-1 h-3 w-3" />
                              Unavailable
                            </Badge>
                            {ov.reason && (
                              <p className="text-xs text-muted-foreground truncate">
                                {ov.reason}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteOverride(ov.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Override dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingOverride?.id ? 'Edit' : 'Add'} availability override
            </DialogTitle>
            <DialogDescription>
              {editingOverride?.date &&
                format(editingOverride.date, 'EEEE, MMMM d, yyyy')}
            </DialogDescription>
          </DialogHeader>

          {editingOverride && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div>
                  <Label className="text-sm font-medium">
                    Available on this day
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Toggle off to mark the entire day as unavailable
                  </p>
                </div>
                <Switch
                  checked={editingOverride.is_available ?? false}
                  onCheckedChange={(checked) =>
                    setEditingOverride({
                      ...editingOverride,
                      is_available: checked,
                    })
                  }
                />
              </div>

              {editingOverride.is_available && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="start-time" className="text-xs">
                      Available from
                    </Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={editingOverride.start_time ?? '09:00'}
                      onChange={(e) =>
                        setEditingOverride({
                          ...editingOverride,
                          start_time: e.target.value,
                        })
                      }
                      className="tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="end-time" className="text-xs">
                      Available until
                    </Label>
                    <Input
                      id="end-time"
                      type="time"
                      value={editingOverride.end_time ?? '17:00'}
                      onChange={(e) =>
                        setEditingOverride({
                          ...editingOverride,
                          end_time: e.target.value,
                        })
                      }
                      className="tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="reason" className="text-xs">
                  Reason (optional)
                </Label>
                <Input
                  id="reason"
                  placeholder="e.g., Doctor appointment, personal day"
                  value={editingOverride.reason ?? ''}
                  onChange={(e) =>
                    setEditingOverride({
                      ...editingOverride,
                      reason: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOverrideDialogOpen(false);
                setEditingOverride(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveOverride} disabled={savingOverride}>
              {savingOverride ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save override
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
