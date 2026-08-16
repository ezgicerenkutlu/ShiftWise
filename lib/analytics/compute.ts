/**
 * Analytics computation engine.
 *
 * Pure functions that turn raw shifts + employees + contracts + settings into
 * chart-ready datasets. Kept separate from the UI so the same logic can be
 * reused server-side (e.g. in an Edge Function for PDF exports) later.
 */

import {
  differenceInMinutes,
  format,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
} from 'date-fns';
import type {
  Employee,
  Shift,
  Contract,
  RestaurantSettings,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Types — chart-ready datasets
// ---------------------------------------------------------------------------

export type SummaryStats = {
  totalScheduledHours: number;
  estimatedLaborCost: number;
  coverageGaps: number;
  avgUtilization: number;
  fairnessScore: number;
  avgFatigueIndex: number;
};

export type LaborCostPoint = {
  label: string;
  cost: number;
  hours: number;
};

export type HoursPerEmployeePoint = {
  name: string;
  hours: number;
  maxHours: number | null;
  utilization: number;
};

export type CoveragePoint = {
  day: string;
  required: number;
  scheduled: number;
  gap: number;
};

export type FairnessPoint = {
  name: string;
  hours: number;
  deviation: number;
};

export type UtilizationPoint = {
  name: string;
  utilization: number;
  hours: number;
  maxHours: number | null;
};

export type FatiguePoint = {
  name: string;
  fatigueIndex: number;
  consecutiveDays: number;
  shortRests: number;
};

export type StaffingCostPoint = {
  label: string;
  cost: number;
  hours: number;
};

export type AnalyticsData = {
  summary: SummaryStats;
  laborCostTrend: LaborCostPoint[];
  hoursPerEmployee: HoursPerEmployeePoint[];
  coverage: CoveragePoint[];
  fairness: FairnessPoint[];
  utilization: UtilizationPoint[];
  fatigue: FatiguePoint[];
  weeklyStaffingCost: StaffingCostPoint[];
  monthlyStaffingCost: StaffingCostPoint[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shiftHours(shift: Shift): number {
  return differenceInMinutes(new Date(shift.end_time), new Date(shift.start_time)) / 60;
}

/** Get the active contract for an employee, or null. */
function contractForEmployee(contracts: Contract[], employeeId: string): Contract | null {
  return (
    contracts.find(
      (c) => c.employee_id === employeeId && c.status === 'active'
    ) ?? null
  );
}

/** Hourly rate from contract, or fallback to 0. */
function hourlyRate(contracts: Contract[], employeeId: string): number {
  return contractForEmployee(contracts, employeeId)?.hourly_rate ?? 0;
}

/** Max weekly hours for an employee (contract weekly_hours, employee.max_weekly_hours, or settings max). */
function maxWeeklyHours(
  employee: Employee,
  contracts: Contract[],
  settings: RestaurantSettings | null
): number | null {
  const contract = contractForEmployee(contracts, employee.id);
  if (contract?.weekly_hours) return Number(contract.weekly_hours);
  if (employee.max_weekly_hours) return employee.max_weekly_hours;
  return settings ? Number(settings.max_weekly_hours) : 40;
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computeAnalytics(params: {
  shifts: Shift[];
  employees: Employee[];
  contracts: Contract[];
  settings: RestaurantSettings | null;
  /** The reference week for weekly charts (defaults to current week). */
  referenceWeek?: Date;
}): AnalyticsData {
  const { shifts, employees, contracts, settings, referenceWeek = new Date() } = params;

  const weekStart = startOfWeek(referenceWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(referenceWeek, { weekStartsOn: 1 });
  const monthStart = startOfMonth(referenceWeek);
  const monthEnd = endOfMonth(referenceWeek);

  const overtimeThreshold = settings ? Number(settings.overtime_threshold) : 40;
  const overtimeMultiplier = settings ? Number(settings.overtime_multiplier) : 1.5;
  const minRestHours = settings ? Number(settings.min_hours_between_shifts) : 11;

  // Filter shifts in the current week for weekly charts
  const weekShifts = shifts.filter((s) => {
    const start = new Date(s.start_time);
    return start >= weekStart && start <= weekEnd;
  });

  // Filter shifts in the current month for monthly charts
  const monthShifts = shifts.filter((s) => {
    const start = new Date(s.start_time);
    return start >= monthStart && start <= monthEnd;
  });

  // All shifts for summary (use the week's shifts as the primary window)
  const relevantShifts = weekShifts;

  // -------------------------------------------------------------------------
  // 1. Summary stats
  // -------------------------------------------------------------------------

  const totalScheduledHours = relevantShifts.reduce((sum, s) => sum + shiftHours(s), 0);

  // Labor cost: sum of hours * hourly rate, with overtime multiplier
  let estimatedLaborCost = 0;
  const employeeWeeklyHours: Record<string, number> = {};
  for (const s of relevantShifts) {
    if (!s.employee_id) continue;
    const hrs = shiftHours(s);
    employeeWeeklyHours[s.employee_id] = (employeeWeeklyHours[s.employee_id] ?? 0) + hrs;
    const rate = hourlyRate(contracts, s.employee_id);
    estimatedLaborCost += hrs * rate;
  }
  // Add overtime premium
  for (const [empId, hrs] of Object.entries(employeeWeeklyHours)) {
    if (hrs > overtimeThreshold) {
      const otHours = hrs - overtimeThreshold;
      const rate = hourlyRate(contracts, empId);
      estimatedLaborCost += otHours * rate * (overtimeMultiplier - 1);
    }
  }

  // Coverage gaps: for each day in the week, count hours where 0 employees are scheduled
  let coverageGaps = 0;
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  for (const day of daysInWeek) {
    const dayShifts = relevantShifts.filter((s) => {
      const sStart = new Date(s.start_time);
      return format(sStart, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
    });
    if (dayShifts.length === 0) {
      coverageGaps += 8; // assume 8-hour gap for a day with no shifts
    }
  }

  // -------------------------------------------------------------------------
  // 2. Labor cost trend (daily for the week)
  // -------------------------------------------------------------------------

  const laborCostTrend: LaborCostPoint[] = daysInWeek.map((day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayShifts = relevantShifts.filter(
      (s) => format(new Date(s.start_time), 'yyyy-MM-dd') === dayStr
    );
    let cost = 0;
    let hours = 0;
    for (const s of dayShifts) {
      const hrs = shiftHours(s);
      hours += hrs;
      if (s.employee_id) {
        cost += hrs * hourlyRate(contracts, s.employee_id);
      }
    }
    return {
      label: DAY_LABELS[day.getDay()],
      cost: Math.round(cost * 100) / 100,
      hours: Math.round(hours * 100) / 100,
    };
  });

  // -------------------------------------------------------------------------
  // 3. Hours per employee (bar chart)
  // -------------------------------------------------------------------------

  const hoursPerEmployee: HoursPerEmployeePoint[] = employees.map((emp) => {
    const hours = relevantShifts
      .filter((s) => s.employee_id === emp.id)
      .reduce((sum, s) => sum + shiftHours(s), 0);
    const max = maxWeeklyHours(emp, contracts, settings);
    return {
      name: emp.full_name,
      hours: Math.round(hours * 100) / 100,
      maxHours: max,
      utilization: max ? Math.round((hours / max) * 1000) / 10 : 0,
    };
  });

  // -------------------------------------------------------------------------
  // 4. Coverage (required vs scheduled per day)
  // -------------------------------------------------------------------------

  const coverage: CoveragePoint[] = daysInWeek.map((day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const dayShifts = relevantShifts.filter(
      (s) => format(new Date(s.start_time), 'yyyy-MM-dd') === dayStr
    );
    const scheduled = dayShifts.filter((s) => s.employee_id).length;
    // "Required" is a heuristic: 2 for weekdays, 1 for weekends (simplified)
    const required = isWeekend(day) ? 1 : 2;
    return {
      day: DAY_LABELS[day.getDay()],
      required,
      scheduled,
      gap: Math.max(0, required - scheduled),
    };
  });

  // -------------------------------------------------------------------------
  // 5. Fairness Score (standard deviation of hours across employees)
  // -------------------------------------------------------------------------

  const hoursList = hoursPerEmployee.map((e) => e.hours);
  const avgHours = hoursList.length > 0 ? hoursList.reduce((a, b) => a + b, 0) / hoursList.length : 0;
  const variance =
    hoursList.length > 0
      ? hoursList.reduce((sum, h) => sum + Math.pow(h - avgHours, 2), 0) / hoursList.length
      : 0;
  const stdDev = Math.sqrt(variance);
  // Fairness score: 100 - (stdDev / avgHours * 100), clamped 0-100
  const fairnessScore =
    avgHours > 0 ? Math.max(0, Math.min(100, Math.round(100 - (stdDev / avgHours) * 100))) : 100;

  const fairness: FairnessPoint[] = hoursPerEmployee.map((e) => ({
    name: e.name,
    hours: e.hours,
    deviation: Math.round((e.hours - avgHours) * 100) / 100,
  }));

  // -------------------------------------------------------------------------
  // 6. Employee utilization (% of max weekly hours used)
  // -------------------------------------------------------------------------

  const utilization: UtilizationPoint[] = hoursPerEmployee.map((e) => ({
    name: e.name,
    utilization: e.utilization,
    hours: e.hours,
    maxHours: e.maxHours,
  }));

  const avgUtilization =
    utilization.length > 0
      ? Math.round((utilization.reduce((sum, u) => sum + u.utilization, 0) / utilization.length) * 10) / 10
      : 0;

  // -------------------------------------------------------------------------
  // 7. Fatigue Index (consecutive working days + short rest periods)
  // -------------------------------------------------------------------------

  const fatigue: FatiguePoint[] = employees.map((emp) => {
    const empShifts = relevantShifts
      .filter((s) => s.employee_id === emp.id)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // Consecutive days worked
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    let lastDay: string | null = null;
    for (const s of empShifts) {
      const dayStr = format(new Date(s.start_time), 'yyyy-MM-dd');
      if (lastDay === null) {
        currentConsecutive = 1;
      } else {
        const prev = new Date(lastDay + 'T00:00:00');
        const curr = new Date(dayStr + 'T00:00:00');
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentConsecutive++;
        } else {
          currentConsecutive = 1;
        }
      }
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      lastDay = dayStr;
    }

    // Short rest periods (< minRestHours between shifts)
    let shortRests = 0;
    for (let i = 1; i < empShifts.length; i++) {
      const prevEnd = new Date(empShifts[i - 1].end_time);
      const currStart = new Date(empShifts[i].start_time);
      const restHours = differenceInMinutes(currStart, prevEnd) / 60;
      if (restHours > 0 && restHours < minRestHours) {
        shortRests++;
      }
    }

    // Fatigue index: weighted combination, scaled 0-100
    const fatigueIndex = Math.min(100, Math.round(maxConsecutive * 15 + shortRests * 20));

    return {
      name: emp.full_name,
      fatigueIndex,
      consecutiveDays: maxConsecutive,
      shortRests,
    };
  });

  const avgFatigueIndex =
    fatigue.length > 0
      ? Math.round((fatigue.reduce((sum, f) => sum + f.fatigueIndex, 0) / fatigue.length) * 10) / 10
      : 0;

  // -------------------------------------------------------------------------
  // 8. Weekly staffing cost (per day for the week)
  // -------------------------------------------------------------------------

  const weeklyStaffingCost: StaffingCostPoint[] = laborCostTrend.map((p) => ({
    label: p.label,
    cost: p.cost,
    hours: p.hours,
  }));

  // -------------------------------------------------------------------------
  // 9. Monthly staffing cost (per week for the month)
  // -------------------------------------------------------------------------

  const weeksInMonth: { start: Date; end: Date; label: string }[] = [];
  let cursor = startOfMonth(referenceWeek);
  const mEnd = endOfMonth(referenceWeek);
  let weekNum = 1;
  while (cursor <= mEnd) {
    const wStart = startOfWeek(cursor, { weekStartsOn: 1 });
    const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
    weeksInMonth.push({ start: wStart, end: wEnd, label: `Week ${weekNum}` });
    cursor = new Date(wEnd.getTime() + 86400000);
    weekNum++;
  }

  const monthlyStaffingCost: StaffingCostPoint[] = weeksInMonth.map((w) => {
    const weekShiftsInMonth = monthShifts.filter((s) => {
      const start = new Date(s.start_time);
      return start >= w.start && start <= w.end;
    });
    let cost = 0;
    let hours = 0;
    for (const s of weekShiftsInMonth) {
      const hrs = shiftHours(s);
      hours += hrs;
      if (s.employee_id) {
        cost += hrs * hourlyRate(contracts, s.employee_id);
      }
    }
    return {
      label: w.label,
      cost: Math.round(cost * 100) / 100,
      hours: Math.round(hours * 100) / 100,
    };
  });

  // -------------------------------------------------------------------------
  // Assemble
  // -------------------------------------------------------------------------

  return {
    summary: {
      totalScheduledHours: Math.round(totalScheduledHours * 100) / 100,
      estimatedLaborCost: Math.round(estimatedLaborCost * 100) / 100,
      coverageGaps,
      avgUtilization,
      fairnessScore,
      avgFatigueIndex,
    },
    laborCostTrend,
    hoursPerEmployee,
    coverage,
    fairness,
    utilization,
    fatigue,
    weeklyStaffingCost,
    monthlyStaffingCost,
  };
}
