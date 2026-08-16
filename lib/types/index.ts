export type UserRole = 'manager' | 'employee';

export type ShiftStatus = 'draft' | 'published' | 'confirmed' | 'completed';

export type TimeOffStatus = 'pending' | 'approved' | 'rejected';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export type ContractType = 'full_time' | 'part_time' | 'casual' | 'seasonal';

export type ContractStatus = 'active' | 'expired' | 'terminated';

export type VacationRequestStatus = 'pending' | 'approved' | 'rejected';

export type ShiftSwapStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

export type PayrollPeriodStatus = 'open' | 'processing' | 'closed';

export type PayrollEntryStatus = 'pending' | 'approved' | 'paid';

export type NotificationType =
  | 'shift_published'
  | 'shift_assigned'
  | 'vacation_approved'
  | 'vacation_rejected'
  | 'shift_swap_request'
  | 'shift_swap_approved'
  | 'reminder'
  | 'payroll_ready';

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
};

export type Profile = {
  id: string;
  restaurant_id: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
};

export type Location = {
  id: string;
  restaurant_id: string;
  name: string;
  address: string | null;
  created_at: string;
};

export type Employee = {
  id: string;
  restaurant_id: string;
  location_id: string | null;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  color: string | null;
  max_weekly_hours: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Shift = {
  id: string;
  restaurant_id: string;
  location_id: string;
  employee_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeOffRequest = {
  id: string;
  restaurant_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: TimeOffStatus;
  created_at: string;
};

export type Invitation = {
  id: string;
  restaurant_id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  token: string;
  expires_at: string;
  created_at: string;
};

export type RestaurantSettings = {
  id: string;
  restaurant_id: string;
  week_start_day: number;
  default_shift_color: string;
  min_hours_between_shifts: number;
  max_weekly_hours: number;
  overtime_threshold: number;
  overtime_multiplier: number;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type Holiday = {
  id: string;
  restaurant_id: string;
  name: string;
  holiday_date: string;
  is_paid: boolean;
  created_at: string;
};

export type Contract = {
  id: string;
  employee_id: string;
  restaurant_id: string;
  contract_type: ContractType;
  hourly_rate: number;
  weekly_hours: number | null;
  start_date: string;
  end_date: string | null;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
};

export type Availability = {
  id: string;
  employee_id: string;
  restaurant_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  created_at: string;
};

export type AvailabilityOverride = {
  id: string;
  employee_id: string;
  restaurant_id: string;
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
};

export type ScheduleTemplate = {
  id: string;
  restaurant_id: string;
  location_id: string;
  name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  role_required: string | null;
  min_staff: number;
  max_staff: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffingRequirement = {
  id: string;
  restaurant_id: string;
  location_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  role: string;
  min_employees: number;
  max_employees: number | null;
  created_at: string;
  updated_at: string;
};

export type VacationRequest = {
  id: string;
  restaurant_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: VacationRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShiftSwapRequest = {
  id: string;
  restaurant_id: string;
  shift_id: string;
  requesting_employee_id: string;
  target_employee_id: string | null;
  status: ShiftSwapStatus;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  restaurant_id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  is_read: boolean;
  related_entity_id: string | null;
  related_entity_type: string | null;
  created_at: string;
};

export type PayrollPeriod = {
  id: string;
  restaurant_id: string;
  name: string;
  start_date: string;
  end_date: string;
  pay_date: string | null;
  status: PayrollPeriodStatus;
  created_at: string;
  updated_at: string;
};

export type PayrollEntry = {
  id: string;
  payroll_period_id: string;
  restaurant_id: string;
  employee_id: string;
  regular_hours: number;
  overtime_hours: number;
  holiday_hours: number;
  regular_pay: number;
  overtime_pay: number;
  holiday_pay: number;
  total_pay: number;
  status: PayrollEntryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: {
    employeeId?: string;
    locationId?: string;
    status?: ShiftStatus;
    color?: string;
  };
};

export type ShiftGeneratorConfig = {
  id: string;
  restaurant_id: string;
  name: string;
  opening_time: string;
  closing_time: string;
  shift_duration_hours: number;
  min_employees_per_shift: number;
  days_of_week: number[];
  target_week_start: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** A single generated shift slot produced by the scheduling engine. */
export type GeneratedShift = {
  /** ISO datetime string */
  start_time: string;
  /** ISO datetime string */
  end_time: string;
  /** Day label, e.g. "Monday" */
  day_label: string;
  /** Time range label, e.g. "09:00 – 17:00" */
  time_label: string;
  /** Slot index within the day (0-based) */
  slot_index: number;
  /** Assigned employee (if available), null for unassigned */
  employee_id: string | null;
  employee_name: string | null;
};
