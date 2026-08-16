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

import { startOfDay, startOfWeek } from 'date-fns';
import type { Employee, GeneratedShift, ShiftGeneratorConfig } from '@/lib/types';

export type AvailableEmployee = Pick<Employee, 'id' | 'full_name' | 'max_weekly_hours'>;

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

  let employeeIndex = 0; // round-robin cursor across the whole week

  for (const dow of sortedDays) {
    const dayDate = dayInWeek(weekStart, dow);
    const dayLabel = DAY_NAMES[dow] ?? `Day ${dow}`;

    let slotStart = openMins;
    let slotIndex = 0;

    while (slotStart + durationMins <= closeMins) {
      const slotEnd = slotStart + durationMins;
      const timeLabel = `${minutesToTimeString(slotStart)} – ${minutesToTimeString(slotEnd)}`;

      for (let seat = 0; seat < config.min_employees_per_shift; seat++) {
        const emp = availableEmployees.length > 0
          ? availableEmployees[employeeIndex % availableEmployees.length]
          : null;

        results.push({
          start_time: toISOLocal(dayDate, minutesToTimeString(slotStart)),
          end_time: toISOLocal(dayDate, minutesToTimeString(slotEnd)),
          day_label: dayLabel,
          time_label: timeLabel,
          slot_index: slotIndex,
          employee_id: emp?.id ?? null,
          employee_name: emp?.full_name ?? null,
        });

        if (availableEmployees.length > 0) employeeIndex++;
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
