import type {
  BillingCycle, PaymentInput, SubscriptionEvent, SubscriptionEventType, SubscriptionPaymentMethod, SubscriptionPaymentStatus, SubscriptionStatus,
} from './subscriptions';

// Words, date text and form rules for Subscription Management, shared by every screen. There is no Angular in this file on purpose, so it can
// be tested on its own (subscription-rules.spec.ts). The SERVER makes every real decision again; nothing here is a security check.

// ── Words ─────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<SubscriptionStatus, string> = { pending: 'Pending', active: 'Active', expired: 'Expired', suspended: 'Suspended' };
export const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: 'Monthly', yearly: 'Yearly' };
export const METHOD_LABEL: Record<SubscriptionPaymentMethod, string> = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank transfer', cheque: 'Cheque', card: 'Card', other: 'Other' };
export const PAYMENT_STATUS_LABEL: Record<SubscriptionPaymentStatus, string> = { pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded' };
export const EVENT_LABEL: Record<SubscriptionEventType, string> = {
  assigned: 'Plan assigned', activated: 'Activated', renewed: 'Renewed', plan_changed: 'Plan changed', suspended: 'Suspended',
  reactivated: 'Reactivated', expired: 'Expired', payment_recorded: 'Payment recorded', payment_updated: 'Payment updated',
};

/** The badge class for a status (the badge classes already in the style sheet): green when it is running, amber while it waits, red when it is not. */
export const statusBadge = (s: SubscriptionStatus): string => (s === 'active' ? 'badge-paid' : s === 'pending' ? 'badge-warn' : 'badge-void');
export const paymentBadge = (s: SubscriptionPaymentStatus): string => (s === 'paid' ? 'badge-paid' : s === 'pending' ? 'badge-warn' : 'badge-void');

/** "12 days left", "Ends today", "Expired 3 days ago". */
export function remainingText(s: { status: SubscriptionStatus; daysRemaining: number | null; daysOverdue: number | null }): string {
  if (s.status === 'active') {
    const d = s.daysRemaining ?? 0;
    return d === 0 ? 'Ends today' : d === 1 ? '1 day left' : `${d} days left`;
  }
  if (s.status === 'expired') {
    const d = s.daysOverdue ?? 0;
    return d === 0 ? 'Expired today' : d === 1 ? 'Expired 1 day ago' : `Expired ${d} days ago`;
  }
  return s.status === 'pending' ? 'Not started yet' : 'Suspended';
}

/** Today as 'YYYY-MM-DD' in the browser's own time, used only to PRE-FILL a date field. The server checks every date on its own clock. */
export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** '2026-11-14' as '14 Nov 2026'. Worked out from the parts, so no time zone can move the day. */
export function formatDate(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/** The one line of detail under an entry in a subscription's history. `money` formats an amount (the money pipe). */
export function eventDetail(e: SubscriptionEvent, money: (n: number) => string): string {
  const cycle = e.billingCycle ? CYCLE_LABEL[e.billingCycle].toLowerCase() : '';
  const parts: string[] = [];
  switch (e.type) {
    case 'assigned': parts.push([e.planName, cycle].filter(Boolean).join(', ')); break;
    case 'activated': if (e.newExpiresOn) parts.push(`Runs until ${formatDate(e.newExpiresOn)}`); break;
    case 'renewed': if (e.newExpiresOn) parts.push(`Expiry ${formatDate(e.oldExpiresOn)} → ${formatDate(e.newExpiresOn)}`); break;
    case 'plan_changed': parts.push(e.fromPlanName && e.fromPlanName !== e.planName ? `${e.fromPlanName} → ${e.planName}` : (e.planName ?? '')); break;
    case 'payment_recorded':
      if (e.payment) parts.push(`${money(e.payment.amount)} by ${METHOD_LABEL[e.payment.method]} (${PAYMENT_STATUS_LABEL[e.payment.status].toLowerCase()})`);
      break;
    default: break;
  }
  if (e.note) parts.push(e.note);
  return parts.filter(Boolean).join(' · ');
}

// ── What can be done to a subscription ────────────────────────────

export type SubscriptionAction = 'activate' | 'renew' | 'change' | 'suspend' | 'reactivate' | 'remove';

/**
 * The buttons that make sense for a subscription in each status. A pending one is activated (not renewed); an expired one is renewed; a
 * suspended one is reactivated first. The server applies the same rules and refuses anything else, so this only avoids offering a button that
 * would be refused. "Remove" is for one given by mistake: the server refuses it once any payment has been recorded.
 */
export function actionsFor(status: SubscriptionStatus): SubscriptionAction[] {
  switch (status) {
    case 'pending': return ['activate', 'change', 'suspend', 'remove'];
    case 'active': return ['renew', 'change', 'suspend', 'remove'];
    case 'expired': return ['renew', 'change', 'remove'];
    case 'suspended': return ['reactivate', 'change', 'remove'];
  }
}

// ── Typing a payment ──────────────────────────────────────────────

/** A typed amount in rupees with at most two decimals ("₹1,250.50" is fine), or null if it is not one. */
export function parseRupees(typed: string): number | null {
  const t = typed.replace(/[₹,\s]/g, '');
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** What is typed into the "record a payment" part of a dialog. Nothing is sent unless `include` is true. */
export interface PaymentDraft {
  include: boolean;
  amount: string;
  method: SubscriptionPaymentMethod;
  status: 'paid' | 'pending';
  date: string;
  reference: string;
  notes: string;
}
export const emptyPaymentDraft = (amount = 0): PaymentDraft => ({
  include: false,
  amount: amount > 0 ? String(amount) : '',
  method: 'upi',
  status: 'paid',
  date: todayIso(),
  reference: '',
  notes: '',
});

/**
 * Checks what was typed and turns it into the request body, or says what is wrong, field by field. The server checks it all again; this only
 * saves a round trip for the obvious mistakes. A payment recorded as received needs a reference for the traceable methods.
 */
export function paymentFromDraft(d: PaymentDraft, referenceRequired: readonly SubscriptionPaymentMethod[]): { input: PaymentInput } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const amount = parseRupees(d.amount);
  if (amount === null) errors['amount'] = 'Enter the amount, in rupees, with at most 2 decimals';
  else if (amount <= 0) errors['amount'] = 'Enter an amount above zero';
  else if (amount > 10_000_000) errors['amount'] = 'That is too large';
  const reference = d.reference.trim();
  if (d.status === 'paid' && referenceRequired.includes(d.method) && !reference) errors['reference'] = 'Enter the transaction reference, so the payment can be traced';
  if (reference.length > 100) errors['reference'] = 'Use 100 characters or fewer';
  if (d.notes.trim().length > 500) errors['notes'] = 'Use 500 characters or fewer';
  if (Object.keys(errors).length) return { errors };

  const input: PaymentInput = { amount: amount as number, method: d.method, status: d.status };
  if (d.date) input.paymentDate = d.date;
  if (reference) input.reference = reference;
  if (d.notes.trim()) input.notes = d.notes.trim();
  return { input };
}
