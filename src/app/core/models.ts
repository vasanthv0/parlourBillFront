import type { GstPriceMode } from './gst';

export type { GstPriceMode }; // 'inclusive': the prices on the menu already contain GST. 'exclusive': GST is added on top of them.
export type Role = 'super_admin' | 'admin' | 'staff';
export type PaymentMethod = 'cash' | 'upi' | 'card';
/** What a bill says about how it was paid: the one method used, or 'split' when it was paid with two or more. */
export type BillPaymentMethod = PaymentMethod | 'split';

export interface User {
  id: string;
  name: string;
  /** Staff made with a mobile number only have no email. A parlour's admin and the platform admin always have one. */
  email: string | null;
  /** The number a team member was added with. Accounts made before mobile numbers existed show none. */
  mobile: string | null;
  role: Role;
  parlourId: string | null;
  parlourName?: string | null;
  /** What this parlour may use, set by the platform admin. Null for the platform admin themself. */
  features?: Record<string, boolean> | null;
}

export interface Parlour {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstNumber: string | null;
  currency: string;
  timezone: string;
  taxPercent: number;
  gstPriceMode: GstPriceMode;
  invoicePrefix: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
  durationMin: number;
  /** Optional 6-digit SAC (services accounting code), printed on the bill. */
  sacCode: string | null;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  visits?: number;
  totalSpent?: number;
  lastVisit?: string | null;
  recentInvoices?: { id: string; number: string; total: number; status: InvoiceStatus; paymentMethod: BillPaymentMethod; createdAt: string }[];
}

export type InvoiceStatus = 'paid' | 'void';

export interface InvoiceRow {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string;
  createdBy: string | null;
  createdByName: string | null;
  subtotal: number;
  discount: number;
  referrerId: string | null;
  referralPercent: number;
  referralDiscount: number;
  taxPercent: number;
  tax: number;
  /** Whether the prices on this bill contained GST. Bills from before the setting existed are 'exclusive'. */
  priceMode: GstPriceMode;
  /** Half of the tax each (an odd paisa is on CGST). Both are null on a bill made before the split existed: it shows one tax line. */
  cgst: number | null;
  sgst: number | null;
  /** Total minus tax: what the tax was worked out on. */
  taxable: number;
  total: number;
  /** The one method used, or 'split'. What was paid with each method is in `payments` on the full bill. */
  paymentMethod: BillPaymentMethod;
  /** Extra money for the staff. Not part of the total, not taxed, not takings. 0 on bills made before tips existed. */
  tip: number;
  notes: string | null;
  status: InvoiceStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface Invoice extends InvoiceRow {
  customerPhone: string | null;
  /** What was paid with each method, in the order cash, UPI, card; the amounts add up to the total. A bill made before split payments shows its one method for the whole total. */
  payments: { method: PaymentMethod; amount: number }[];
  /** The GSTIN printed on this bill: the one it was made under (a bill from before the split shows the parlour's current one). */
  gstin: string | null;
  referrer: { id: string; code: string; name: string } | null;
  parlour: { name: string; phone: string | null; address: string | null; gstNumber: string | null };
  items: {
    id: string; comboId: string | null; description: string | null; name: string; sacCode: string | null; unitPrice: number; quantity: number; lineTotal: number;
    /** Who performed this line, as named on the day. Null when nobody was chosen, and on every bill made before this existed. */
    performerName: string | null;
  }[];
}

export interface TeamMember {
  id: string;
  name: string;
  /** Null for staff who sign in with their mobile number alone. */
  email: string | null;
  /** Collected when the member is added. Accounts made before that show none. */
  mobile: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Summary {
  range: { from: string; to: string };
  totals: { invoices: number; revenue: number; discounts: number; referralDiscounts: number; tax: number; /** Tips are extra money for the staff: not in revenue or in byPayment. */ tips: number; averageBill: number };
  byPayment: { method: PaymentMethod; invoices: number; revenue: number }[];
  daily: { day: string; revenue: number; invoices: number }[];
  topServices: { name: string; quantity: number; revenue: number }[];
  byStaff: { name: string; invoices: number; revenue: number }[];
  /**
   * Sales by the person who PERFORMED the work (each line's share of what the bill took in: after discounts, before GST).
   * `unassigned` is what no one was credited for, so people + unassigned = the taxable value of every bill.
   * Null when the Performers page is switched off for the parlour: do not show it.
   */
  byPerformer: { people: { id: string; name: string; lines: number; quantity: number; sales: number }[]; unassigned: number } | null;
}

export interface PageMeta { page: number; limit: number; total: number; pages: number }
export interface Paged<T> { items: T[]; meta: PageMeta }

// ── Platform (super admin) ─────────────────────────────────────────
export interface FeatureDef {
  key: string;
  group: 'page' | 'action';
  requires?: string;
  label: string;
  description: string;
}

export interface PlatformParlour {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  createdAt: string;
  /** What the platform admin has set. A button can read "on" here yet be unavailable because its page is off. */
  features: Record<string, boolean>;
  owner: { id: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null } | null;
  counts: { team: number; bills: number; customers: number; services: number };
}

export interface PlatformSummary { parlours: number; active: number; suspended: number; bills: number }

// ── Combos and referrals ───────────────────────────────────────────
export interface ComboItem { serviceId: string; name: string; quantity: number; price: number; isActive: boolean }

export interface Combo {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  items: ComboItem[];
  /** What the same services cost separately, and what the customer saves with the combo. */
  regularPrice: number;
  savings: number;
  /** On, and every service inside is still on the menu. */
  available: boolean;
}

export interface ReferralHistoryRow {
  id: string;
  number: string;
  customerName: string;
  percent: number;
  discount: number;
  total: number;
  status: InvoiceStatus;
  createdAt: string;
  /** The referrer has been paid this bill's referral amount. */
  paid: boolean;
}

export interface Referrer {
  id: string;
  code: string;
  name: string;
  contact: string;
  percent: number;
  isActive: boolean;
  createdAt: string;
  bills?: number;
  totalDiscount?: number;
  lastUsedAt?: string | null;
  canDelete?: boolean;
  /** What they are owed: their credit on bills that stand and have not been marked as paid. */
  owed?: number;
  /** What has been marked as paid out (on bills that still stand). */
  paidOut?: number;
  /** Paid out on a bill that was voided afterwards. Nothing is changed automatically: it is shown so it can be settled. */
  voidedAfterPaid?: number;
  history?: ReferralHistoryRow[];
  payouts?: { id: string; amount: number; bills: number; paidAt: string; paidByName: string | null }[];
}

/** What "Mark as paid" answers with. */
export interface ReferralPayout { id: string; referrerId: string; referrerName: string; amount: number; bills: number; paidAt: string }

/** What the billing counter sees when it looks a referrer up. */
export interface ReferrerLookup { id: string; code: string; name: string; percent: number }

// ── Attendance (GPS check-in) ──────────────────────────────────────
export type DeviceType = 'personal' | 'shared';
export type AttendanceStatus = 'checked_in' | 'checked_out';
/** How the server judged a GPS reading. 'stale' means the device clock or reading is badly out of date. */
export type LocationVerdict = 'ok' | 'out_of_range' | 'inaccurate' | 'stale';

/** One check-in or check-out: when, where, and how far from the salon the server measured it. */
export interface AttendancePunch {
  at: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  distanceM: number;
  deviceType: DeviceType;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  /** Only present in the admin's team list. */
  userName?: string;
  /** YYYY-MM-DD in the parlour's own time zone. */
  workDate: string;
  status: AttendanceStatus;
  checkIn: AttendancePunch;
  checkOut: AttendancePunch | null;
}

/** What the attendance screen needs. Deliberately has no salon coordinates. */
export interface TodayAttendance {
  workDate: string;
  timezone: string;
  /** False until an admin has set the salon location. */
  configured: boolean;
  radiusM: number;
  maxAccuracyM: number;
  record: AttendanceRecord | null;
}

/** The server's answer to "where do I stand?" (the distance is calculated there, never in the browser). */
export interface LocationCheck {
  verdict: LocationVerdict;
  withinRadius: boolean;
  distanceM: number;
  radiusM: number;
  accuracyM: number;
  maxAccuracyM: number;
}

/** Admin only. */
export interface AttendanceSettings {
  configured: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  maxAccuracyM: number;
  updatedAt: string | null;
}

// ── Attendance by Staff (a signed-in person records attendance for performers, who do not sign in) ──
/** What the screen shows for one performer today. */
export type PerformerAttendanceState = 'not_checked_in' | 'checked_in' | 'checked_out';
/** What a saved record is: 'missed_checkout' is an earlier day with a check-in and no check-out. */
export type PerformerRecordStatus = 'checked_in' | 'checked_out' | 'missed_checkout';

export interface PerformerAttendanceRecord {
  id: string;
  performerId: string;
  performerName: string;
  /** YYYY-MM-DD in the parlour's own time zone. */
  workDate: string;
  status: PerformerRecordStatus;
  checkInAt: string;
  checkOutAt: string | null;
  /** Who recorded the check-in, and (if there is one) who recorded the check-out. Always people who sign in, never the performer. */
  markedBy: { id: string; name: string };
  checkOutMarkedBy: { id: string; name: string } | null;
}

export interface PerformerAttendanceLine {
  performerId: string;
  name: string;
  status: PerformerAttendanceState;
  record: PerformerAttendanceRecord | null;
}

export interface PerformerAttendanceToday { workDate: string; timezone: string; performers: PerformerAttendanceLine[] }
/** The answer to a check-in or check-out: that performer's new line. */
export interface PerformerAttendanceResult { workDate: string; timezone: string; performer: PerformerAttendanceLine }

export interface PerformerAttendanceReport {
  range: { from: string; to: string };
  timezone: string;
  totals: { records: number; complete: number; missedCheckout: number; minutesWorked: number };
  people: { performerId: string; name: string; isActive: boolean; days: number; complete: number; missedCheckout: number; minutesWorked: number }[];
}

// ── Performers and commission ──────────────────────────────────────
/** A person who performs services. Just a name the admin keeps: they do not sign in. */
export interface Performer {
  id: string;
  name: string;
  isActive: boolean;
  /** Admin only. How many bill lines name this person. */
  lines?: number;
  canDelete?: boolean;
}

export type CommissionKind = 'percent' | 'flat';

/** A commission rule belongs to ONE person or ONE service. `value` is a percentage, or rupees for each unit performed. */
export interface CommissionRule {
  id: string;
  kind: CommissionKind;
  value: number;
  performerId: string | null;
  performerName: string | null;
  serviceId: string | null;
  serviceName: string | null;
}

export interface CommissionPerson {
  id: string;
  name: string;
  isActive: boolean;
  lines: number;
  /** Their lines' share of the bills' taxable value. */
  sales: number;
  earned: number;
  paid: number;
  /** earned - paid: what "Mark as paid" would pay now. */
  due: number;
  /** Commission that was paid and then the bill was voided. Shown so the admin can settle it. */
  voidedAfterPaid: number;
}

export interface CommissionReport {
  range: { from: string; to: string };
  people: CommissionPerson[];
  totals: { sales: number; earned: number; paid: number; due: number; voidedAfterPaid: number };
}

export interface CommissionLine {
  id: string;
  invoiceId: string;
  number: string;
  status: InvoiceStatus;
  createdAt: string;
  name: string;
  quantity: number;
  /** Its share of the bill's taxable value: what the commission was worked out on. */
  base: number | null;
  kind: CommissionKind | null;
  rate: number | null;
  commission: number;
  paid: boolean;
}

export interface CommissionLines {
  range: { from: string; to: string };
  person: { id: string; name: string };
  truncated: boolean;
  lines: CommissionLine[];
}

export interface CommissionPayout {
  id: string;
  performerId: string | null;
  performerName: string;
  from: string;
  to: string;
  amount: number;
  lines: number;
  paidAt: string;
  paidByName: string | null;
}

// ── Appointments ───────────────────────────────────────────────────
/**
 * booked      a booking still to come            waiting     a walk-in in the queue
 * in_service  the work has begun                 completed   billed (set only by making the bill)
 * cancelled   will not happen                    no_show     a booking whose time passed and nobody came
 */
export type AppointmentStatus = 'booked' | 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentKind = 'booked' | 'walk_in';

/** What the visit is for. The name and minutes are as they were when it was booked. No price: the bill works that out on the day. */
export interface AppointmentService { serviceId: string | null; name: string; durationMin: number; quantity: number }

export interface Appointment {
  id: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  /** The day and the clock time on the parlour's own wall (its time zone), so the screen never guesses from the browser. */
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  performerId: string | null;
  performerName: string | null;
  notes: string | null;
  cancelReason: string | null;
  /** When someone opened the WhatsApp reminder. It does not mean the message was sent or read. */
  reminderSentAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** Staff can only open their own bills, so the link is offered only when the person may open it. */
  canOpenInvoice: boolean;
  createdByName: string | null;
  createdAt: string;
  services: AppointmentService[];
}

export interface AppointmentDay {
  date: string;
  /** The parlour's own today and time zone, from the server. */
  today: string;
  timezone: string;
  appointments: Appointment[];
  /** Visits from EARLIER days that were never billed or closed, so they cannot be forgotten off the bottom of the list. */
  earlierOpen: { count: number; oldest: string | null };
}

export interface QueueEntry extends Appointment { position: number; fromEarlierDay: boolean }
export interface AppointmentQueue { today: string; queue: QueueEntry[] }

/** A ready-to-open WhatsApp link: the person taps it and presses Send. Nothing is sent automatically. */
export interface Reminder { url: string; message: string; phone: string }
