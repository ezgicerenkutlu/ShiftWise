'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type NavigateAction,
  type View,
  type SlotInfo,
} from 'react-big-calendar';
import withDragAndDrop, { type withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay, differenceInMinutes } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import type { Employee, Shift, ShiftStatus, CalendarEvent } from '@/lib/types';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Copy,
  User,
  MoreVertical,
  Loader2,
  Download,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
} from 'lucide-react';
import { exportCSV, exportExcel, exportPDF, exportPNG, type ExportFormat } from '@/lib/export/schedule-export';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { 'en-US': enUS },
});

const messages = {
  next: 'Next',
  previous: 'Back',
  today: 'Today',
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
  date: 'Date',
  time: 'Time',
  event: 'Event',
  noEventsInRange: 'No shifts scheduled in this range.',
};

const STATUS_COLORS: Record<ShiftStatus, string> = {
  draft: '#94a3b8',
  published: '#22c55e',
  confirmed: '#3b82f6',
  completed: '#a78bfa',
};

const STATUS_LABELS: Record<ShiftStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  confirmed: 'Confirmed',
  completed: 'Completed',
};

function shiftToEvent(s: Shift, employees: Employee[]): CalendarEvent {
  const emp = employees.find((e) => e.id === s.employee_id);
  return {
    id: s.id,
    title: emp ? `${emp.full_name} – ${s.title}` : s.title,
    start: new Date(s.start_time),
    end: new Date(s.end_time),
    resource: {
      employeeId: s.employee_id ?? undefined,
      locationId: s.location_id,
      status: s.status,
      color: emp?.color ?? STATUS_COLORS[s.status],
    },
  };
}

// ---------------------------------------------------------------------------
// Drag-and-drop calendar
// ---------------------------------------------------------------------------

const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar);

// ---------------------------------------------------------------------------
// Custom Toolbar
// ---------------------------------------------------------------------------

type CustomToolbarProps = {
  label: string;
  onNavigate: (action: NavigateAction, date?: Date) => void;
  onView: (view: View) => void;
} & {
  view: View;
  onAddShift: () => void;
  isManager: boolean;
};

function CustomToolbar({
  label,
  onNavigate,
  onView,
  view,
  onAddShift,
  isManager,
}: CustomToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate('TODAY')}>
          Today
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate('PREV')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate('NEXT')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-sm font-semibold">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onView(v)}
              className={cn('h-7 px-3 text-xs capitalize', view === v && 'shadow-sm')}
            >
              {v}
            </Button>
          ))}
        </div>
        {isManager && (
          <Button size="sm" onClick={onAddShift} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add shift
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Event Wrapper
// ---------------------------------------------------------------------------

type CustomEventWrapperProps = {
  event: CalendarEvent;
  children?: React.ReactNode;
} & {
  isManager: boolean;
  onEventClick: (e: CalendarEvent) => void;
  onEventDuplicate: (e: CalendarEvent) => void;
  onEventDelete: (e: CalendarEvent) => void;
};

function CustomEventWrapper({
  event,
  children,
  isManager,
  onEventClick,
  onEventDuplicate,
  onEventDelete,
}: CustomEventWrapperProps) {
  const color = event.resource?.color ?? STATUS_COLORS[event.resource?.status ?? 'draft'];
  return (
    <div
      className="group relative h-full w-full cursor-pointer overflow-hidden rounded-md"
      style={{ borderLeft: `3px solid ${color}` }}
      onClick={() => onEventClick(event)}
    >
      {children}
      {isManager && (
        <div className="absolute right-0 top-0 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-5 w-5 items-center justify-center rounded-bl bg-background/80 hover:bg-background"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEventClick(event)}>
                <User className="mr-2 h-3.5 w-3.5" /> Edit / Assign
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEventDuplicate(event)}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onEventDelete(event)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const { profile, restaurant } = useAuthStore();
  const supabase = createClient();
  const isManager = profile?.role === 'manager';

  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit/Create dialog
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editEmployee, setEditEmployee] = useState<string>('none');
  const [editStatus, setEditStatus] = useState<ShiftStatus>('draft');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!restaurant?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [shiftRes, empRes, locRes] = await Promise.all([
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
          .from('locations')
          .select('id')
          .eq('restaurant_id', restaurant.id)
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (shiftRes.data) setShifts(shiftRes.data as Shift[]);
      if (empRes.data) setEmployees(empRes.data as Employee[]);
      if (locRes.data) setLocationId(locRes.data.id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!restaurant?.id) return;
    const channel = supabase
      .channel('shifts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts', filter: `restaurant_id=eq.${restaurant.id}` },
        () => {
          supabase
            .from('shifts')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .order('start_time', { ascending: true })
            .then(({ data }: { data: Shift[] | null }) => {
              if (data) setShifts(data as Shift[]);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  const events = useMemo(
    () => shifts.map((s) => shiftToEvent(s, employees)),
    [shifts, employees]
  );

  // -------------------------------------------------------------------------
  // CRUD helpers
  // -------------------------------------------------------------------------

  const updateShiftInDb = useCallback(
    async (id: string, updates: Partial<Shift>) => {
      const { error } = await supabase
        .from('shifts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        toast.error('Failed to save shift changes');
        return false;
      }
      setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
      return true;
    },
    [supabase]
  );

  const insertShiftToDb = useCallback(
    async (shift: Omit<Shift, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('shifts').insert(shift).select().single();
      if (error || !data) {
        toast.error('Failed to create shift');
        return null;
      }
      setShifts((prev) =>
        [...prev, data as Shift].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )
      );
      return data as Shift;
    },
    [supabase]
  );

  const deleteShiftFromDb = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('shifts').delete().eq('id', id);
      if (error) {
        toast.error('Failed to delete shift');
        return false;
      }
      setShifts((prev) => prev.filter((s) => s.id !== id));
      return true;
    },
    [supabase]
  );

  // -------------------------------------------------------------------------
  // Drag & Drop + Resize handlers
  // -------------------------------------------------------------------------

  const handleEventDrop = useCallback(
    async ({ event, start, end }: { event: CalendarEvent; start: Date | string; end: Date | string }) => {
      if (!isManager) return;
      const newStart = new Date(start);
      const oldDuration = differenceInMinutes(event.end, event.start);
      const newEnd = end instanceof Date && end.getTime() !== newStart.getTime()
        ? new Date(end)
        : new Date(newStart.getTime() + oldDuration * 60000);
      const success = await updateShiftInDb(event.id, {
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
      });
      if (success) toast.success('Shift moved');
    },
    [isManager, updateShiftInDb]
  );

  const handleEventResize = useCallback(
    async ({ event, start, end }: { event: CalendarEvent; start: Date | string; end: Date | string }) => {
      if (!isManager) return;
      const success = await updateShiftInDb(event.id, {
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
      });
      if (success) toast.success('Shift resized');
    },
    [isManager, updateShiftInDb]
  );

  // -------------------------------------------------------------------------
  // Slot select (create new shift)
  // -------------------------------------------------------------------------

  const handleSelectSlot = useCallback(
    (slotInfo: SlotInfo) => {
      if (!isManager || !restaurant?.id || !locationId) return;
      openCreateDialog(slotInfo.start as Date, slotInfo.end as Date);
    },
    [isManager, restaurant?.id, locationId]
  );

  // -------------------------------------------------------------------------
  // Dialog helpers
  // -------------------------------------------------------------------------

  const openCreateDialog = (start: Date, end: Date) => {
    setEditingEvent(null);
    setEditTitle('New Shift');
    setEditEmployee('none');
    setEditStatus('draft');
    setEditStart(formatLocalDateTime(start));
    setEditEnd(formatLocalDateTime(end));
    setDialogOpen(true);
  };

  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    const cleanTitle = event.title.includes('–')
      ? event.title.split('–').slice(1).join('–').trim()
      : event.title;
    setEditTitle(cleanTitle);
    setEditEmployee(event.resource?.employeeId ?? 'none');
    setEditStatus(event.resource?.status ?? 'draft');
    setEditStart(formatLocalDateTime(event.start));
    setEditEnd(formatLocalDateTime(event.end));
    setDialogOpen(true);
  };

  const handleSaveDialog = async () => {
    if (!restaurant?.id || !locationId) return;
    setSaving(true);

    const start = new Date(editStart);
    const end = new Date(editEnd);
    if (end <= start) {
      toast.error('End time must be after start time');
      setSaving(false);
      return;
    }

    const empId = editEmployee === 'none' ? null : editEmployee;

    if (editingEvent) {
      const success = await updateShiftInDb(editingEvent.id, {
        title: editTitle,
        employee_id: empId,
        status: editStatus,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      if (success) toast.success('Shift updated');
    } else {
      await insertShiftToDb({
        restaurant_id: restaurant.id,
        location_id: locationId,
        employee_id: empId,
        title: editTitle,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: editStatus,
        notes: null,
      });
      toast.success('Shift created');
    }

    setSaving(false);
    setDialogOpen(false);
  };

  const handleDuplicate = async (event: CalendarEvent) => {
    if (!restaurant?.id || !locationId) return;
    const cleanTitle = event.title.includes('–')
      ? event.title.split('–').slice(1).join('–').trim()
      : event.title;
    await insertShiftToDb({
      restaurant_id: restaurant.id,
      location_id: locationId,
      employee_id: event.resource?.employeeId ?? null,
      title: cleanTitle,
      start_time: event.start.toISOString(),
      end_time: event.end.toISOString(),
      status: 'draft',
      notes: null,
    });
    toast.success('Shift duplicated');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const success = await deleteShiftFromDb(deleteId);
    if (success) toast.success('Shift deleted');
    setDeleteId(null);
  };

  // -------------------------------------------------------------------------
  // DnD props
  // -------------------------------------------------------------------------

  const dndProps: withDragAndDropProps<CalendarEvent> = {
    draggableAccessor: () => isManager,
    resizableAccessor: () => isManager,
    onEventDrop: handleEventDrop as withDragAndDropProps<CalendarEvent>['onEventDrop'],
    onEventResize: handleEventResize as withDragAndDropProps<CalendarEvent>['onEventResize'],
  };

  // -------------------------------------------------------------------------
  // Export handler
  // -------------------------------------------------------------------------

  const handleExport = async (format: ExportFormat) => {
    if (!shifts.length) {
      toast.error('No shifts to export');
      return;
    }
    const restaurantName = restaurant?.name ?? 'Schedule';
    setExporting(format);
    try {
      switch (format) {
        case 'csv':
          exportCSV(shifts, employees, restaurantName, date);
          break;
        case 'excel':
          await exportExcel(shifts, employees, restaurantName, date);
          break;
        case 'pdf':
          await exportPDF(shifts, employees, restaurantName, date);
          break;
        case 'png':
          await exportPNG(shifts, employees, restaurantName, date);
          break;
      }
      toast.success(`Schedule exported as ${format.toUpperCase()}`);
    } catch {
      toast.error(`Failed to export as ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isManager
              ? 'Drag to move, drag edges to resize, click to edit or assign'
              : 'View the upcoming schedule'}
          </p>
        </div>
        {isManager && !loading && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!!exporting}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('pdf')} className="gap-2">
                <FileText className="h-4 w-4 text-rose-500" />
                PDF Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('excel')} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                Excel Spreadsheet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')} className="gap-2">
                <FileIcon className="h-4 w-4 text-blue-500" />
                CSV File
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport('png')} className="gap-2">
                <ImageIcon className="h-4 w-4 text-violet-500" />
                PNG Image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs font-medium text-muted-foreground">Status:</span>
        {(Object.keys(STATUS_COLORS) as ShiftStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[s] }}
            />
            <span className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          {loading ? (
            <div className="flex h-[70vh] min-h-[500px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="h-[70vh] min-h-[500px]">
              <DnDCalendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                view={view}
                onView={(v) => setView(v)}
                date={date}
                onNavigate={(d) => setDate(d)}
                messages={messages}
                selectable={isManager}
                popup
                {...dndProps}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={openEditDialog}
                components={{
                  toolbar: (props: { label: string; onNavigate: (action: NavigateAction, date?: Date) => void; onView: (view: View) => void }) => (
                    <CustomToolbar
                      {...props}
                      view={view}
                      onAddShift={() => {
                        const start = new Date();
                        start.setHours(9, 0, 0, 0);
                        const end = new Date(start);
                        end.setHours(start.getHours() + 4);
                        openCreateDialog(start, end);
                      }}
                      isManager={isManager}
                    />
                  ),
                  eventWrapper: (props: { event: CalendarEvent; children?: React.ReactNode }) => (
                    <CustomEventWrapper
                      {...props}
                      isManager={isManager}
                      onEventClick={openEditDialog}
                      onEventDuplicate={handleDuplicate}
                      onEventDelete={(e) => setDeleteId(e.id)}
                    />
                  ),
                }}
                eventPropGetter={(event) => ({
                  style: {
                    backgroundColor: (event.resource?.color ?? STATUS_COLORS.draft) + '20',
                    border: 'none',
                    color: 'inherit',
                    fontSize: '0.75rem',
                    padding: 0,
                  },
                })}
                dayPropGetter={(d) => ({
                  style: {
                    backgroundColor:
                      d.getDay() === 0 || d.getDay() === 6
                        ? 'hsl(var(--muted) / 0.3)'
                        : undefined,
                  },
                })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit shift' : 'New shift'}</DialogTitle>
            <DialogDescription>
              {editingEvent
                ? 'Update the shift details, assign an employee, or change its status.'
                : 'Create a new shift. Select a time range and assign an employee.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="shift-title">Shift title</Label>
              <Input
                id="shift-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Lunch Rush"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assigned employee</Label>
              <Select value={editEmployee} onValueChange={setEditEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                      {emp.job_title ? ` — ${emp.job_title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="shift-start">Start</Label>
                <Input
                  id="shift-start"
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-end">End</Label>
                <Input
                  id="shift-end"
                  type="datetime-local"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ShiftStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as ShiftStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[s] }}
                        />
                        {STATUS_LABELS[s]}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editingEvent && (
              <>
                <Button
                  variant="outline"
                  className="gap-1.5 mr-auto"
                  onClick={() => {
                    setDialogOpen(false);
                    handleDuplicate(editingEvent);
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </Button>
                <Button
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => {
                    setDialogOpen(false);
                    setDeleteId(editingEvent.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDialog} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingEvent ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The shift will be removed from the schedule
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
