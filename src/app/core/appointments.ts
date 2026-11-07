import { Appointment, AppointmentStatus } from './models';

// The small, pure rules behind the Appointments screens: no Angular, no HTTP, easy to test and easy to change.
// The server checks every one of these again; the screen only saves a round trip.

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Booked', waiting: 'Waiting', in_service: 'In service', completed: 'Billed', cancelled: 'Cancelled', no_show: 'No-show',
};

/** A visit that is still going to happen, or is happening. Everything else is closed and is a record. */
export const isOpen = (status: AppointmentStatus): boolean => status === 'booked' || status === 'waiting' || status === 'in_service';

/** 'YYYY-MM-DD' moved by whole days. Plain calendar arithmetic, so a time zone or daylight saving can never skip or repeat a day. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 'Fri, 6 Nov 2026' */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** The clock time of an instant on the parlour's own wall, 24-hour: '15:30'. */
export function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso));
}

/** '45 min', '1 h', '1 h 30 min' */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 'Haircut, Head Massage × 2' */
export function servicesText(a: Pick<Appointment, 'services'>): string {
  return a.services.map((s) => (s.quantity > 1 ? `${s.name} × ${s.quantity}` : s.name)).join(', ');
}

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 600;

/** How long a visit takes when nobody typed a length: each service's minutes times its quantity, kept within 5 to 600 (the same as the server). */
export function plannedMinutes(lines: { durationMin: number; quantity: number }[]): number {
  const total = lines.reduce((sum, l) => sum + l.durationMin * l.quantity, 0);
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, total));
}

/** A booking whose time has come and gone can be marked as a no-show; one still to come cannot (cancel it instead). */
export const canMarkNoShow = (a: Pick<Appointment, 'status' | 'startsAt'>, nowMs: number): boolean => a.status === 'booked' && Date.parse(a.startsAt) <= nowMs;

/** Whether a reminder still makes sense: a booked visit whose time has not come. */
export const canRemind = (a: Pick<Appointment, 'status' | 'startsAt'>, nowMs: number): boolean => a.status === 'booked' && Date.parse(a.startsAt) > nowMs;

/** 'just arrived', '12 min', '1 h 5 min': how long a walk-in has been waiting. */
export function waitingFor(startsAt: string, nowMs: number): string {
  const minutes = Math.floor((nowMs - Date.parse(startsAt)) / 60_000);
  return minutes < 1 ? 'just arrived' : minutesLabel(minutes);
}

export interface Column { id: string | null; name: string; items: Appointment[] }
export const NOBODY = 'Nobody chosen yet';

const byTime = (a: Appointment, b: Appointment) => a.startsAt.localeCompare(b.startsAt) || a.createdAt.localeCompare(b.createdAt);

/**
 * One day split into one column per person, so a double booking is easy to see. Every active person gets a column even if
 * they have nothing today (so a free stylist is visible). Someone who is on a visit but no longer on the list (deactivated, or the
 * Performers page switched off since) still gets their column. Visits with nobody chosen share one column, shown only if there are any.
 * With no people at all, everything is one list.
 */
export function columnsFor(appointments: Appointment[], people: { id: string; name: string }[]): Column[] {
  const sorted = [...appointments].sort(byTime);
  const columns: Column[] = people.map((p) => ({ id: p.id, name: p.name, items: [] }));
  const byId = new Map(columns.map((c) => [c.id as string, c]));
  const unassigned: Appointment[] = [];

  for (const a of sorted) {
    if (!a.performerId) { unassigned.push(a); continue; }
    let column = byId.get(a.performerId);
    if (!column) {
      column = { id: a.performerId, name: a.performerName ?? 'Someone else', items: [] };
      byId.set(a.performerId, column);
      columns.push(column);
    }
    column.items.push(a);
  }
  if (unassigned.length) columns.push({ id: null, name: columns.length ? NOBODY : 'Appointments', items: unassigned });
  return columns.length ? columns : [{ id: null, name: 'Appointments', items: [] }];
}

/** The phone rule the customers page uses: 7 to 20 characters of digits and + - ( ) spaces, and at least 10 digits. Blank means none. */
export function phoneProblem(text: string): string {
  const t = text.trim();
  if (!t) return '';
  if (!/^[0-9+\-\s()]{7,20}$/.test(t)) return 'Enter a valid phone number';
  if (t.replace(/\D/g, '').length < 10) return 'Enter a phone number with at least 10 digits';
  return '';
}

export interface Draft {
  kind: 'booked' | 'walk_in';
  /** A saved customer is chosen, so no typed name is needed. */
  hasCustomer: boolean;
  name: string;
  phone: string;
  date: string;
  time: string;
  /** How many services are chosen. */
  serviceCount: number;
  /** What was typed in the length box ('' means "work it out from the services"). */
  minutes: string;
  notes: string;
}

/** Field messages for a form, in the same words the server uses. Empty when the form is fine. */
export function problems(d: Draft): Record<string, string> {
  const out: Record<string, string> = {};
  if (d.kind === 'booked') {
    if (!d.date) out['date'] = 'Choose the date';
    if (!d.time) out['time'] = 'Choose the time';
    if (!d.hasCustomer && d.name.trim().length < 2) out['customerName'] = 'Enter the customer name or choose a saved customer';
  } else if (d.name.trim() && d.name.trim().length < 2) {
    out['customerName'] = 'Enter the customer name';
  }
  if (!d.hasCustomer) {
    const phone = phoneProblem(d.phone);
    if (phone) out['customerPhone'] = phone;
  }
  if (d.serviceCount < 1) out['items'] = 'Choose at least one service';
  const m = d.minutes.trim();
  if (m && (!/^\d+$/.test(m) || Number(m) < MIN_MINUTES || Number(m) > MAX_MINUTES)) out['durationMin'] = `Enter whole minutes, ${MIN_MINUTES} to ${MAX_MINUTES}`;
  if (d.notes.trim().length > 300) out['notes'] = 'Keep notes under 300 characters';
  return out;
}
