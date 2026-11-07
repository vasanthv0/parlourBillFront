/**
 * Test helpers: open a page the way the router does, signed in as a given role, with realistic API
 * responses, so that a runtime error in a template or in injection fails a test instead of reaching a browser.
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { authInterceptor } from '../core/auth.interceptor';
import { AuthService } from '../core/auth.service';
import { Role } from '../core/models';

export const ALL_FEATURES = [
  'page.dashboard', 'page.customers', 'page.services', 'page.combos', 'page.referrals', 'page.team', 'page.settings', 'page.attendance',
  'page.performers', 'page.commissions', 'page.appointments', 'page.attendance_by_staff',
  'action.services.add', 'action.team.add', 'action.team.edit', 'action.team.reset', 'action.team.deactivate',
  'action.combos.add', 'action.referrals.add', 'action.whatsapp.send', 'action.payments.split', 'action.payments.tip',
  'action.referrals.pay', 'action.performers.add', 'action.commissions.pay',
  'action.appointments.remind', 'action.appointments.bill',
];
const REQUIRES: Record<string, string> = { 'action.services.add': 'page.services', 'action.team.add': 'page.team', 'action.team.edit': 'page.team', 'action.team.reset': 'page.team', 'action.team.deactivate': 'page.team', 'action.combos.add': 'page.combos', 'action.referrals.add': 'page.referrals',
  // Commissions needs Performers, and a button needs its page, so "Mark commission as paid" needs both: it chains.
  'page.commissions': 'page.performers', 'action.performers.add': 'page.performers', 'action.commissions.pay': 'page.commissions', 'action.referrals.pay': 'page.referrals',
  'action.appointments.remind': 'page.appointments', 'action.appointments.bill': 'page.appointments' };

/** A switch is off if it was turned off, or if the page it needs is off (which can itself need another page). */
const isOff = (key: string, off: string[]): boolean => off.includes(key) || (!!REQUIRES[key] && isOff(REQUIRES[key], off));

/** What a parlour is allowed to use, as the API sends it: a button is off whenever its page is off, all the way up the chain. */
export function featuresWith(off: string[] = []): Record<string, boolean> {
  return Object.fromEntries(ALL_FEATURES.map((k) => [k, !isOff(k, off)]));
}

/** jsdom lacks a few browser features the app relies on. */
export function installDomShims() {
  const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  // The password generator needs random numbers; jsdom may not provide them.
  if (!globalThis.crypto?.getRandomValues) {
    const getRandomValues = <T extends ArrayBufferView>(a: T): T => { const u = a as unknown as Uint32Array; for (let i = 0; i < u.length; i++) u[i] = Math.floor(Math.random() * 2 ** 32); return a; };
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true });
  }
}

// ───────────── API responses (the shapes the real API returns) ─────────────
const iso = '2026-10-18T10:30:00.000Z';
const meta = (n: number) => ({ page: 1, limit: 20, total: n, pages: 1 });
const parlour = { id: 'p1', name: 'Demo Parlour', phone: '9840000000', address: '12 Lake View Road', gstNumber: '33ABCDE1234F1Z5', currency: 'INR', timezone: 'Asia/Kolkata', taxPercent: 5, gstPriceMode: 'exclusive', invoicePrefix: 'DP' };
const services = [
  { id: 's1', name: 'Haircut', category: 'Hair', price: 200, durationMin: 30, sacCode: '999721', isActive: true },
  { id: 's2', name: 'Facial', category: 'Skin', price: 500, durationMin: 60, sacCode: null, isActive: true },
  { id: 's3', name: 'Massage', category: 'Hair', price: 1000, durationMin: 45, sacCode: null, isActive: true },
  { id: 's4', name: 'Old Wax', category: 'Nails', price: 300, durationMin: 20, sacCode: null, isActive: false },
];
const combos = [
  { id: 'c1', name: 'Glow Pack', price: 600, isActive: true, createdAt: iso, regularPrice: 700, savings: 100, available: true,
    items: [{ serviceId: 's1', name: 'Haircut', quantity: 1, price: 200, isActive: true }, { serviceId: 's2', name: 'Facial', quantity: 1, price: 500, isActive: true }] },
  { id: 'c2', name: 'Broken Pack', price: 400, isActive: true, createdAt: iso, regularPrice: 500, savings: 100, available: false,
    items: [{ serviceId: 's4', name: 'Old Wax', quantity: 1, price: 300, isActive: false }, { serviceId: 's1', name: 'Haircut', quantity: 1, price: 200, isActive: true }] },
];
const referrers = [
  { id: 'r1', code: 'REF-0001', name: 'Anita Rao', contact: '9841100001', percent: 10, isActive: true, createdAt: iso, bills: 2, totalDiscount: 240, lastUsedAt: iso, canDelete: false, owed: 240, paidOut: 0, voidedAfterPaid: 0 },
  { id: 'r2', code: 'REF-0002', name: 'Kumar S', contact: '9841100002', percent: 5, isActive: false, createdAt: iso, bills: 0, totalDiscount: 0, lastUsedAt: null, canDelete: true, owed: 0, paidOut: 0, voidedAfterPaid: 0 },
];
const customers = [{ id: 'cu1', name: 'Cara Customer', phone: '9000000005', email: 'cara@example.com', notes: 'Prefers mornings', createdAt: iso, visits: 3, totalSpent: 2100, lastVisit: iso }];
// A bill made BEFORE the CGST/SGST split existed: no split saved, one tax line, the parlour's current GSTIN.
const invoiceRow = { id: 'i1', number: 'DP-00001', customerId: 'cu1', customerName: 'Cara Customer', createdBy: 'u1', createdByName: 'Riya', subtotal: 900, discount: 0, referrerId: 'r1', referralPercent: 10, referralDiscount: 90, taxPercent: 5, tax: 40.5, priceMode: 'exclusive', cgst: null, sgst: null, taxable: 810, total: 850.5, paymentMethod: 'upi', notes: null, tip: 0, status: 'paid', voidReason: null, voidedAt: null, createdAt: iso };
/** 'legacy': made before the CGST/SGST split. 'split': with the GST split. 'inclusive': GST inside the prices. 'parts': with the GST split, paid by cash + UPI, with a tip. */
export type InvoiceKind = 'legacy' | 'split' | 'inclusive' | 'parts';
const invoice = (phone: string | null, kind: InvoiceKind = 'legacy') => ({
  ...invoiceRow, customerPhone: phone, gstin: '33ABCDE1234F1Z5', referrer: { id: 'r1', code: 'REF-0001', name: 'Anita Rao' },
  // A bill made before split payments existed has no payment list from its own rows: the API shows its one method for the whole total.
  payments: [{ method: 'upi', amount: 850.5 }],
  parlour: { name: 'Demo Parlour', phone: '9840000000', address: '12 Lake View Road', gstNumber: '33ABCDE1234F1Z5', timezone: 'Asia/Kolkata' },
  items: [
    { id: 'it1', comboId: 'c1', description: 'Haircut + Facial', name: 'Glow Pack', sacCode: null, unitPrice: 600, quantity: 1, lineTotal: 600, performerName: 'Meena' },
    { id: 'it2', comboId: null, description: null, name: 'Wax', sacCode: kind === 'legacy' ? null : '999722', unitPrice: 300, quantity: 1, lineTotal: 300, performerName: null },
  ],
  // A bill made with the split: GST 5% on top of ₹810 = ₹40.50, as CGST ₹20.25 + SGST ₹20.25, under the GSTIN it was made with.
  ...(kind === 'split' ? { cgst: 20.25, sgst: 20.25, gstin: '33SNAPSHOT00S1Z5' } : {}),
  // The same bill with GST inside the prices: the customer pays ₹810, of which GST is ₹38.57 (CGST ₹19.29 + SGST ₹19.28).
  // The GST-split bill again, paid ₹500 cash + ₹350.50 UPI (together the total of ₹850.50), with a ₹50 tip that is not in the total.
  ...(kind === 'parts' ? { cgst: 20.25, sgst: 20.25, gstin: '33SNAPSHOT00S1Z5', paymentMethod: 'split', tip: 50, payments: [{ method: 'cash', amount: 500 }, { method: 'upi', amount: 350.5 }] } : {}),
  ...(kind === 'inclusive' ? { priceMode: 'inclusive', tax: 38.57, cgst: 19.29, sgst: 19.28, taxable: 771.43, total: 810, gstin: '33SNAPSHOT00S1Z5' } : {}),
});
const days = Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${12 + i}`, revenue: i * 500, invoices: i }));
const summary = (empty: boolean, performers = true) => ({
  range: { from: '2026-10-12', to: '2026-10-18' },
  totals: { invoices: empty ? 0 : 12, revenue: empty ? 0 : 9400, discounts: empty ? 0 : 640, referralDiscounts: empty ? 0 : 240, tax: 410, tips: empty ? 0 : 120, averageBill: empty ? 0 : 783.33 },
  byPayment: empty ? [] : [{ method: 'cash', invoices: 5, revenue: 3000 }, { method: 'upi', invoices: 7, revenue: 6400 }],
  daily: days, topServices: empty ? [] : [{ name: 'Facial', quantity: 5, revenue: 2500 }], byStaff: empty ? [] : [{ name: 'Riya', invoices: 7, revenue: 5000 }],
  byPerformer: !performers ? null : empty ? { people: [], unassigned: 0 }
    : { people: [{ id: 'pf1', name: 'Meena', lines: 6, quantity: 7, sales: 4200 }, { id: 'pf2', name: 'Asha', lines: 3, quantity: 3, sales: 2150.5 }], unassigned: 800 },
});
const defs = [
  ...['Dashboard', 'Customers', 'Services', 'Combos', 'Referrals', 'Team', 'Settings', 'Attendance', 'Performers', 'Appointments'].map((l) => ({ key: `page.${l.toLowerCase()}`, group: 'page', label: l, description: `The ${l} page.` })),
  { key: 'page.attendance_by_staff', group: 'page', label: 'Attendance by Staff', description: 'Staff record check-in and check-out for performers.' },
  { key: 'page.commissions', group: 'page', requires: 'page.performers', label: 'Commissions', description: 'Commission rules, what each person earned, and marking it as paid.' },
  { key: 'action.referrals.pay', group: 'action', requires: 'page.referrals', label: 'Mark referral as paid button', description: 'Record that a referrer was paid.' },
  { key: 'action.performers.add', group: 'action', requires: 'page.performers', label: 'Add performer button', description: 'Add people to the Performers list.' },
  { key: 'action.commissions.pay', group: 'action', requires: 'page.commissions', label: 'Mark commission as paid button', description: 'Record that a person was paid commission.' },
  { key: 'action.services.add', group: 'action', requires: 'page.services', label: 'Add service button', description: 'Create services.' },
  { key: 'action.team.add', group: 'action', requires: 'page.team', label: 'Add team member button', description: 'Create staff.' },
  { key: 'action.team.edit', group: 'action', requires: 'page.team', label: 'Edit team member button', description: 'Edit staff.' },
  { key: 'action.team.reset', group: 'action', requires: 'page.team', label: 'Reset password button', description: 'Reset passwords.' },
  { key: 'action.team.deactivate', group: 'action', requires: 'page.team', label: 'Deactivate / Reactivate button', description: 'Deactivate staff.' },
  { key: 'action.combos.add', group: 'action', requires: 'page.combos', label: 'Add combo button', description: 'Create combos.' },
  { key: 'action.referrals.add', group: 'action', requires: 'page.referrals', label: 'Add referrer button', description: 'Create referrers.' },
  { key: 'action.whatsapp.send', group: 'action', label: 'Send on WhatsApp button', description: 'WhatsApp.' },
  { key: 'action.payments.split', group: 'action', label: 'Split payment button', description: 'Split a bill across payment methods.' },
  { key: 'action.payments.tip', group: 'action', label: 'Tip box', description: 'Record a tip.' },
  { key: 'action.appointments.remind', group: 'action', requires: 'page.appointments', label: 'Appointment reminder button', description: 'Opens WhatsApp with a reminder.' },
  { key: 'action.appointments.bill', group: 'action', requires: 'page.appointments', label: 'Bill this visit button', description: 'Turn an appointment into a bill.' },
];
// People who perform services (names only), the commission each has earned this week, the rules, and what has been paid.
const people = [
  { id: 'pf1', name: 'Meena', isActive: true, lines: 6, canDelete: false },
  { id: 'pf2', name: 'Asha', isActive: true, lines: 0, canDelete: true },
  { id: 'pf3', name: 'Old Hand', isActive: false, lines: 3, canDelete: false },
];
// Appointments: a booking tomorrow, one that was due two hours ago, a walk-in under way, a billed visit, and two people in the queue.
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const visit = (over: Record<string, unknown> = {}) => ({
  id: 'ap1', kind: 'booked', status: 'booked', date: '2026-10-19', time: '10:30', startsAt: inHours(24), endsAt: inHours(24.75), durationMin: 45,
  customerId: 'cu1', customerName: 'Cara Customer', customerPhone: '9000000005', performerId: 'pf1', performerName: 'Meena', notes: null, cancelReason: null,
  reminderSentAt: null, invoiceId: null, invoiceNumber: null, canOpenInvoice: false, createdByName: 'Riya', createdAt: iso,
  services: [{ serviceId: 's1', name: 'Haircut', durationMin: 30, quantity: 1 }, { serviceId: 's2', name: 'Facial', durationMin: 60, quantity: 1 }], ...over,
});
const visits = () => [
  visit(),
  visit({ id: 'ap2', time: '08:00', startsAt: inHours(-2), endsAt: inHours(-1.25), customerId: null, customerName: 'Late Lata', customerPhone: null, performerId: null, performerName: null }),
  visit({ id: 'ap3', kind: 'walk_in', status: 'in_service', time: '09:15', startsAt: inHours(-1), endsAt: inHours(-0.25), customerId: null, customerName: 'Walk-in', customerPhone: null, performerId: 'pf2', performerName: 'Asha', notes: 'Allergic to ammonia' }),
  visit({ id: 'ap4', status: 'completed', time: '07:00', startsAt: inHours(-3), endsAt: inHours(-2.25), invoiceId: 'i1', invoiceNumber: 'DP-00001', canOpenInvoice: true }),
];
const queueRows = () => [
  visit({ id: 'aq1', kind: 'walk_in', status: 'waiting', startsAt: inHours(-0.5), customerId: null, customerName: 'Walk-in Wanda', customerPhone: null, performerId: null, performerName: null, position: 1, fromEarlierDay: false }),
  visit({ id: 'aq2', kind: 'walk_in', status: 'waiting', startsAt: inHours(-0.2), customerId: null, customerName: 'Second Sita', customerPhone: '9840011111', performerId: null, performerName: null, position: 2, fromEarlierDay: false }),
];
const commissionReport = (empty: boolean) => ({
  range: { from: '2026-10-12', to: '2026-10-18' },
  people: empty ? [] : [
    { id: 'pf1', name: 'Meena', isActive: true, lines: 6, sales: 4200, earned: 420, paid: 120, due: 300, voidedAfterPaid: 0 },
    { id: 'pf2', name: 'Asha', isActive: true, lines: 3, sales: 2150.5, earned: 150, paid: 0, due: 150, voidedAfterPaid: 50 },
    { id: 'pf3', name: 'Old Hand', isActive: false, lines: 1, sales: 200, earned: 0, paid: 0, due: 0, voidedAfterPaid: 0 },
  ],
  totals: empty ? { sales: 0, earned: 0, paid: 0, due: 0, voidedAfterPaid: 0 } : { sales: 6550.5, earned: 570, paid: 120, due: 450, voidedAfterPaid: 50 },
});
const commissionLines = (empty: boolean) => ({
  range: { from: '2026-10-12', to: '2026-10-18' }, person: { id: 'pf1', name: 'Meena' }, truncated: false,
  lines: empty ? [] : [
    { id: 'cl1', invoiceId: 'i1', number: 'DP-00001', status: 'paid', createdAt: iso, name: 'Haircut', quantity: 1, base: 200, kind: 'percent', rate: 10, commission: 20, paid: true },
    { id: 'cl2', invoiceId: 'i2', number: 'DP-00002', status: 'paid', createdAt: iso, name: 'Massage', quantity: 2, base: 2000, kind: 'flat', rate: 50, commission: 100, paid: false },
    { id: 'cl3', invoiceId: 'i3', number: 'DP-00003', status: 'void', createdAt: iso, name: 'Facial', quantity: 1, base: 500, kind: null, rate: null, commission: 0, paid: false },
  ],
});
const commissionRules = [
  { id: 'cr1', kind: 'percent', value: 10, performerId: 'pf1', performerName: 'Meena', serviceId: null, serviceName: null },
  { id: 'cr2', kind: 'flat', value: 50, performerId: null, performerName: null, serviceId: 's3', serviceName: 'Massage' },
];
const commissionPayouts = [{ id: 'po1', performerId: 'pf1', performerName: 'Meena', from: '2026-10-01', to: '2026-10-11', amount: 120, lines: 4, paidAt: iso, paidByName: 'Olive Owner' }];
const attendanceRows = [
  { id: 'a1', userId: 'u2', userName: 'Riya', workDate: '2026-10-29', status: 'checked_out',
    checkIn: { at: '2026-10-29T03:32:00.000Z', latitude: 13.0829, longitude: 80.2709, accuracyM: 12, distanceM: 28.4, deviceType: 'personal' },
    checkOut: { at: '2026-10-29T12:45:00.000Z', latitude: 13.0826, longitude: 80.2706, accuracyM: 9, distanceM: 14, deviceType: 'shared' } },
  { id: 'a2', userId: 'u3', userName: 'Farah', workDate: '2026-10-29', status: 'checked_in',
    checkIn: { at: '2026-10-29T03:50:00.000Z', latitude: 13.0828, longitude: 80.2708, accuracyM: 20, distanceM: 15, deviceType: 'shared' }, checkOut: null },
];
// Attendance by Staff: Meena checked in and out, Asha checked in and still here, Kavya not yet. Recorded by Riya (the check-out by Farah).
const staffRecord = (over: Record<string, unknown> = {}) => ({
  id: 'pa1', performerId: 'pf1', performerName: 'Meena', workDate: '2026-10-29', status: 'checked_out',
  checkInAt: '2026-10-29T04:35:00.000Z', checkOutAt: '2026-10-29T13:45:00.000Z',
  markedBy: { id: 'u2', name: 'Riya' }, checkOutMarkedBy: { id: 'u3', name: 'Farah' }, ...over,
});
const byStaffToday = (empty: boolean) => ({
  workDate: '2026-10-29', timezone: 'Asia/Kolkata',
  performers: empty ? [] : [
    { performerId: 'pf2', name: 'Asha', status: 'checked_in', record: staffRecord({ id: 'pa2', performerId: 'pf2', performerName: 'Asha', status: 'checked_in', checkOutAt: null, checkOutMarkedBy: null, checkInAt: '2026-10-29T04:40:00.000Z' }) },
    { performerId: 'pf4', name: 'Kavya', status: 'not_checked_in', record: null },
    { performerId: 'pf1', name: 'Meena', status: 'checked_out', record: staffRecord() },
  ],
});
const byStaffHistory = () => [
  staffRecord(),
  staffRecord({ id: 'pa2', performerId: 'pf2', performerName: 'Asha', status: 'checked_in', checkOutAt: null, checkOutMarkedBy: null }),
  staffRecord({ id: 'pa3', performerId: 'pf2', performerName: 'Asha', workDate: '2026-10-27', status: 'missed_checkout', checkInAt: '2026-10-27T04:30:00.000Z', checkOutAt: null, checkOutMarkedBy: null }),
];
const byStaffReport = (empty: boolean) => ({
  range: { from: '2026-10-23', to: '2026-10-29' }, timezone: 'Asia/Kolkata',
  totals: empty ? { records: 0, complete: 0, missedCheckout: 0, minutesWorked: 0 } : { records: 3, complete: 1, missedCheckout: 1, minutesWorked: 550 },
  people: empty ? [] : [
    { performerId: 'pf2', name: 'Asha', isActive: true, days: 2, complete: 0, missedCheckout: 1, minutesWorked: 0 },
    { performerId: 'pf1', name: 'Meena', isActive: true, days: 1, complete: 1, missedCheckout: 0, minutesWorked: 550 },
    { performerId: 'pf3', name: 'Old Hand', isActive: false, days: 0, complete: 0, missedCheckout: 0, minutesWorked: 0 },
  ],
});
const platformParlour = { id: 'pp1', name: 'Glow Salon', status: 'active', createdAt: iso, features: featuresWith(['page.team']),
  owner: { id: 'o1', name: 'Olive Owner', email: 'olive@glow.test', isActive: true, lastLoginAt: iso }, counts: { team: 3, bills: 42, customers: 18, services: 9 } };

/** The response for a GET, by path. `empty` gives the "nothing here yet" version of every list. */
export function respond(path: string, empty: boolean, o: Pick<OpenOptions, 'invoiceKind' | 'invoicePhone' | 'parlour' | 'off' | 'role'> = {}): unknown {
  const list = <T>(rows: T[]) => ({ data: empty ? [] : rows, meta: meta(empty ? 0 : rows.length) });
  const routes: [RegExp, () => unknown][] = [
    [/^\/parlour$/, () => ({ data: { ...parlour, ...o.parlour } })],
    [/^\/services$/, () => ({ data: empty ? [] : services })],
    [/^\/combos$/, () => ({ data: empty ? [] : combos })],
    [/^\/performers$/, () => ({ data: empty ? [] : o.role === 'staff' ? people.filter((p) => p.isActive).map(({ id, name, isActive }) => ({ id, name, isActive })) : people })],
    [/^\/commissions$/, () => ({ data: commissionReport(empty) })],
    [/^\/commissions\/rules$/, () => ({ data: empty ? [] : commissionRules })],
    [/^\/appointments\/queue$/, () => ({ data: { today: '2026-10-19', queue: empty ? [] : queueRows() } })],
    [/^\/appointments\/[^/]+$/, () => ({ data: visit() })],
    [/^\/appointments$/, () => ({ data: { date: '2026-10-19', today: '2026-10-19', timezone: 'Asia/Kolkata', appointments: empty ? [] : visits(), earlierOpen: empty ? { count: 0, oldest: null } : { count: 2, oldest: '2026-10-16' } } })],
    [/^\/commissions\/payouts$/, () => ({ data: empty ? [] : commissionPayouts })],
    [/^\/commissions\/performers\/[^/]+\/lines$/, () => ({ data: commissionLines(empty) })],
    [/^\/referrers\/lookup$/, () => ({ data: [{ id: 'r1', code: 'REF-0001', name: 'Anita Rao', percent: 10 }] })],
    [/^\/referrers\/[^/]+$/, () => ({ data: { ...referrers[0], voidedAfterPaid: empty ? 0 : 150, history: empty ? [] : [{ id: 'i1', number: 'DP-00001', customerName: 'Cara', percent: 10, discount: 90, total: 850.5, status: 'paid', createdAt: iso, paid: false }, { id: 'i2', number: 'DP-00002', customerName: 'Walk-in', percent: 10, discount: 150, total: 1400, status: 'void', createdAt: iso, paid: true }],
      payouts: empty ? [] : [{ id: 'rp1', amount: 90, bills: 1, paidAt: iso, paidByName: 'Olive Owner' }] } })],
    [/^\/referrers$/, () => list(referrers)],
    [/^\/customers\/[^/]+$/, () => ({ data: { ...customers[0], recentInvoices: empty ? [] : [{ id: 'i1', number: 'DP-00001', total: 850.5, status: 'paid', paymentMethod: 'upi', createdAt: iso }] } })],
    [/^\/customers$/, () => list(customers)],
    [/^\/invoices\/makers$/, () => ({ data: [{ id: 'u1', name: 'Riya' }, { id: 'u2', name: 'Farah' }] })],
    [/^\/invoices\/[^/]+$/, () => ({ data: invoice(o.invoicePhone === undefined ? '9000000005' : o.invoicePhone, o.invoiceKind) })],
    [/^\/invoices$/, () => list([invoiceRow])],
    [/^\/reports\/summary$/, () => ({ data: summary(empty, !o.off?.includes('page.performers')) })],
    [/^\/reports\/my-day$/, () => ({ data: { invoices: empty ? 0 : 3, revenue: empty ? 0 : 900 } })],
    [/^\/staff$/, () => ({ data: [
      { id: 'u1', name: 'Olive Owner', email: 'o@x.test', mobile: null, role: 'admin', isActive: true, lastLoginAt: iso, createdAt: iso },
      { id: 'u2', name: 'Riya', email: 'riya@x.test', mobile: '9840011111', role: 'staff', isActive: true, lastLoginAt: iso, createdAt: iso },
      { id: 'u3', name: 'Farah', email: 'farah@x.test', mobile: null, role: 'staff', isActive: false, lastLoginAt: null, createdAt: iso },
      // Staff who sign in with their mobile number alone, and an older member whose saved number is shorter than 10 digits.
      { id: 'u4', name: 'Kiosk Kim', email: null, mobile: '+91 98400 33333', role: 'staff', isActive: true, lastLoginAt: null, createdAt: iso },
      { id: 'u5', name: 'Old Timer', email: 'old@x.test', mobile: '12345678', role: 'staff', isActive: true, lastLoginAt: iso, createdAt: iso },
    ] })],
    [/^\/attendance\/today$/, () => ({ data: { workDate: '2026-10-29', timezone: 'Asia/Kolkata', configured: !empty, radiusM: 100, maxAccuracyM: 50, record: null } })],
    [/^\/attendance\/settings$/, () => ({ data: empty
      ? { configured: false, latitude: null, longitude: null, radiusM: 100, maxAccuracyM: 50, updatedAt: null }
      : { configured: true, latitude: 13.0827, longitude: 80.2707, radiusM: 100, maxAccuracyM: 50, updatedAt: iso } })],
    [/^\/attendance\/records$/, () => list(attendanceRows)],
    [/^\/performer-attendance\/today$/, () => ({ data: byStaffToday(empty) })],
    [/^\/performer-attendance\/history$/, () => list(byStaffHistory())],
    [/^\/performer-attendance\/report$/, () => ({ data: byStaffReport(empty) })],
    [/^\/platform\/features$/, () => ({ data: defs })],
    [/^\/platform\/summary$/, () => ({ data: { parlours: empty ? 0 : 5, active: empty ? 0 : 4, suspended: empty ? 0 : 1, bills: empty ? 0 : 320 } })],
    [/^\/platform\/parlours\/[^/]+$/, () => ({ data: platformParlour })],
    [/^\/platform\/parlours$/, () => list([platformParlour, { ...platformParlour, id: 'pp2', name: 'Calm Spa', status: 'suspended' }])],
  ];
  for (const [pattern, build] of routes) if (pattern.test(path)) return build();
  throw new Error(`Test harness has no response for GET ${path}. Add it to respond() in harness.ts.`);
}

// ───────────── opening a page ─────────────
export interface OpenOptions {
  role?: Role;
  /** Switches the platform admin turned off (a button is also off if its page is). */
  off?: string[];
  empty?: boolean;
  /** Overrides the saved customer phone etc. on the bill the invoice page loads. */
  invoicePhone?: string | null;
  /** Which bill the invoice page loads: made before the GST split existed (the default), with it, or with GST inside the prices. */
  invoiceKind?: InvoiceKind;
  /** Overrides settings on the parlour the pages load, e.g. { gstPriceMode: 'inclusive', taxPercent: 18 }. */
  parlour?: Record<string, unknown>;
  query?: string;
  /** Overrides fields of the signed-in user, e.g. { email: null, mobile: '9840033333' } for staff who sign in by mobile number. */
  user?: Record<string, unknown>;
}

export interface Page {
  host: HTMLElement;
  http: HttpTestingController;
  auth: AuthService;
  /** Answers every pending GET, then re-renders; repeats until nothing is pending. */
  settle(): Promise<void>;
  text(): string;
  /** Click the first button or link whose text matches. */
  click(label: RegExp | string): Promise<void>;
  type(selector: string, value: string): Promise<void>;
  expectOne(method: string, urlPart: string): TestRequest;
}

export async function open<T>(component: Type<T>, o: OpenOptions = {}): Promise<Page> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'page/:id', component }, { path: '**', component }]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const auth = TestBed.inject(AuthService);
  const http = TestBed.inject(HttpTestingController);

  if (o.role) {
    auth.login('t@t.test', 'pw').subscribe();
    const user = o.role === 'super_admin'
      ? { id: 'su', name: 'Platform Admin', email: 'p@p.test', mobile: null, role: 'super_admin', parlourId: null, parlourName: null, features: null, ...o.user }
      : { id: 'u1', name: 'Olive Owner', email: 'o@x.test', mobile: null, role: o.role, parlourId: 'p1', parlourName: 'Demo Parlour', features: featuresWith(o.off), ...o.user };
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ data: { accessToken: 'token', user } });
  }

  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(`/page/x1${o.query ?? ''}`, component);

  const pathOf = (url: string) => url.replace(environment.apiUrl, '').split('?')[0];
  const page: Page = {
    host: harness.fixture.nativeElement as HTMLElement,
    http,
    auth,
    async settle() {
      for (let i = 0; i < 8; i++) {
        harness.detectChanges();
        await harness.fixture.whenStable();
        const pending = http.match((r) => r.method === 'GET' && !r.url.includes('/whatsapp') && !r.url.includes('/reminder')); // tests inspect those themselves
        if (!pending.length) break;
        for (const r of pending) {
          r.flush(respond(pathOf(r.request.url), !!o.empty, o) as object);
        }
      }
      harness.detectChanges();
      await harness.fixture.whenStable();
    },
    text: () => page.host.textContent ?? '',
    async click(label) {
      const match = (el: Element) => (typeof label === 'string' ? (el.textContent ?? '').includes(label) : label.test(el.textContent ?? ''));
      const target = [...page.host.querySelectorAll('button, a')].find(match) as HTMLElement | undefined;
      if (!target) throw new Error(`No button or link matching ${label}. Page text: ${page.text().slice(0, 400)}`);
      target.click();
      await page.settle();
    },
    async type(selector, value) {
      const input = page.host.querySelector(selector) as HTMLInputElement | null;
      if (!input) throw new Error(`No element for ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await page.settle();
    },
    expectOne: (method, urlPart) => http.expectOne((r) => r.method === method && r.url.includes(urlPart)),
  };
  await page.settle();
  return page;
}
