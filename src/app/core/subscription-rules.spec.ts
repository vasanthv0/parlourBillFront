import {
  CYCLE_LABEL, EVENT_LABEL, METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL, actionsFor, emptyPaymentDraft, eventDetail, formatDate, parseRupees,
  paymentBadge, paymentFromDraft, remainingText, statusBadge, todayIso,
} from './subscription-rules';
import type { PaymentDraft, SubscriptionEvent, SubscriptionPaymentMethod, SubscriptionStatus } from './subscriptions';

// The same ideas as billback/tests/subscriptions.unit.test.js, for the parts the browser decides on its own. The server makes every real
// decision again; these tests are about not offering the wrong button and not sending an obviously wrong form.

const REFERENCE: SubscriptionPaymentMethod[] = ['upi', 'bank_transfer', 'cheque', 'card'];
const draft = (over: Partial<PaymentDraft> = {}): PaymentDraft => ({ ...emptyPaymentDraft(), include: true, amount: '599', method: 'cash', ...over });

describe('what is shown for a subscription', () => {
  it('has a word for every status, billing cycle, payment method, payment status and history event', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(['active', 'expired', 'pending', 'suspended']);
    expect(Object.keys(CYCLE_LABEL).sort()).toEqual(['monthly', 'yearly']);
    expect(Object.keys(METHOD_LABEL).sort()).toEqual(['bank_transfer', 'card', 'cash', 'cheque', 'other', 'upi']);
    expect(Object.keys(PAYMENT_STATUS_LABEL).sort()).toEqual(['failed', 'paid', 'pending', 'refunded']);
    expect(Object.keys(EVENT_LABEL).sort()).toEqual(['activated', 'assigned', 'expired', 'payment_recorded', 'payment_updated', 'plan_changed', 'reactivated', 'renewed', 'suspended']);
  });

  it('colours a running subscription green, a waiting one amber and everything else red', () => {
    expect(statusBadge('active')).toBe('badge-paid');
    expect(statusBadge('pending')).toBe('badge-warn');
    expect(statusBadge('expired')).toBe('badge-void');
    expect(statusBadge('suspended')).toBe('badge-void');
    expect(paymentBadge('paid')).toBe('badge-paid');
    expect(paymentBadge('pending')).toBe('badge-warn');
    expect(paymentBadge('failed')).toBe('badge-void');
    expect(paymentBadge('refunded')).toBe('badge-void');
  });

  it('says how long is left, or how long ago it ended', () => {
    const t = (status: SubscriptionStatus, daysRemaining: number | null, daysOverdue: number | null) => remainingText({ status, daysRemaining, daysOverdue });
    expect(t('active', 30, null)).toBe('30 days left');
    expect(t('active', 1, null)).toBe('1 day left');
    expect(t('active', 0, null)).toBe('Ends today');
    expect(t('expired', null, 0)).toBe('Expired today');
    expect(t('expired', null, 1)).toBe('Expired 1 day ago');
    expect(t('expired', null, 27)).toBe('Expired 27 days ago');
    expect(t('pending', null, null)).toBe('Not started yet');
    expect(t('suspended', null, null)).toBe('Suspended');
  });

  it('gives today as YYYY-MM-DD, for pre-filling a date box', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('which buttons a subscription gets', () => {
  it('activates a pending one, renews an expired one and reactivates a suspended one: never the wrong one', () => {
    expect(actionsFor('pending')).toEqual(['activate', 'change', 'suspend', 'remove']);
    expect(actionsFor('active')).toEqual(['renew', 'change', 'suspend', 'remove']);
    expect(actionsFor('expired')).toEqual(['renew', 'change', 'remove']);
    expect(actionsFor('suspended')).toEqual(['reactivate', 'change', 'remove']);
  });
  it('never offers to renew what has not started or is suspended, and never to suspend what has already ended', () => {
    expect(actionsFor('pending')).not.toContain('renew');
    expect(actionsFor('suspended')).not.toContain('renew');
    expect(actionsFor('expired')).not.toContain('suspend');
    expect(actionsFor('active')).not.toContain('activate');
    expect(actionsFor('active')).not.toContain('reactivate');
  });
});

describe('reading an amount that was typed', () => {
  const GOOD: [string, number][] = [['599', 599], ['299.50', 299.5], ['1,250.75', 1250.75], ['₹ 999', 999], ['.5', 0.5], ['10.', 10], ['0', 0], ['2990', 2990]];
  for (const [typed, rupees] of GOOD) it(`"${typed}" is ${rupees}`, () => expect(parseRupees(typed)).toBe(rupees));
  const BAD = ['', 'abc', '-5', '1.234', '1e3', '.', '1.2.3', '12 34 5x'];
  for (const typed of BAD) it(`"${typed}" is not an amount`, () => expect(parseRupees(typed)).toBeNull());
});

describe('checking a payment before it is sent', () => {
  it('turns a good draft into the request body, leaving out what was not typed', () => {
    expect(paymentFromDraft(draft({ date: '2026-11-14' }), REFERENCE)).toEqual({ input: { amount: 599, method: 'cash', status: 'paid', paymentDate: '2026-11-14' } });
    expect(paymentFromDraft(draft({ method: 'upi', reference: ' UTR123 ', notes: ' paid at shop ', date: '' }), REFERENCE)).toEqual({
      input: { amount: 599, method: 'upi', status: 'paid', reference: 'UTR123', notes: 'paid at shop' },
    });
  });

  it('wants an amount above zero in rupees and paise', () => {
    for (const amount of ['', 'abc', '0', '-1', '12.345']) {
      const r = paymentFromDraft(draft({ amount }), REFERENCE);
      expect('errors' in r && 'amount' in r.errors).toBe(true);
    }
    const huge = paymentFromDraft(draft({ amount: '20000000' }), REFERENCE);
    expect('errors' in huge && huge.errors['amount']).toBe('That is too large');
  });

  it('wants a reference for UPI, bank, cheque and card when the money has been received, but not for cash, other, or one still expected', () => {
    for (const method of REFERENCE) {
      const r = paymentFromDraft(draft({ method, reference: '' }), REFERENCE);
      expect('errors' in r && 'reference' in r.errors).toBe(true);
      expect('input' in paymentFromDraft(draft({ method, reference: 'REF1' }), REFERENCE)).toBe(true);
      expect('input' in paymentFromDraft(draft({ method, reference: '', status: 'pending' }), REFERENCE)).toBe(true);
    }
    for (const method of ['cash', 'other'] as SubscriptionPaymentMethod[]) expect('input' in paymentFromDraft(draft({ method }), REFERENCE)).toBe(true);
  });

  it('keeps the reference and note within their limits', () => {
    const r = paymentFromDraft(draft({ reference: 'x'.repeat(101), notes: 'n'.repeat(501) }), REFERENCE);
    expect('errors' in r && Object.keys(r.errors).sort()).toEqual(['notes', 'reference']);
  });

  it('starts empty: not included, nothing typed, dated today, entered as received', () => {
    const d = emptyPaymentDraft();
    expect(d.include).toBe(false);
    expect(d.amount).toBe('');
    expect(d.status).toBe('paid');
    expect(d.date).toBe(todayIso());
    expect(emptyPaymentDraft(599).amount).toBe('599');
    expect(emptyPaymentDraft(0).amount).toBe('');
  });
});

describe('dates and history lines', () => {
  it('writes a date from its parts, with no time zone to move it', () => {
    expect(formatDate('2026-11-14')).toBe('14 Nov 2026');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDate('2028-02-29')).toBe('29 Feb 2028');
    expect(formatDate('2026-12-31T23:30:00Z')).toBe('31 Dec 2026');
    expect(formatDate(null)).toBe('');
    expect(formatDate('not a date')).toBe('');
  });

  const money = (n: number) => `₹${n}`;
  const ev = (over: Partial<SubscriptionEvent>): SubscriptionEvent => ({
    id: 'e', type: 'assigned', fromStatus: null, toStatus: null, planName: 'Basic', fromPlanName: null, billingCycle: 'monthly', oldExpiresOn: null, newExpiresOn: null,
    note: null, by: 'Platform Admin', at: '2026-11-14T10:00:00Z', payment: null, ...over,
  });

  it('describes each kind of event in one line', () => {
    expect(eventDetail(ev({ type: 'assigned', note: 'Waiting to be activated' }), money)).toBe('Basic, monthly · Waiting to be activated');
    expect(eventDetail(ev({ type: 'activated', newExpiresOn: '2026-12-14' }), money)).toBe('Runs until 14 Dec 2026');
    expect(eventDetail(ev({ type: 'renewed', oldExpiresOn: '2026-12-14', newExpiresOn: '2027-01-14' }), money)).toBe('Expiry 14 Dec 2026 → 14 Jan 2027');
    expect(eventDetail(ev({ type: 'renewed', oldExpiresOn: '2026-12-14', newExpiresOn: '2027-01-14', note: 'Started again after it expired' }), money)).toBe(
      'Expiry 14 Dec 2026 → 14 Jan 2027 · Started again after it expired');
    expect(eventDetail(ev({ type: 'plan_changed', planName: 'Premium', fromPlanName: 'Basic', note: 'Upgrade' }), money)).toBe('Basic → Premium · Upgrade');
    expect(eventDetail(ev({ type: 'plan_changed', planName: 'Basic', fromPlanName: 'Basic', note: 'Billing cycle monthly → yearly' }), money)).toBe('Basic · Billing cycle monthly → yearly');
    expect(eventDetail(ev({ type: 'suspended', note: 'Cheque bounced' }), money)).toBe('Cheque bounced');
    expect(eventDetail(ev({ type: 'reactivated' }), money)).toBe('');
    expect(eventDetail(ev({ type: 'expired', note: 'Reached its expiry date' }), money)).toBe('Reached its expiry date');
    expect(eventDetail(ev({ type: 'payment_recorded', payment: { id: 'p', amount: 299, method: 'upi', status: 'paid' } }), money)).toBe('₹299 by UPI (paid)');
    expect(eventDetail(ev({ type: 'payment_updated', note: 'Payment pending → paid' }), money)).toBe('Payment pending → paid');
  });
});
