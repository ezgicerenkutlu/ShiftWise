/**
 * Rule-based shift generation engine.
 *
 * Architecture is designed so that `generateSchedule` can be replaced by
 * an OR-Tools (or any constraint-solver) implementation without touching the
 * rest of the codebase. The input/output contract is preserved:
 *
 *   Input  → GeneratorInput   (config + available employees per day)
 *   Output → GeneratedShift[] (unassigned or employee-assigned slots)
 *
 * When wiring up OR-Tools:
 *  1. Swap `rulesBasedEngine` for an async call to an Edge Function that wraps the solver.
 *  2. Keep the same GeneratedShift[] output shape so the UI needs no changes.
 */

import { format, startOfDay, startOfWeek } from 'date-fns';
import type { Employee, GeneratedShift, ShiftGeneratorConfig } from '@/lib/types';

export type AvailabilityRule = {
  day_of_week: number;
  is_available: boolean;
  start_time: string;
  end_time: string;
};

export type AvailabilityOverrideRule = {
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type TimeOffRule = {
  start_date: string;
  end_date: string;
  status: string;
};

export type AvailableEmployee = Pick<Employee, 'id' | 'full_name' | 'max_weekly_hours'> & {
  availability?: AvailabilityRule[];
  overrides?: AvailabilityOverrideRule[];
  timeOff?: TimeOffRule[];
};

export type GeneratorInput = {
  config: ShiftGeneratorConfig;
  /** Employees available to be scheduled (pre-filtered by availability/time-off) */
  availableEmployees: AvailableEmployee[];
};

/** Pluggable engine interface — swap for OR-Tools without changing callers. */
export type SchedulingEngine = (input: GeneratorInput) => GeneratedShift[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Given a week start date (Date) and a day-of-week integer (0=Sun, 6=Sat),
 * returns the Date for that day in the target week.
 */
function dayInWeek(weekStart: Date, dayOfWeek: number): Date {
  const sunday = new Date(weekStart);
  // weekStart may be any day; find the preceding Sunday first
  const startDow = sunday.getDay();
  sunday.setDate(sunday.getDate() - startDow);
  const target = new Date(sunday);
  target.setDate(sunday.getDate() + dayOfWeek);
  return target;
}

function formatDateLocal(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function toISOLocal(date: Date, timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const d = startOfDay(date);
  d.setHours(h, m ?? 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Rule-based engine (Phase 1)
// Strategy:
//  1. For every selected day, divide the opening→closing window into
//     fixed-duration slots.
//  2. For each slot, assign `min_employees_per_shift` employees in round-robin
//     order, cycling through the available pool.
//  3. If the pool is smaller than min_employees_per_shift, all employees fill
//     every slot (unassigned extras are left null).
// ---------------------------------------------------------------------------

export const rulesBasedEngine: SchedulingEngine = ({ config, availableEmployees }) => {
  const openMins = timeStringToMinutes(config.opening_time);
  const closeMins = timeStringToMinutes(config.closing_time);
  const durationMins = Math.round(config.shift_duration_hours * 60);

  if (closeMins <= openMins || durationMins <= 0) return [];

  const weekStart = config.target_week_start
    ? new Date(config.target_week_start + 'T00:00:00')
    : startOfWeek(new Date(), { weekStartsOn: 1 });

  const results: GeneratedShift[] = [];

  // Sorted so the output is chronological
  const sortedDays = [...config.days_of_week].sort((a, b) => a - b);

  const weeklyHoursByEmployee = new Map<string, number>();
  let employeeIndex = 0; // round-robin cursor across the whole week

  for (const dow of sortedDays) {
    const dayDate = dayInWeek(weekStart, dow);
    const dayLabel = DAY_NAMES[dow] ?? `Day ${dow}`;

    let slotStart = openMins;
    let slotIndex = 0;

    while (slotStart + durationMins <= closeMins) {
      const slotEnd = slotStart + durationMins;
      const timeLabel = `${minutesToTimeString(slotStart)} – ${minutesToTimeString(slotEnd)}`;

      const shiftDate = formatDateLocal(dayDate);
      const slotStartString = minutesToTimeString(slotStart);
      const slotEndString = minutesToTimeString(slotEnd);
      const assignedThisSlot = new Set<string>();

      for (let seat = 0; seat < config.min_employees_per_shift; seat++) {
        const eligible = availableEmployees.filter((employee) => {
          if (assignedThisSlot.has(employee.id)) return false;
          const hoursAlreadyAssigned = weeklyHoursByEmployee.get(employee.id) ?? 0;
          if (employee.max_weekly_hours != null && hoursAlreadyAssigned + config.shift_duration_hours > employee.max_weekly_hours) return false;
          if ((employee.timeOff ?? []).some((request) =>
            request.status === 'approved' && request.start_date <= shiftDate && request.end_date >= shiftDate
          )) return false;

          const override = (employee.overrides ?? []).find((item) => item.date === shiftDate);
          if (override) {
            if (!override.is_available) return false;
            if (override.start_time && override.end_time &&
              (override.start_time.slice(0, 5) > slotStartString || override.end_time.slice(0, 5) < slotEndString)) return false;
            return true;
          }

          const rules = employee.availability ?? [];
          // Do not assume availability when an employee has no saved weekly rules.
          // A manager should only assign employees to slots they explicitly marked available.
          if (rules.length === 0) return false;
          const rule = rules.find((item) => item.day_of_week === dow);
          if (!rule || !rule.is_available) return false;
          return rule.start_time.slice(0, 5) <= slotStartString && rule.end_time.slice(0, 5) >= slotEndString;
        });

        let emp: AvailableEmployee | null = null;
        if (eligible.length > 0) {
          emp = eligible[employeeIndex % eligible.length];
          employeeIndex++;
          assignedThisSlot.add(emp.id);
          weeklyHoursByEmployee.set(emp.id, (weeklyHoursByEmployee.get(emp.id) ?? 0) + config.shift_duration_hours);
        }

        results.push({
          start_time: toISOLocal(dayDate, slotStartString),
          end_time: toISOLocal(dayDate, slotEndString),
          day_label: dayLabel,
          time_label: timeLabel,
          slot_index: slotIndex,
          employee_id: emp?.id ?? null,
          employee_name: emp?.full_name ?? null,
        });
      }

      slotStart += durationMins;
      slotIndex++;
    }
  }

  return results;
};

// ---------------------------------------------------------------------------
// Public API — callers import this function, not the engine directly.
// Swap `engine` to change solver without touching the page.
// ---------------------------------------------------------------------------

export function generateSchedule(
  input: GeneratorInput,
  engine: SchedulingEngine = rulesBasedEngine
): GeneratedShift[] {
  return engine(input);
}
