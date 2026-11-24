import { HttpClient } from '@angular/common/http';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../environments/environment';
import { Role } from './core/models';
import { MySubscriptionComponent } from './features/admin/my-subscription.component';
import { ShellComponent } from './features/shell/shell.component';
import { ParlourDetailComponent } from './features/superadmin/parlour-detail.component';
import { PlanPaymentsComponent } from './features/superadmin/plan-payments.component';
import { PlansComponent } from './features/superadmin/plans.component';
import { SubscriptionsComponent } from './features/superadmin/subscriptions.component';
import { ALL_FEATURES, Page, installDomShims, open, respond } from './testing/harness';

// Subscription Management, through the real templates and the test harness's pretend API (the same way render.spec.ts tests everything else).
// What a parlour pays the platform for ParlourBill, entered by hand: none of it is the bills a parlour makes for its own customers.

jest.setTimeout(30000);
beforeAll(installDomShims);

const input = (page: Page, selector: string) => page.host.querySelector(selector) as HTMLInputElement | null;
const submit = async (page: Page, formId: string) => {
  const button = page.host.querySelector(`button[form="${formId}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`No submit button for #${formId}. Page text: ${page.text().slice(0, 300)}`);
  button.click();
  await page.settle();
};
const choose = async (page: Page, selector: string, value: string) => {
  const select = page.host.querySelector(selector) as HTMLSelectElement | null;
  if (!select) throw new Error(`No select for ${selector}`);
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await page.settle();
};
const posts = (page: Page) => page.http.match((r) => r.method !== 'GET');
const asSuper = (component: Type<unknown>, extra: { empty?: boolean; query?: string } = {}) => open(component, { role: 'super_admin', ...extra });

// ───────────── every new screen renders, with data and with nothing in it ─────────────

describe('the subscription screens render without runtime errors', () => {
  const PAGES: { name: string; component: Type<unknown>; role: Role; heading: RegExp }[] = [
    { name: 'Plans', component: PlansComponent, role: 'super_admin', heading: /Plans/ },
    { name: 'Subscriptions', component: SubscriptionsComponent, role: 'super_admin', heading: /Subscriptions/ },
    { name: 'Plan payments', component: PlanPaymentsComponent, role: 'super_admin', heading: /Plan payments/ },
    { name: 'My subscription', component: MySubscriptionComponent, role: 'admin', heading: /My subscription/ },
  ];
  for (const p of PAGES) {
    for (const empty of [false, true]) {
      it(`${p.name}, ${empty ? 'with nothing in it yet' : 'with data'}`, async () => {
        const page = await open(p.component, { role: p.role, empty });
        expect(page.text()).toMatch(p.heading);
        page.http.verify(); // no request left unanswered
      });
    }
  }
});

// ───────────── plans ─────────────

describe('the Plans page', () => {
  it('lists each plan with its prices, what it includes, its limits and how many parlours are on it', async () => {
    const page = await asSuper(PlansComponent);
    for (const text of ['Basic', 'Premium', 'Retired', '₹299', '₹999', 'Not sold yearly', 'Inactive', 'Team accounts: 3', 'No limits']) expect(page.text()).toContain(text);
    expect(page.text()).toMatch(/\d+ of \d+/);
  });

  it('says what it is for when there are no plans yet', async () => {
    const page = await asSuper(PlansComponent, { empty: true });
    expect(page.text()).toContain('No plans yet');
    expect(page.text()).toContain('Create a plan');
  });

  it('a new plan asks for the name, code, prices, what it includes and the limits', async () => {
    const page = await asSuper(PlansComponent);
    await page.click(/New plan/);
    expect(input(page, 'dialog[open]')).not.toBeNull();
    for (const text of ['Plan name', 'Code', 'Price per month', 'Price per year', 'What this plan includes', 'Usage limits', 'Team accounts', 'Bills are never limited']) expect(page.text()).toContain(text);
  });

  it('creating a plan sends the code, prices, every feature as included and every limit as none', async () => {
    const page = await asSuper(PlansComponent);
    await page.click(/New plan/);
    await page.type('#pl-name', 'Gold');
    await page.type('#pl-code', 'gold');
    await page.type('#pl-m', '1499');
    await submit(page, 'plan-form');
    const body = page.expectOne('POST', '/platform/subscription-plans').request.body;
    expect(body.code).toBe('gold');
    expect(body.name).toBe('Gold');
    expect(body.monthlyPrice).toBe(1499);
    expect(body.yearlyPrice).toBeNull();
    expect(body.isActive).toBe(true);
    expect(Object.values(body.features as Record<string, boolean>).every((v) => v === true)).toBe(true);
    expect(body.limits.max_users).toBeNull();
  });

  it('nothing is sent while the name, code or monthly price is missing, or a limit is not a whole number', async () => {
    const page = await asSuper(PlansComponent);
    await page.click(/New plan/);
    await submit(page, 'plan-form');
    expect(posts(page).length).toBe(0);
    expect(page.text()).toContain('Required');

    await page.type('#pl-name', 'Gold');
    await page.type('#pl-code', 'gold');
    await page.type('#pl-m', '1499');
    await page.type('#lim-max_users', '0');
    await submit(page, 'plan-form');
    expect(posts(page).length).toBe(0);
    expect(page.text()).toContain('Use a whole number of 1 or more');
  });

  it('editing keeps the code fixed, warns how many parlours are on the plan, and sends changed limits (no code)', async () => {
    const page = await asSuper(PlansComponent);
    await page.click(/Edit/);
    expect(page.text()).toContain('Edit Basic');
    expect(page.text()).toMatch(/3 parlours are on this plan/);
    expect((input(page, '#pl-code') as HTMLInputElement).disabled).toBe(true);
    await page.type('#lim-max_users', '');
    await page.type('#lim-max_customers', '100');
    await submit(page, 'plan-form');
    const body = page.expectOne('PATCH', '/platform/subscription-plans/sp1').request.body;
    expect('code' in body).toBe(false);
    expect(body.limits.max_users).toBeNull();
    expect(body.limits.max_customers).toBe(100);
    expect(body.features['page.commissions']).toBe(false); // left out of the plan, and stays so
  });

  it('deactivating a plan sends isActive false: the plan is switched off, never deleted', async () => {
    const page = await asSuper(PlansComponent);
    await page.click(/Deactivate/);
    const req = page.expectOne('PATCH', '/platform/subscription-plans/sp1');
    expect(req.request.body).toEqual({ isActive: false });
    expect(page.text()).not.toMatch(/Delete/);
  });
});

// ───────────── the overview ─────────────

describe('the Subscriptions overview', () => {
  it('shows the totals, recurring revenue and pending payments, and a row per parlour with its status and days left', async () => {
    const page = await asSuper(SubscriptionsComponent);
    for (const text of [
      'Total subscriptions', 'Active', 'Expired', 'Expiring soon', 'Monthly recurring revenue', '₹1,897', 'Yearly recurring revenue', '₹22,764',
      'Pending payments', 'Glow Salon', 'Calm Spa', 'Expired 5 days ago', '21 days left',
    ]) expect(page.text()).toContain(text);
    expect(page.text()).toContain('No payment is collected online');
  });

  it('filtering by status asks the server for that status, from the first page', async () => {
    const page = await asSuper(SubscriptionsComponent);
    const select = page.host.querySelector('select[aria-label="Status"]') as HTMLSelectElement;
    select.value = 'expired';
    select.dispatchEvent(new Event('change'));
    const req = page.http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/platform/subscriptions'));
    expect(req.request.params.get('status')).toBe('expired');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [], meta: { page: 1, limit: 20, total: 0, pages: 1 } });
    await page.settle();
    expect(page.text()).toContain('No subscription matches');
  });

  it('with nothing sold yet it explains that parlours keep working as before', async () => {
    const page = await asSuper(SubscriptionsComponent, { empty: true });
    expect(page.text()).toContain('exactly as it does today');
  });
});

describe('the Plan payments page', () => {
  it('lists payments across parlours with their method, reference and status, and only offers the moves that are allowed', async () => {
    const page = await asSuper(PlanPaymentsComponent);
    for (const text of ['Glow Salon', 'UTR1001', 'Cash', 'UPI', 'Paid', 'Pending']) expect(page.text()).toContain(text);
    expect(page.text()).toContain('not the bills a parlour makes for its own customers');
    const buttons = [...page.host.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
    expect(buttons).toContain('Mark received'); // the pending one
    expect(buttons).toContain('Mark failed');
    expect(buttons).toContain('Mark refunded'); // the paid one
    expect(buttons.filter((b) => b === 'Mark refunded').length).toBe(1);
  });

  it('opened from the overview’s “see them” link it starts on pending payments', async () => {
    const page = await asSuper(PlanPaymentsComponent, { query: '?status=pending' });
    expect((page.host.querySelector('select[aria-label="Status"]') as HTMLSelectElement).value).toBe('pending');
  });

  it('marking a payment received sends that status, and nothing is marked on its own', async () => {
    const page = await asSuper(PlanPaymentsComponent);
    expect(posts(page).length).toBe(0);
    await page.click(/Mark received/);
    expect(page.text()).toContain('Mark as received');
    await submit(page, 'payment-status-form');
    const req = page.expectOne('PATCH', '/platform/subscription-payments/sy2');
    expect(req.request.body.status).toBe('paid');
    expect('amount' in req.request.body).toBe(false); // the amount of a payment is never edited
  });
});

// ───────────── one parlour, on the platform admin's parlour page ─────────────

describe('the Subscription panel on a parlour’s page', () => {
  it('shows the plan, price, dates, days left, and the actions for an active subscription (and not Activate or Reactivate)', async () => {
    const page = await asSuper(ParlourDetailComponent);
    for (const text of ['Subscription', 'Basic', '₹299', '19 Oct 2026', '19 Nov 2026', '21 days left', 'Next renewal']) expect(page.text()).toContain(text);
    const buttons = [...page.host.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
    for (const label of ['Renew', 'Change plan', 'Suspend subscription', 'Remove plan', 'Record a payment']) expect(buttons.some((b) => b.includes(label))).toBe(true);
    expect(buttons.some((b) => b === 'Activate')).toBe(false);
    expect(buttons.some((b) => b === 'Reactivate subscription')).toBe(false);
  });

  it('for a parlour with no subscription it says it runs exactly as before, and offers to give a plan', async () => {
    const page = await asSuper(ParlourDetailComponent, { empty: true });
    expect(page.text()).toContain('No subscription');
    expect(page.text()).toContain('exactly as before subscriptions existed');
  });

  it('does not add or change any of the parlour’s own switches', async () => {
    const page = await asSuper(ParlourDetailComponent);
    expect([...page.host.querySelectorAll('[role="switch"]')].length).toBe(28); // the same count as before: the panel has none of its own
  });

  it('renewing explains it adds a period after the current expiry, and sends no payment unless one is ticked', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/^\s*Renew\s*$/);
    expect(page.text()).toMatch(/Adds one month after the current expiry date \(19 Nov 2026\)/);
    expect(page.text()).toContain('Record a payment now');
    await submit(page, 'sub-form');
    const req = page.expectOne('POST', '/platform/parlours/pp1/subscription/renew');
    expect(req.request.body).toEqual({});
    req.flush(respond('/platform/parlours/pp1/subscription', false) as object);
    await page.settle();
    expect(page.text()).not.toContain('Adds one month');
  });

  it('renewing with a payment sends the payment in the same request', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/^\s*Renew\s*$/);
    const tick = input(page, 'dialog[open] input[type="checkbox"]') as HTMLInputElement;
    tick.checked = true;
    tick.dispatchEvent(new Event('change'));
    await page.settle();
    await choose(page, 'dialog[open] select', 'cash');
    await submit(page, 'sub-form');
    const body = page.expectOne('POST', '/platform/parlours/pp1/subscription/renew').request.body;
    expect(body.payment).toEqual(expect.objectContaining({ amount: 299, method: 'cash', status: 'paid' }));
  });

  it('a UPI payment marked received needs its reference: nothing is sent without one', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/Record a payment/);
    expect(page.text()).toContain('Writes down money');
    await submit(page, 'sub-form');
    expect(posts(page).length).toBe(0);
    expect(page.text()).toContain('Enter the transaction reference');

    await page.type('dialog[open] input[autocomplete="off"][spellcheck="false"]', 'UTR2002');
    await submit(page, 'sub-form');
    const body = page.expectOne('POST', '/platform/parlours/pp1/subscription/payments').request.body;
    expect(body).toEqual(expect.objectContaining({ amount: 299, method: 'upi', status: 'paid', reference: 'UTR2002' }));
  });

  it('suspending needs a reason', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/^\s*Suspend subscription\s*$/); // the page also has a Suspend button for the parlour itself: this one is the subscription's
    await submit(page, 'sub-form');
    expect(posts(page).length).toBe(0);
    expect(page.text()).toContain('Say why');
    await page.type('#sf-reason', 'Cheque bounced');
    await submit(page, 'sub-form');
    expect(page.expectOne('POST', '/subscription/suspend').request.body).toEqual({ reason: 'Cheque bounced' });
  });

  it('changing the plan lists the active plans, marks the current one, and sends the new plan and cycle', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/Change plan/);
    expect(page.text()).toContain('(current)');
    expect(page.text()).toContain('Nothing is worked out pro rata');
    await submit(page, 'sub-form');
    const body = page.expectOne('POST', '/subscription/change-plan').request.body;
    expect(body.planId).toBe('sp2'); // the first plan that is not the current one
    expect(body.billingCycle).toBe('monthly');
  });

  it('removing explains it is for a mistake and that it is refused once money is recorded', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/^\s*Remove plan\s*$/);
    expect(page.text()).toContain('refused once any payment has been recorded');
  });

  it('the Payments tab lists what was recorded, and a pending payment can be marked received', async () => {
    const page = await asSuper(ParlourDetailComponent);
    for (const text of ['UTR1001', 'Will pay at the shop', 'Not the bills it makes for its own customers']) expect(page.text()).toContain(text);
    await page.click(/Mark received/);
    expect(page.text()).toContain('Mark as received');
  });

  it('the History tab tells what happened, in order, with who did it', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/^\s*History\s*$/);
    for (const text of ['Payment recorded', '₹299.00 by UPI (paid)', 'Activated', 'Plan assigned', 'Waiting to be activated', 'Platform Admin']) expect(page.text()).toContain(text);
  });

  it('“What they get” shows each page against the switch, the plan and the result, and says a plan never turns on what is switched off', async () => {
    const page = await asSuper(ParlourDetailComponent);
    await page.click(/What they get/);
    for (const text of ['Your switch', 'Plan', 'Result', 'Not included', 'Switched off by you above.', 'Not in the plan.', 'Team accounts', '2 of 3', '9 of no limit']) expect(page.text()).toContain(text);
    expect(page.text()).toContain('A plan never turns on anything you switched off');
  });
});

// ───────────── the parlour admin's own page ─────────────

describe('My subscription (the parlour admin)', () => {
  it('shows the plan, status, start and expiry dates, days left, renewal information, limits, what is included, and the payment history', async () => {
    const page = await open(MySubscriptionComponent, { role: 'admin' });
    for (const text of [
      'Standard', '₹599', 'Active', '19 Oct 2026', '19 Nov 2026', '21 days remaining', 'Next renewal due', 'Renews automatically', 'Payments still expected',
      'Team accounts', '3 of 8', '9 of no limit', 'Not in your plan', 'UTR1001', 'Everything a growing salon needs.',
    ]) expect(page.text()).toContain(text);
  });

  it('says renewal is done by the provider: nothing is charged here and nothing renews itself', async () => {
    const page = await open(MySubscriptionComponent, { role: 'admin' });
    expect(page.text()).toContain('Nothing is charged here and nothing renews by itself');
    expect(page.text()).toContain('not the bills you make for your customers');
    expect([...page.host.querySelectorAll('button')].some((b) => /pay|renew|upgrade|subscribe/i.test(b.textContent ?? ''))).toBe(false); // read only: no way to buy or change anything
  });

  it('a parlour with no subscription is told it is not on a plan', async () => {
    const page = await open(MySubscriptionComponent, { role: 'admin', empty: true });
    expect(page.text()).toContain('You are not on a plan');
  });

  it('reads only; it asks only for this parlour’s own subscription and payments', async () => {
    const page = await open(MySubscriptionComponent, { role: 'admin' });
    expect(posts(page).length).toBe(0);
  });
});

// ───────────── the sidebar and the notice ─────────────

describe('the sidebar and the subscription notice', () => {
  it('a parlour admin has My subscription, and it stays even when every switchable page is off', async () => {
    const all = await open(ShellComponent, { role: 'admin' });
    expect(all.text()).toContain('My subscription');
    TestBed.resetTestingModule();
    const none = await open(ShellComponent, { role: 'admin', off: ALL_FEATURES });
    expect(none.text()).toContain('My subscription');
    expect(none.text()).toContain('New bill');
  });

  it('staff have no subscription link; the platform admin has Subscriptions, Plans and Plan payments', async () => {
    const staff = await open(ShellComponent, { role: 'staff' });
    expect(staff.text()).not.toContain('subscription');
    expect(staff.text()).not.toContain('Plans');
    TestBed.resetTestingModule();
    const platform = await open(ShellComponent, { role: 'super_admin' });
    for (const label of ['Parlours', 'Subscriptions', 'Plans', 'Plan payments']) expect(platform.text()).toContain(label);
  });

  const notice = (subscription: Record<string, unknown>, role: Role = 'admin') => open(ShellComponent, { role, user: { subscription } });
  it('nothing is shown while the subscription is fine, or when the parlour has none', async () => {
    const fine = await notice({ status: 'active', planName: 'Standard', expiresOn: '2026-12-19', daysRemaining: 40, expiringSoon: false });
    expect(fine.text()).not.toContain('subscription has');
    expect(fine.text()).not.toContain('View subscription');
    TestBed.resetTestingModule();
    const none = await open(ShellComponent, { role: 'admin' });
    expect(none.text()).not.toContain('View subscription');
  });

  it('warns the admin when it is about to end, and when it has ended, been suspended or is waiting to be activated', async () => {
    const soon = await notice({ status: 'active', planName: 'Standard', expiresOn: '2026-11-01', daysRemaining: 3, expiringSoon: true });
    expect(soon.text()).toContain('Your Standard subscription ends in 3 days');
    expect(soon.text()).toContain('View subscription');
    TestBed.resetTestingModule();
    const tomorrow = await notice({ status: 'active', planName: 'Standard', expiresOn: '2026-11-01', daysRemaining: 1, expiringSoon: true });
    expect(tomorrow.text()).toContain('ends tomorrow');
    TestBed.resetTestingModule();
    const ended = await notice({ status: 'expired', planName: 'Standard', expiresOn: '2026-10-01', daysRemaining: 0, expiringSoon: false });
    expect(ended.text()).toContain('has ended. Only billing is available until it is renewed');
    TestBed.resetTestingModule();
    const held = await notice({ status: 'suspended', planName: 'Standard', expiresOn: '2026-12-01', daysRemaining: 0, expiringSoon: false });
    expect(held.text()).toContain('is suspended');
    TestBed.resetTestingModule();
    const waiting = await notice({ status: 'pending', planName: 'Standard', expiresOn: '2026-12-01', daysRemaining: 0, expiringSoon: false });
    expect(waiting.text()).toContain('has not been activated yet');
  });

  it('staff never see it, whatever the data says', async () => {
    const staff = await notice({ status: 'expired', planName: 'Standard', expiresOn: '2026-10-01', daysRemaining: 0, expiringSoon: false }, 'staff');
    expect(staff.text()).not.toContain('View subscription');
    expect(staff.text()).not.toContain('Standard');
  });
});

// ───────────── when the server refuses a feature the sidebar still showed ─────────────

describe('when the server says access has changed', () => {
  for (const code of ['FEATURE_DISABLED', 'PLAN_FEATURE_UNAVAILABLE', 'SUBSCRIPTION_INACTIVE']) {
    it(`${code} refreshes what the person can see (the sidebar and buttons)`, async () => {
      const page = await open(MySubscriptionComponent, { role: 'admin' });
      TestBed.inject(HttpClient).get(`${environment.apiUrl}/combos`).subscribe({ error: () => undefined });
      page.http.expectOne(`${environment.apiUrl}/combos`).flush({ error: { code, message: 'Not available' } }, { status: 403, statusText: 'Forbidden' });
      expect(page.http.match((r) => r.url.endsWith('/auth/me')).length).toBe(1);
    });
  }

  it('any other refusal does not', async () => {
    const page = await open(MySubscriptionComponent, { role: 'admin' });
    TestBed.inject(HttpClient).get(`${environment.apiUrl}/combos`).subscribe({ error: () => undefined });
    page.http.expectOne(`${environment.apiUrl}/combos`).flush({ error: { code: 'FORBIDDEN', message: 'No' } }, { status: 403, statusText: 'Forbidden' });
    expect(page.http.match((r) => r.url.endsWith('/auth/me')).length).toBe(0);
  });
});
