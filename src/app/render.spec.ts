import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Role } from './core/models';
import { LoginComponent } from './features/auth/login.component';
import { AttendanceLogComponent } from './features/admin/attendance-log.component';
import { CombosComponent } from './features/admin/combos.component';
import { CommissionsComponent } from './features/admin/commissions.component';
import { DashboardComponent } from './features/admin/dashboard.component';
import { PerformersComponent } from './features/admin/performers.component';
import { ReferralDetailComponent } from './features/admin/referral-detail.component';
import { ReferralsComponent } from './features/admin/referrals.component';
import { ServicesComponent } from './features/admin/services.component';
import { SettingsComponent } from './features/admin/settings.component';
import { TeamComponent } from './features/admin/team.component';
import { InventoryDashboardComponent } from './features/inventory/inventory-dashboard.component';
import { InventoryReportsComponent } from './features/inventory/inventory-reports.component';
import { ProductFormComponent } from './features/inventory/product-form.component';
import { ProductsComponent } from './features/inventory/products.component';
import { PurchasesComponent } from './features/inventory/purchases.component';
import { StockAdjustmentComponent } from './features/inventory/stock-adjustment.component';
import { StockMovementComponent } from './features/inventory/stock-movement.component';
import { SuppliersComponent } from './features/inventory/suppliers.component';
import { ShellComponent } from './features/shell/shell.component';
import { AppointmentsComponent } from './features/shared/appointments.component';
import { AccountComponent } from './features/shared/account.component';
import { AttendanceByStaffComponent } from './features/shared/attendance-by-staff.component';
import { AttendanceComponent } from './features/shared/attendance.component';
import { CustomersComponent } from './features/shared/customers.component';
import { InvoiceA4Component } from './features/shared/invoice-a4.component';
import { InvoiceDetailComponent } from './features/shared/invoice-detail.component';
import { InvoicesComponent } from './features/shared/invoices.component';
import { NewBillComponent } from './features/shared/new-bill.component';
import { ParlourDetailComponent } from './features/superadmin/parlour-detail.component';
import { ParloursComponent } from './features/superadmin/parlours.component';
import { Page, installDomShims, open } from './testing/harness';

jest.setTimeout(30000);
beforeAll(installDomShims);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const html = (page: { host: HTMLElement }, selector: string) => page.host.querySelector(selector);

/** Every screen, as the person who uses it. */
const PAGES: { name: string; component: Type<unknown>; role?: Role; heading: RegExp }[] = [
  { name: 'Sign in', component: LoginComponent, heading: /Sign in/ },
  { name: 'Dashboard', component: DashboardComponent, role: 'admin', heading: /Dashboard/ },
  { name: 'Services', component: ServicesComponent, role: 'admin', heading: /Services/ },
  { name: 'Combos', component: CombosComponent, role: 'admin', heading: /Combos/ },
  { name: 'Referrals', component: ReferralsComponent, role: 'admin', heading: /Referrals/ },
  { name: 'Referrer detail', component: ReferralDetailComponent, role: 'admin', heading: /Anita Rao/ },
  { name: 'Performers', component: PerformersComponent, role: 'admin', heading: /Performers/ },
  { name: 'Commissions', component: CommissionsComponent, role: 'admin', heading: /Commissions/ },
  { name: 'Team', component: TeamComponent, role: 'admin', heading: /Team/ },
  { name: 'Settings', component: SettingsComponent, role: 'admin', heading: /Settings/ },
  { name: 'Customers (admin)', component: CustomersComponent, role: 'admin', heading: /Customers/ },
  { name: 'Customers (staff)', component: CustomersComponent, role: 'staff', heading: /Customers/ },
  { name: 'All bills', component: InvoicesComponent, role: 'admin', heading: /All bills/ },
  { name: 'My bills', component: InvoicesComponent, role: 'staff', heading: /My bills/ },
  { name: 'Bill (admin)', component: InvoiceDetailComponent, role: 'admin', heading: /Demo Parlour/ },
  { name: 'Bill (staff)', component: InvoiceDetailComponent, role: 'staff', heading: /Demo Parlour/ },
  { name: 'A4 invoice (admin)', component: InvoiceA4Component, role: 'admin', heading: /TAX INVOICE/ },
  { name: 'A4 invoice (staff)', component: InvoiceA4Component, role: 'staff', heading: /TAX INVOICE/ },
  { name: 'New bill (admin)', component: NewBillComponent, role: 'admin', heading: /New bill/ },
  { name: 'New bill (staff)', component: NewBillComponent, role: 'staff', heading: /New bill/ },
  { name: 'Appointments (admin)', component: AppointmentsComponent, role: 'admin', heading: /Appointments/ },
  { name: 'Appointments (staff)', component: AppointmentsComponent, role: 'staff', heading: /Appointments/ },
  { name: 'Account', component: AccountComponent, role: 'staff', heading: /Account/ },
  { name: 'Attendance (staff)', component: AttendanceComponent, role: 'staff', heading: /Attendance/ },
  { name: 'Attendance (admin)', component: AttendanceComponent, role: 'admin', heading: /Attendance/ },
  { name: 'Staff attendance (admin)', component: AttendanceLogComponent, role: 'admin', heading: /Staff attendance/ },
  { name: 'Attendance by Staff (admin)', component: AttendanceByStaffComponent, role: 'admin', heading: /Attendance by Staff/ },
  { name: 'Attendance by Staff (staff)', component: AttendanceByStaffComponent, role: 'staff', heading: /Attendance by Staff/ },
  { name: 'Parlours (platform admin)', component: ParloursComponent, role: 'super_admin', heading: /Parlours/ },
  { name: 'Parlour detail (platform admin)', component: ParlourDetailComponent, role: 'super_admin', heading: /Glow Salon/ },
  { name: 'Inventory dashboard', component: InventoryDashboardComponent, role: 'admin', heading: /Needs attention|No products yet/ },
  { name: 'Inventory products', component: ProductsComponent, role: 'admin', heading: /Products/ },
  { name: 'Inventory product form', component: ProductFormComponent, role: 'admin', heading: /Add product/ },
  { name: 'Inventory stock in/out', component: StockMovementComponent, role: 'admin', heading: /Stock in \/ out/ },
  { name: 'Inventory adjustment', component: StockAdjustmentComponent, role: 'admin', heading: /Stock adjustment/ },
  { name: 'Inventory purchases', component: PurchasesComponent, role: 'admin', heading: /Purchases/ },
  { name: 'Inventory suppliers', component: SuppliersComponent, role: 'admin', heading: /Suppliers/ },
  { name: 'Inventory reports', component: InventoryReportsComponent, role: 'admin', heading: /Reports/ },
  { name: 'Sidebar shell (admin)', component: ShellComponent, role: 'admin', heading: /Demo Parlour/ },
];

describe('every page renders without runtime errors', () => {
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

describe('the platform admin\'s switches change what each page offers', () => {
  const ADD_BUTTONS: { name: string; component: Type<unknown>; key: string; label: RegExp }[] = [
    { name: 'Combos', component: CombosComponent, key: 'action.combos.add', label: /New combo/ },
    { name: 'Referrals', component: ReferralsComponent, key: 'action.referrals.add', label: /New referrer/ },
    { name: 'Services', component: ServicesComponent, key: 'action.services.add', label: /Add service/ },
    { name: 'Team', component: TeamComponent, key: 'action.team.add', label: /Add team member/ },
    { name: 'Performers', component: PerformersComponent, key: 'action.performers.add', label: /Add performer/ },
  ];
  for (const b of ADD_BUTTONS) {
    it(`${b.name}: the add button is shown when on and gone when off`, async () => {
      const on = await open(b.component, { role: 'admin' });
      expect(on.text()).toMatch(b.label);
      TestBed.resetTestingModule();
      const off = await open(b.component, { role: 'admin', off: [b.key] });
      expect(off.text()).not.toMatch(b.label);
      expect(off.text()).toMatch(new RegExp(b.name)); // the page itself is still there
    });
  }

  it('sidebar: switched-off pages disappear, per role', async () => {
    const all = await open(ShellComponent, { role: 'admin' });
    for (const label of ['Dashboard', 'New bill', 'All bills', 'Customers', 'Services', 'Combos', 'Referrals', 'Performers', 'Commissions', 'Team', 'Settings', 'My attendance', 'Staff attendance']) expect(all.text()).toContain(label);
    TestBed.resetTestingModule();

    const fewer = await open(ShellComponent, { role: 'admin', off: ['page.team', 'page.referrals', 'page.services'] });
    for (const gone of ['Team', 'Referrals', 'Services']) expect(fewer.text()).not.toContain(gone);
    for (const kept of ['Dashboard', 'Combos', 'Customers', 'Settings', 'New bill']) expect(fewer.text()).toContain(kept);
    TestBed.resetTestingModule();

    const staff = await open(ShellComponent, { role: 'staff' });
    for (const kept of ['New bill', 'My bills', 'Customers', 'Attendance']) expect(staff.text()).toContain(kept);
    for (const gone of ['Dashboard', 'Combos', 'Team', 'Settings', 'Parlours']) expect(staff.text()).not.toContain(gone);
    TestBed.resetTestingModule();

    const platform = await open(ShellComponent, { role: 'super_admin' });
    expect(platform.text()).toContain('Parlours');
    expect(platform.text()).toContain('Platform admin');
    for (const gone of ['Dashboard', 'New bill', 'Team']) expect(platform.text()).not.toContain(gone);
  });

  it('the home page for an admin follows the Dashboard switch', async () => {
    const withDash = await open(ShellComponent, { role: 'admin' });
    expect(withDash.auth.homePath()).toBe('/admin/dashboard');
    TestBed.resetTestingModule();
    const without = await open(ShellComponent, { role: 'admin', off: ['page.dashboard'] });
    expect(without.auth.homePath()).toBe('/admin/new-bill');
  });
});

describe('sign in', () => {
  it('has no sign-up link', async () => {
    const page = await open(LoginComponent);
    expect(page.text()).not.toMatch(/create (an )?account|register|sign up/i);
    expect(page.text()).toMatch(/Need access/);
  });
});

describe('forms open and work', () => {
  const FORMS: { name: string; component: Type<unknown>; role: Role; button: RegExp; expectText: RegExp }[] = [
    { name: 'new combo', component: CombosComponent, role: 'admin', button: /New combo/, expectText: /Services in this combo/ },
    { name: 'new referrer', component: ReferralsComponent, role: 'admin', button: /New referrer/, expectText: /Referral percentage/ },
    { name: 'new service', component: ServicesComponent, role: 'admin', button: /Add service/, expectText: /Duration \(minutes\)/ },
    { name: 'new team member', component: TeamComponent, role: 'admin', button: /Add team member/, expectText: /Temporary password/ },
    { name: 'new performer', component: PerformersComponent, role: 'admin', button: /Add performer/, expectText: /Name/ },
    { name: 'new commission rule', component: CommissionsComponent, role: 'admin', button: /Add rule/, expectText: /How it is worked out/ },
    { name: 'new customer', component: CustomersComponent, role: 'admin', button: /Add customer/, expectText: /Notes/ },
    { name: 'new parlour', component: ParloursComponent, role: 'super_admin', button: /New parlour/, expectText: /Pages and buttons/ },
  ];
  for (const f of FORMS) {
    it(`${f.name} opens`, async () => {
      const page = await open(f.component, { role: f.role });
      await page.click(f.button);
      expect(html(page, 'dialog[open]')).not.toBeNull();
      expect(page.text()).toMatch(f.expectText);
    });
  }

  it('adding a referrer shows the generated referral ID', async () => {
    const page = await open(ReferralsComponent, { role: 'admin' });
    await page.click(/New referrer/);
    await page.type('#r-name', 'New Person');
    await page.type('#r-contact', '9841100077');
    await page.type('#r-percent', '12.5');
    await page.click(/Add referrer/);
    const req = page.expectOne('POST', '/referrers');
    expect(req.request.body).toEqual({ name: 'New Person', contact: '9841100077', percent: 12.5 });
    req.flush({ data: { id: 'r9', code: 'REF-0003', name: 'New Person', contact: '9841100077', percent: 12.5, isActive: true, createdAt: '2026-10-18', bills: 0, totalDiscount: 0, lastUsedAt: null, canDelete: true } });
    await page.settle();
    expect(page.text()).toContain('REF-0003');
    expect(page.text()).toMatch(/Give this ID to New Person/);
  });

  it('adding a customer needs a phone number with at least 10 digits, and nothing is sent until it has one', async () => {
    const page = await open(CustomersComponent, { role: 'admin' });
    await page.click(/Add customer/);
    await page.type('#c-name', 'New Person');
    await page.type('#c-phone', '123456789');                       // only 9 digits
    await page.click(/Save customer/);
    expect(page.text()).toContain('Enter a phone number with at least 10 digits');
    page.http.expectNone((r) => r.method === 'POST' && r.url.includes('/customers'));

    await page.type('#c-phone', '+91 98400 12345');                 // formatting is fine; it is kept as typed
    await page.click(/Save customer/);
    const req = page.expectOne('POST', '/customers');
    expect(req.request.body).toEqual({ name: 'New Person', phone: '+91 98400 12345', email: null, notes: null });
  });

  it('a combo shows what the customer saves while it is being built', async () => {
    const page = await open(CombosComponent, { role: 'admin' });
    await page.click(/New combo/);
    const select = html(page, 'select') as HTMLSelectElement;
    select.value = 's2'; select.dispatchEvent(new Event('change')); await page.settle(); // Facial 500
    await page.click(/^\s*Add\s*$/);
    select.value = 's1'; select.dispatchEvent(new Event('change')); await page.settle(); // Haircut 200
    await page.click(/^\s*Add\s*$/);
    await page.type('#cb-price', '600');
    expect(page.text()).toMatch(/Separately\s*₹700\.00/);
    expect(page.text()).toMatch(/Customer saves\s*₹100\.00/);
  });
});

describe('the billing screen', () => {
  it('adds a service, applies a referral and an extra discount, and the total matches the server maths (₹892.50)', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);                                   // ₹1,000
    await page.type('input[aria-label="Referral name or ID"]', 'ani');
    await sleep(350);                                              // the search waits a moment after typing
    await page.settle();
    await page.click(/Anita Rao/);                                 // 10% referral
    await page.type('#discount', '50');
    expect(page.text()).toContain('Referral discount (10%)');
    expect(page.text()).toContain('₹100.00');
    expect(page.text()).toContain('₹892.50');                      // 1000 − 100 − 50 = 850, + 5% GST (42.50)

    await page.click(/Save bill/);
    const req = page.expectOne('POST', '/invoices');
    expect(req.request.body).toEqual({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: 'r1', discount: 50, paymentMethod: 'cash' });
  });

  it('adds a combo as one line and sends it as a combo', async () => {
    const page = await open(NewBillComponent, { role: 'staff' });
    expect(page.text()).not.toContain('Broken Pack');              // a combo with an archived service is never offered
    await page.click(/^\s*Combos/);
    await page.click(/Glow Pack/);
    expect(page.text()).toContain('Haircut + Facial');
    expect(page.text()).toContain('₹630');                         // 600 + 5% GST
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.items).toEqual([{ comboId: 'c1', quantity: 1 }]);
  });

  describe('saving safely: one Idempotency-Key per bill', () => {
    const keyOf = (req: { request: { headers: { get(name: string): string | null } } }) => req.request.headers.get('Idempotency-Key');
    const serverError = { error: { code: 'INTERNAL', message: 'Something went wrong on our side' } };

    it('sends a key with the bill, in a header and not in the body', async () => {
      const page = await open(NewBillComponent, { role: 'staff' });
      await page.click(/Massage/);
      await page.click(/Save bill/);
      const req = page.expectOne('POST', '/invoices');
      expect(keyOf(req)).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
      expect(JSON.stringify(req.request.body)).not.toMatch(/idempotency/i);
    });

    it('tapping Save again on the same bill after the connection dropped sends the SAME key, so a bill the server already saved is not made twice', async () => {
      const page = await open(NewBillComponent, { role: 'staff' });
      await page.click(/Massage/);
      await page.click(/Save bill/);
      const first = page.expectOne('POST', '/invoices');
      const key = keyOf(first);
      first.error(new ProgressEvent('error'));                      // no answer came back: the server may or may not have saved it
      await page.settle();
      expect(page.text()).toMatch(/Save bill/);                      // the button is usable again

      await page.click(/Save bill/);
      expect(keyOf(page.expectOne('POST', '/invoices'))).toBe(key);
    });

    it('a server error keeps the key too, and a changed bill gets a new one', async () => {
      const page = await open(NewBillComponent, { role: 'staff' });
      await page.click(/Massage/);
      await page.click(/Save bill/);
      const first = page.expectOne('POST', '/invoices');
      const keyOne = keyOf(first);
      first.flush(serverError, { status: 500, statusText: 'Server Error' });
      await page.settle();

      await page.click(/Haircut/);                                   // the bill changes: a different bill, a different key
      await page.click(/Save bill/);
      const second = page.expectOne('POST', '/invoices');
      const keyTwo = keyOf(second);
      expect(keyTwo).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
      expect(keyTwo).not.toBe(keyOne);
      second.flush(serverError, { status: 500, statusText: 'Server Error' });
      await page.settle();

      await page.click(/Save bill/);                                 // unchanged since the last try: same key as the last try
      expect(keyOf(page.expectOne('POST', '/invoices'))).toBe(keyTwo);
    });

    it('if the server says the key clashed with a different bill, the next Save starts a fresh attempt', async () => {
      const page = await open(NewBillComponent, { role: 'staff' });
      await page.click(/Massage/);
      await page.click(/Save bill/);
      const first = page.expectOne('POST', '/invoices');
      const keyOne = keyOf(first);
      first.flush({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'This request ID was already used for a different bill.' } }, { status: 409, statusText: 'Conflict' });
      await page.settle();

      await page.click(/Save bill/);
      const second = keyOf(page.expectOne('POST', '/invoices'));
      expect(second).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
      expect(second).not.toBe(keyOne);
    });
  });

  it('hides the referral box, the customer search and the combos tab when those are switched off', async () => {
    const page = await open(NewBillComponent, { role: 'staff', off: ['page.referrals', 'page.customers', 'page.combos'] });
    expect(html(page, 'input[aria-label="Referral name or ID"]')).toBeNull();
    expect(html(page, 'input[aria-label="Search customer"]')).toBeNull();
    expect(page.text()).not.toMatch(/Combos/);
    await page.click(/Massage/);
    expect(page.text()).toContain('₹1,050');                       // services still bill normally
  });
});

describe('a saved bill', () => {
  const fakeWindow = () => {
    const win = { location: { href: '' }, close: jest.fn(), opener: {} as unknown };
    jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    return win;
  };
  afterEach(() => jest.restoreAllMocks());

  it('shows the combo contents and the referral discount', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    expect(page.text()).toContain('Glow Pack');
    expect(page.text()).toContain('Haircut + Facial');
    expect(page.text()).toContain('Referral discount (Anita Rao, 10%)');
  });

  it('WhatsApp: uses the saved number and opens the link the server builds', async () => {
    const win = fakeWindow();
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(/WhatsApp/);
    const req = page.expectOne('GET', '/whatsapp');
    expect(req.request.params.has('phone')).toBe(false);
    req.flush({ data: { url: 'https://wa.me/919000000005?text=Hello', message: 'Hello', phone: '919000000005' } });
    await page.settle();
    expect(win.location.href).toBe('https://wa.me/919000000005?text=Hello');
  });

  it('WhatsApp: a customer with no saved number is asked for one first', async () => {
    const win = fakeWindow();
    const page = await open(InvoiceDetailComponent, { role: 'staff', invoicePhone: null });
    await page.click(/WhatsApp/);
    expect(page.text()).toContain('no saved number');
    page.http.expectNone((r) => r.url.includes('/whatsapp'));       // nothing is sent until a number is entered
    await page.type('#wa-phone', '98400 12345');
    await page.click(/Open WhatsApp/);
    const req = page.expectOne('GET', '/whatsapp');
    expect(req.request.params.get('phone')).toBe('98400 12345');
    req.flush({ data: { url: 'https://wa.me/919840012345?text=Hi', message: 'Hi', phone: '919840012345' } });
    await page.settle();
    expect(win.location.href).toContain('919840012345');
  });

  it('WhatsApp: a bad number from the server is shown on the form', async () => {
    fakeWindow();
    const page = await open(InvoiceDetailComponent, { role: 'staff', invoicePhone: null });
    await page.click(/WhatsApp/);
    await page.type('#wa-phone', '123');
    await page.click(/Open WhatsApp/);
    page.expectOne('GET', '/whatsapp').flush({ error: { code: 'INVALID_PHONE', message: 'That does not look like a valid phone number' } }, { status: 400, statusText: 'Bad Request' });
    await page.settle();
    expect(page.text()).toContain('does not look like a valid phone number');
  });

  it('WhatsApp button follows its switch; only admins can void', async () => {
    // Task 6 added two more WhatsApp buttons (the invoice as a PDF and as an image), each with its own switch: with only the text button
    // switched off they stay (see invoice-a4.spec.ts); for "no WhatsApp anywhere" all three are off.
    const off = await open(InvoiceDetailComponent, { role: 'admin', off: ['action.whatsapp.send', 'action.whatsapp.invoice_pdf', 'action.whatsapp.invoice_image'] });
    expect(off.text()).not.toContain('WhatsApp');
    expect(off.text()).toContain('Void bill');
    TestBed.resetTestingModule();
    const staff = await open(InvoiceDetailComponent, { role: 'staff' });
    expect(staff.text()).toContain('WhatsApp');
    expect(staff.text()).not.toContain('Void bill');
  });
});

describe('paying a bill: one method, split across methods, and a tip', () => {
  const saveButton = (page: { host: HTMLElement }) => [...page.host.querySelectorAll('button')].find((b) => /Save bill/.test(b.textContent ?? '')) as HTMLButtonElement;
  const box = (page: { host: HTMLElement }, id: string) => page.host.querySelector(`#${id}`) as HTMLInputElement;
  const restButton = async (page: { host: HTMLElement; settle(): Promise<void> }, index: number) => {
    ([...page.host.querySelectorAll('.split-row button')][index] as HTMLElement).click();
    await page.settle();
  };
  /** ₹1,000 massage with 5% GST on top: a bill of ₹1,050. */
  const massage = async (opts: Parameters<typeof open>[1] = { role: 'staff' }) => {
    const page = await open(NewBillComponent, opts);
    await page.click(/Massage/);
    return page;
  };

  it('pays with one method by default: no split boxes, the Split payment button and the Tip box are there, and the request is the old one', async () => {
    const page = await massage();
    expect(page.text()).toContain('Split payment');
    expect(box(page, 'tip')).toBeTruthy();
    expect(box(page, 'pay-cash')).toBeNull();
    await page.click(/^\s*UPI\s*$/);
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body).toEqual({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: null, discount: 0, paymentMethod: 'upi' });
  });

  it('splits a bill: the whole bill starts on the chosen method, "Rest" fills the other, and Save is allowed once it adds up to the paisa', async () => {
    const page = await massage();
    await page.click(/Split payment/);
    expect(box(page, 'pay-cash').value).toBe('1050');            // the whole bill starts on the method already chosen
    expect(page.text()).toContain('Adds up to the total');
    await page.type('#pay-cash', '600');
    expect(page.text()).toMatch(/₹450\.00\s*still to pay/);
    expect(saveButton(page).disabled).toBe(true);
    await restButton(page, 1);                                    // UPI takes the rest
    expect(box(page, 'pay-upi').value).toBe('450');
    expect(page.text()).toContain('Adds up to the total');
    expect(saveButton(page).disabled).toBe(false);

    await page.click(/Save bill/);
    const body = page.expectOne('POST', '/invoices').request.body;
    expect(body).toEqual({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: null, discount: 0, payments: [{ method: 'cash', amount: 600 }, { method: 'upi', amount: 450 }] });
    expect('paymentMethod' in body).toBe(false);                  // one or the other, never both
    expect('tip' in body).toBe(false);
  });

  it('one paisa short or over blocks Save and says so; something that is not an amount does too', async () => {
    const page = await massage();
    await page.click(/Split payment/);
    await page.type('#pay-cash', '600');
    await page.type('#pay-upi', '449.99');
    expect(page.text()).toMatch(/₹0\.01\s*still to pay/);
    expect(saveButton(page).disabled).toBe(true);
    await page.type('#pay-upi', '450.01');
    expect(page.text()).toMatch(/₹0\.01\s*too much/);
    expect(saveButton(page).disabled).toBe(true);
    await page.type('#pay-upi', 'abc');
    expect(page.text()).toContain('Enter amounts like 100 or 99.50');
    expect(saveButton(page).disabled).toBe(true);
    await page.type('#pay-upi', '450');
    expect(saveButton(page).disabled).toBe(false);
  });

  it('three methods on an amount that does not divide by three: ₹350 + ₹350 + ₹350 is the whole ₹1,050; a paisa less is not', async () => {
    const page = await massage();
    await page.click(/Split payment/);
    await page.type('#pay-cash', '350'); await page.type('#pay-upi', '350'); await page.type('#pay-card', '349.99');
    expect(saveButton(page).disabled).toBe(true);
    await page.type('#pay-card', '350');
    expect(saveButton(page).disabled).toBe(false);
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.payments).toEqual([{ method: 'cash', amount: 350 }, { method: 'upi', amount: 350 }, { method: 'card', amount: 350 }]);
  });

  it('a method left blank or at 0 is not sent; going back to one method sends the old shape', async () => {
    const page = await massage();
    await page.click(/Split payment/);
    await page.type('#pay-cash', '0'); await page.type('#pay-card', '1050');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.payments).toEqual([{ method: 'card', amount: 1050 }]);
    TestBed.resetTestingModule();

    const again = await massage();
    await again.click(/Split payment/);
    await again.click(/Pay with one method/);
    expect(box(again, 'pay-cash')).toBeNull();
    await again.click(/Save bill/);
    expect(again.expectOne('POST', '/invoices').request.body.paymentMethod).toBe('cash');
  });

  it('changing the bill after splitting shows what is now left to pay', async () => {
    const page = await massage();
    await page.click(/Split payment/);
    await page.type('#pay-cash', '1050');
    expect(saveButton(page).disabled).toBe(false);
    await page.type('#discount', '50');                           // the total is now ₹997.50
    expect(page.text()).toMatch(/₹52\.50\s*too much/);
    expect(saveButton(page).disabled).toBe(true);
  });

  it('a tip is sent beside the payment, is not added to the total, and is left out when blank or 0', async () => {
    const page = await massage();
    await page.type('#tip', '50');
    expect(page.text()).toMatch(/Save bill · ₹1,050(\.00)?\b/);   // the tip is not in the total
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body).toEqual({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: null, discount: 0, paymentMethod: 'cash', tip: 50 });
    TestBed.resetTestingModule();

    const zero = await massage();
    await zero.type('#tip', '0');
    await zero.click(/Save bill/);
    expect('tip' in zero.expectOne('POST', '/invoices').request.body).toBe(false);
  });

  it('a tip that is not an amount blocks Save and says so; a tip with a split payment is sent too', async () => {
    const page = await massage();
    await page.type('#tip', '5o');
    expect(page.text()).toContain('Enter an amount like 50 or 49.50');
    expect(saveButton(page).disabled).toBe(true);
    await page.type('#tip', '49.5');
    expect(saveButton(page).disabled).toBe(false);
    await page.click(/Split payment/);
    await page.type('#pay-cash', '1000'); await page.type('#pay-upi', '50');
    await page.click(/Save bill/);
    const body = page.expectOne('POST', '/invoices').request.body;
    expect(body.tip).toBe(49.5);
    expect(body.payments).toEqual([{ method: 'cash', amount: 1000 }, { method: 'upi', amount: 50 }]);
  });

  it('the Split payment button and the Tip box each follow their own switch; one method always works', async () => {
    const noSplit = await massage({ role: 'staff', off: ['action.payments.split'] });
    expect(noSplit.text()).not.toContain('Split payment');
    expect(box(noSplit, 'tip')).toBeTruthy();
    TestBed.resetTestingModule();

    const noTip = await massage({ role: 'admin', off: ['action.payments.tip'] });
    expect(noTip.text()).toContain('Split payment');
    expect(box(noTip, 'tip')).toBeNull();
    TestBed.resetTestingModule();

    const neither = await massage({ role: 'staff', off: ['action.payments.split', 'action.payments.tip'] });
    expect(neither.text()).not.toContain('Split payment');
    expect(box(neither, 'tip')).toBeNull();
    await neither.click(/Save bill/);
    expect(neither.expectOne('POST', '/invoices').request.body).toEqual({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: null, discount: 0, paymentMethod: 'cash' });
  });

  it('a bill of ₹0 has nothing to split', async () => {
    const page = await massage();
    await page.type('#discount', '1000');
    expect(page.text()).not.toContain('Split payment');
    expect(saveButton(page).disabled).toBe(false);
  });

  it('Clear bill also clears the tip and goes back to one method', async () => {
    const page = await massage();
    await page.type('#tip', '50');
    await page.click(/Split payment/);
    await page.click(/Clear bill/);
    expect(box(page, 'pay-cash')).toBeNull();
    await page.click(/Massage/);
    expect(box(page, 'tip').value).toBe('');
  });
});

describe('a saved bill shows how it was paid', () => {
  it('a bill made before split payments reads as it always did: "Paid by UPI", and no tip', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    expect(page.text()).toContain('Paid by UPI');
    expect(page.text()).not.toMatch(/Tip\s*₹/);
  });

  it('a split bill lists each method with its amount, and the tip apart from the total', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin', invoiceKind: 'parts' });
    expect(page.text()).toMatch(/Cash\s*₹500\.00/);
    expect(page.text()).toMatch(/UPI\s*₹350\.50/);
    expect(page.text()).not.toContain('Paid by UPI');
    expect(page.text()).toMatch(/Tip\s*₹50\.00/);
    expect(page.text()).toMatch(/Total\s*₹850\.50/);              // the tip is not in it
  });
});

describe('the dashboard and the bills list with split payments', () => {
  it('the dashboard shows tips apart from the takings, and nothing about tips when there are none', async () => {
    const page = await open(DashboardComponent, { role: 'admin' });
    expect(page.text()).toMatch(/Tips collected: ₹120/);
    TestBed.resetTestingModule();
    const empty = await open(DashboardComponent, { role: 'admin', empty: true });
    expect(empty.text()).not.toContain('Tips collected');
  });
});

describe('the bills list', () => {
  it('admins can filter by who made the bill; staff do not get the filter', async () => {
    const admin = await open(InvoicesComponent, { role: 'admin' });
    expect(admin.text()).toContain('Made by');
    const select = [...admin.host.querySelectorAll('select')].find((s) => s.textContent?.includes('Everyone')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['Everyone', 'Riya', 'Farah']);
    select.value = 'u1'; select.dispatchEvent(new Event('change'));
    await admin.settle();
    // the list was asked again, this time for that person's bills only
    TestBed.resetTestingModule();
    const staff = await open(InvoicesComponent, { role: 'staff' });
    expect(staff.text()).not.toContain('Made by');
  });
});

describe('the platform admin\'s parlour page', () => {
  it('flipping a switch marks the change as unsaved, and saving sends it', async () => {
    const page = await open(ParlourDetailComponent, { role: 'super_admin' });
    expect(page.text()).toContain('Saved. Takes effect immediately.');
    const switches = [...page.host.querySelectorAll('[role="switch"]')] as HTMLElement[];
    expect(switches.length).toBe(30);                                                       // 23 before Appointments, plus its page and two buttons (26), plus Attendance by Staff, plus Inventory (28), plus the invoice PDF and image WhatsApp buttons (Task 6)
    expect(switches.some((s) => s.getAttribute('aria-checked') === 'false')).toBe(true); // Team is off in the sample parlour
    const combos = switches.find((s) => document.getElementById(s.getAttribute('aria-labelledby') ?? '')?.textContent === 'Combos')!;
    combos.click();
    await page.settle();
    expect(page.text()).toContain('You have unsaved changes');
    await page.click(/Save access/);
    const req = page.expectOne('PATCH', '/platform/parlours/');
    expect(req.request.body.features['page.combos']).toBe(false);
    expect(req.request.body.features['page.referrals']).toBe(true);
  });

  it('deleting asks for the parlour\'s name first', async () => {
    const page = await open(ParlourDetailComponent, { role: 'super_admin' });
    await page.click(/^\s*Delete\s*$/);
    const del = [...page.host.querySelectorAll('button')].find((b) => /Delete permanently/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    await page.type('#d-confirm', 'glow salon');
    expect(del.disabled).toBe(false);
  });
});

describe('the Team page', () => {
  const buttons = (page: { host: HTMLElement }) => [...page.host.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());

  it('shows each member\'s mobile number, or says there is none', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    expect(page.text()).toContain('9840011111');
    expect(page.text()).toContain('No mobile number');
  });

  it('adding a member asks for a mobile number first, and sends it', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    await page.click(/Add team member/);
    await page.click(/Add member/);                         // nothing filled in yet
    expect(page.text()).toContain('Enter a mobile number');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#a-name', 'Priya');
    await page.type('#a-email', 'priya@x.test');
    await page.type('#a-mobile', '12');
    await page.type('#a-pass', 'Secret123');
    await page.click(/Add member/);
    expect(page.text()).toContain('Enter a valid mobile number');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#a-mobile', '98400 12345');
    await page.click(/Add member/);
    expect(page.expectOne('POST', '/staff').request.body).toEqual({ name: 'Priya', email: 'priya@x.test', mobile: '98400 12345', password: 'Secret123', role: 'staff' });
  });

  it('editing shows the current number and sends the new one', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    const edits = [...page.host.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim() === 'Edit');
    edits[1].click();                                       // Riya, who has a number
    await page.settle();
    expect((html(page, '#e-mobile') as HTMLInputElement).value).toBe('9840011111');
    await page.type('#e-mobile', '9840099999');
    await page.click(/Save changes/);
    expect(page.expectOne('PATCH', '/staff/u2').request.body).toEqual({ name: 'Riya', mobile: '9840099999', role: 'staff' });
  });

  const ROW_BUTTONS: { name: string; key: string; label: RegExp }[] = [
    { name: 'Edit', key: 'action.team.edit', label: /^Edit$/ },
    { name: 'Reset password', key: 'action.team.reset', label: /^Reset password$/ },
    { name: 'Deactivate', key: 'action.team.deactivate', label: /^Deactivate$/ },
  ];
  for (const b of ROW_BUTTONS) {
    it(`the ${b.name} button follows its own switch and nothing else`, async () => {
      const on = await open(TeamComponent, { role: 'admin' });
      for (const other of ROW_BUTTONS) expect(buttons(on).some((t) => other.label.test(t))).toBe(true);
      TestBed.resetTestingModule();

      const off = await open(TeamComponent, { role: 'admin', off: [b.key] });
      expect(buttons(off).some((t) => b.label.test(t))).toBe(false);
      for (const other of ROW_BUTTONS.filter((o) => o !== b)) expect(buttons(off).some((t) => other.label.test(t))).toBe(true);
      expect(off.text()).toMatch(/Add team member/); // the page and its Add button are unaffected
    });
  }

  it('the Deactivate switch also hides Reactivate', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    expect(buttons(page)).toContain('Reactivate');
    TestBed.resetTestingModule();
    const off = await open(TeamComponent, { role: 'admin', off: ['action.team.deactivate'] });
    expect(buttons(off)).not.toContain('Reactivate');
  });
});

describe('the platform admin sees the Team button switches', () => {
  it('lists Edit, Reset password and Deactivate, tied to the Team page', async () => {
    const page = await open(ParlourDetailComponent, { role: 'super_admin' });
    for (const label of ['Edit team member button', 'Reset password button', 'Deactivate / Reactivate button']) expect(page.text()).toContain(label);
    expect(page.text()).toContain('Unavailable while the Team page is off.'); // the sample parlour has Team off
  });
});

describe('GST on the bill: the CGST/SGST split, SAC codes, and prices with or without GST inside', () => {
  describe('a saved bill', () => {
    it('a bill from before the split existed keeps ONE GST line: no CGST, no SGST, no SAC', async () => {
      const page = await open(InvoiceDetailComponent, { role: 'admin' });
      expect(page.text()).toContain('GST 5%');
      expect(page.text()).not.toMatch(/CGST|SGST|Taxable value|SAC|includes GST/);
      expect(page.text()).toContain('GSTIN 33ABCDE1234F1Z5');
    });

    it('a bill with the split shows taxable value, CGST, SGST, each SAC, and the GSTIN it was made under', async () => {
      const page = await open(InvoiceDetailComponent, { role: 'staff', invoiceKind: 'split' });
      const text = page.text();
      expect(text).toMatch(/Taxable value\s*₹810\.00/);
      expect(text).toMatch(/CGST 2\.5%\s*₹20\.25/);
      expect(text).toMatch(/SGST 2\.5%\s*₹20\.25/);
      expect(text).toContain('SAC 999722');                       // the Wax line
      expect(text.match(/SAC/g)?.length).toBe(1);                 // the combo has no SAC of its own
      expect(text).toContain('GSTIN 33SNAPSHOT00S1Z5');           // not the parlour's current one
      expect(text).not.toContain('33ABCDE1234F1Z5');
      expect(text).not.toMatch(/GST 5%/);                         // no single-line GST as well
      expect(text.indexOf('CGST')).toBeLessThan(text.indexOf('Total'));
    });

    it('GST inside the prices: the split sits under the total, as the part of it that is GST', async () => {
      const page = await open(InvoiceDetailComponent, { role: 'admin', invoiceKind: 'inclusive' });
      const text = page.text();
      expect(text).toContain('Subtotal (incl. GST)');
      expect(text).toContain('Total includes GST of ₹38.57');
      expect(text).toMatch(/Taxable value\s*₹771\.43/);
      expect(text).toMatch(/CGST 2\.5%\s*₹19\.29/);
      expect(text).toMatch(/SGST 2\.5%\s*₹19\.28/);                  // the odd paisa is on CGST
      expect(text.match(/Taxable value/g)?.length).toBe(1);       // once, below the total, not above it as well
      expect(text.indexOf('Total includes GST')).toBeGreaterThan(text.indexOf('₹810.00'));
    });
  });

  describe('the billing screen', () => {
    it('GST on top: shows the taxable value and the split, and the total is the price plus GST', async () => {
      const page = await open(NewBillComponent, { role: 'staff' });             // 5% on top
      await page.click(/Massage/);                                              // ₹1,000
      expect(page.text()).toMatch(/Taxable value\s*₹1,000\.00/);
      expect(page.text()).toMatch(/CGST 2\.5%\s*₹25\.00/);
      expect(page.text()).toMatch(/SGST 2\.5%\s*₹25\.00/);
      expect(page.text()).toContain('₹1,050');                                  // total
      expect(page.text()).not.toContain('includes GST');
    });

    it('GST inside the price: the customer pays the menu price, and the split is shown as part of it', async () => {
      const page = await open(NewBillComponent, { role: 'staff', parlour: { gstPriceMode: 'inclusive', taxPercent: 18 } });
      await page.click(/Haircut/);                                              // ₹200, 18% inside
      expect(page.text()).toContain('Subtotal (incl. GST)');
      expect(page.text()).toContain('Total includes GST of ₹30.51');            // 20000 × 18 ÷ 118 = 3050.8 paise
      expect(page.text()).toMatch(/CGST 9%\s*₹15\.26/);                           // the odd paisa on CGST
      expect(page.text()).toMatch(/SGST 9%\s*₹15\.25/);
      expect(page.text()).toContain('₹200');                                    // the total is the menu price
      expect(page.text()).not.toContain('₹236');                                // not price + GST

      await page.click(/Save bill/);
      // Only what the counter chose is sent. The server works out the tax, the split and the total itself.
      expect(page.expectOne('POST', '/invoices').request.body).toEqual({ customerId: null, items: [{ serviceId: 's1', quantity: 1 }], referrerId: null, discount: 0, paymentMethod: 'cash' });
    });

    it('a parlour that charges no GST shows no GST lines at all', async () => {
      const page = await open(NewBillComponent, { role: 'staff', parlour: { taxPercent: 0 } });
      await page.click(/Massage/);
      expect(page.text()).not.toMatch(/GST|Taxable value/);
      expect(page.text()).toContain('₹1,000');
    });
  });

  describe('Settings', () => {
    it('the price setting shows what is saved, explains a change before it is saved, and sends it', async () => {
      const page = await open(SettingsComponent, { role: 'admin' });
      const select = html(page, '#price-mode') as HTMLSelectElement;
      expect(select.value).toBe('exclusive');
      expect(page.text()).toContain('Each bill shows the GST split');
      expect(page.text()).not.toContain('Bills already made do not change');

      select.value = 'inclusive'; select.dispatchEvent(new Event('change')); await page.settle();
      expect(page.text()).toContain('treated as already including GST');
      expect(page.text()).toContain('Bills already made do not change');

      await page.click(/Save settings/);
      const req = page.expectOne('PATCH', '/parlour');
      expect(req.request.body.gstPriceMode).toBe('inclusive');
      req.flush({ data: {} });
      await page.settle();
      expect(page.text()).not.toContain('Bills already made do not change');     // saved: nothing left to warn about
    });

    it('a parlour already on GST-inclusive prices opens showing that', async () => {
      const page = await open(SettingsComponent, { role: 'admin', parlour: { gstPriceMode: 'inclusive' } });
      expect((html(page, '#price-mode') as HTMLSelectElement).value).toBe('inclusive');
    });
  });

  describe('SAC codes on the Services page', () => {
    it('each service shows its SAC, or a dash', async () => {
      const page = await open(ServicesComponent, { role: 'admin' });
      expect(page.text()).toContain('999721');
      expect(page.text()).toContain('—');
    });

    it('a SAC must be 6 digits: a bad one is refused before anything is sent, a blank one is sent as nothing', async () => {
      const page = await open(ServicesComponent, { role: 'admin' });
      await page.click(/Add service/);
      await page.type('#s-name', 'Spa');
      await page.type('#s-cat', 'Skin');
      await page.type('#s-sac', '99972');                                         // 5 digits
      await page.click(/Save service/);
      expect(page.text()).toContain('A SAC code is 6 digits');
      page.http.expectNone((r) => r.method === 'POST' && r.url.includes('/services'));

      await page.type('#s-sac', '');                                              // blank is allowed: no SAC
      await page.click(/Save service/);
      expect(page.expectOne('POST', '/services').request.body).toEqual({ name: 'Spa', category: 'Skin', price: 0, durationMin: 30, sacCode: null });
    });

    it('a valid SAC is sent with the service', async () => {
      const page = await open(ServicesComponent, { role: 'admin' });
      await page.click(/Add service/);
      await page.type('#s-name', 'Spa');
      await page.type('#s-cat', 'Skin');
      await page.type('#s-sac', '999722');
      await page.click(/Save service/);
      expect(page.expectOne('POST', '/services').request.body.sacCode).toBe('999722');
    });

    it('editing shows the current SAC, and archiving a service sends nothing about it', async () => {
      const page = await open(ServicesComponent, { role: 'admin' });
      await page.click(/Edit/);
      expect((html(page, '#s-sac') as HTMLInputElement).value).toBe('999721');
      await page.click(/Cancel/);
      await page.click(/Archive/);
      expect(page.expectOne('PATCH', '/services/').request.body).toEqual({ isActive: false });
    });
  });
});

// ───────────────────────── performers and commission (Phase 4) ─────────────────────────

/** Clicks a button inside a given part of the page (a dialog's button can share its words with a button on the page behind it). */
async function clickIn(page: Page, scope: string, label: RegExp) {
  const el = [...page.host.querySelectorAll(`${scope} button`)].find((b) => label.test(b.textContent ?? '')) as HTMLElement | undefined;
  if (!el) throw new Error(`No button matching ${label} inside ${scope}. Page text: ${page.text().slice(0, 400)}`);
  el.click();
  await page.settle();
}
/** Submits a form the way pressing Enter would. */
async function submit(page: Page, selector: string) {
  const form = html(page, selector);
  if (!form) throw new Error(`No form for ${selector}`);
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await page.settle();
}
const countOf = (page: Page, re: RegExp) => (page.text().match(re) ?? []).length;
const buttonsMatching = (page: Page, re: RegExp) => [...page.host.querySelectorAll('button')].filter((b) => re.test(b.textContent ?? '')).length;
const choose = async (page: Page, selector: string, value: string) => {
  const sel = html(page, selector) as HTMLSelectElement | null;
  if (!sel) throw new Error(`No element for ${selector}`);
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
  await page.settle();
};

describe('the Performers page', () => {
  it('lists the people with how often each has been used; only someone not on any bill can be deleted', async () => {
    const page = await open(PerformersComponent, { role: 'admin' });
    for (const text of ['Meena', '6 bill lines', 'Asha', '0 bill lines', 'Old Hand', 'Deactivated']) expect(page.text()).toContain(text);
    expect(buttonsMatching(page, /Delete/)).toBe(1);                       // Asha only
    expect(page.text()).toMatch(/they do not sign in/);                     // names, not accounts
    expect(page.text()).not.toMatch(/password/i);
  });

  it('says so when there is nobody yet', async () => {
    const page = await open(PerformersComponent, { role: 'admin', empty: true });
    expect(page.text()).toContain('No performers yet');
  });

  it('adds a person: a name that is too short is refused before anything is sent; a good one is sent trimmed', async () => {
    const page = await open(PerformersComponent, { role: 'admin' });
    await page.click(/Add performer/);
    await page.type('#p-name', 'Z');
    await submit(page, '#performer-form');
    expect(page.text()).toContain('Use at least 2 characters');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#p-name', '  Zoya ');
    await submit(page, '#performer-form');
    const req = page.expectOne('POST', '/performers');
    expect(req.request.body).toEqual({ name: 'Zoya' });
    req.flush({ data: { id: 'pf9', name: 'Zoya', isActive: true, lines: 0, canDelete: true } });
    await page.settle();                                                    // the list is loaded again
    expect(html(page, 'dialog[open]')).toBeNull();
  });

  it('a name that is already taken is shown on the form, not as a crash', async () => {
    const page = await open(PerformersComponent, { role: 'admin' });
    await page.click(/Add performer/);
    await page.type('#p-name', 'meena');
    await submit(page, '#performer-form');
    page.expectOne('POST', '/performers').flush({ error: { code: 'PERFORMER_EXISTS', message: 'There is already someone with this name' } }, { status: 409, statusText: 'Conflict' });
    await page.settle();
    expect(page.text()).toContain('There is already someone with this name');
    expect(html(page, 'dialog[open]')).not.toBeNull();                      // still open so it can be fixed
  });

  it('renames, deactivates and reactivates', async () => {
    const page = await open(PerformersComponent, { role: 'admin' });
    await page.click(/Rename/);                                              // Meena
    expect((html(page, '#p-name') as HTMLInputElement).value).toBe('Meena');
    await page.type('#p-name', 'Meena R');
    await submit(page, '#performer-form');
    const rename = page.expectOne('PATCH', '/performers/pf1');
    expect(rename.request.body).toEqual({ name: 'Meena R' });
    rename.flush({ data: { id: 'pf1', name: 'Meena R', isActive: true, lines: 6, canDelete: false } });
    await page.settle();

    await page.click(/^\s*Deactivate/);
    const off = page.expectOne('PATCH', '/performers/pf1');
    expect(off.request.body).toEqual({ isActive: false });
    off.flush({ data: { id: 'pf1', name: 'Meena R', isActive: false, lines: 6, canDelete: false } });
    await page.settle();

    await page.click(/^\s*Reactivate/);
    expect(page.expectOne('PATCH', '/performers/pf3').request.body).toEqual({ isActive: true });   // Old Hand is the deactivated one
  });

  it('deleting asks first, and says why when the person turns out to be on a bill', async () => {
    const page = await open(PerformersComponent, { role: 'admin' });
    await page.click(/Delete/);                                              // Asha
    expect(page.text()).toContain('Delete Asha?');
    page.http.expectNone((r) => r.method === 'DELETE');
    await clickIn(page, 'dialog', /^\s*Delete$/);
    page.expectOne('DELETE', '/performers/pf2').flush({ error: { code: 'PERFORMER_IN_USE', message: 'This person is on past bills, so they cannot be deleted. Deactivate them instead.' } }, { status: 409, statusText: 'Conflict' });
    await page.settle();
    expect(page.text()).toContain('cannot be deleted');
  });
});

describe('billing: who performed each line', () => {
  const performerSelects = (page: Page) => [...page.host.querySelectorAll('select.performer')] as HTMLSelectElement[];

  it('each line gets a "Performed by" choice; the choice is sent with the line, and a line left blank is sent without one', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    expect(performerSelects(page).length).toBe(0);                           // nothing on the bill yet
    await page.click(/Massage/);
    expect(performerSelects(page).length).toBe(1);
    await choose(page, 'select.performer', 'pf1');
    await page.click(/Facial/);
    // a line added next starts with the person chosen last: one person usually does the whole bill
    expect(performerSelects(page).map((s) => s.value)).toEqual(['pf1', 'pf1']);
    await choose(page, 'li.receipt-line:nth-child(2) select.performer', '');   // nobody for the Facial
    expect(performerSelects(page).map((s) => s.value)).toEqual(['pf1', '']);

    await page.click(/Save bill/);
    const body = page.expectOne('POST', '/invoices').request.body;
    expect(body.items).toEqual([{ serviceId: 's3', performedBy: 'pf1', quantity: 1 }, { serviceId: 's2', quantity: 1 }]);
    expect(JSON.stringify(body)).not.toContain('"performedBy":""');
  });

  it('a combo can be credited to someone too', async () => {
    const page = await open(NewBillComponent, { role: 'staff' });
    await page.click(/^\s*Combos/);
    await page.click(/Glow Pack/);
    await choose(page, 'select.performer', 'pf2');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.items).toEqual([{ comboId: 'c1', performedBy: 'pf2', quantity: 1 }]);
  });

  it('changing who performed a line is a different bill, so it gets its own idempotency key', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    await choose(page, 'select.performer', 'pf1');
    await page.click(/Save bill/);
    const first = page.expectOne('POST', '/invoices');
    first.flush({ error: { code: 'X', message: 'Try again' } }, { status: 500, statusText: 'Server Error' });
    await page.settle();
    await page.click(/Save bill/);
    const same = page.expectOne('POST', '/invoices');
    expect(same.request.headers.get('Idempotency-Key')).toBe(first.request.headers.get('Idempotency-Key'));   // the same bill again
    same.flush({ error: { code: 'X', message: 'Try again' } }, { status: 500, statusText: 'Server Error' });
    await page.settle();
    await choose(page, 'select.performer', 'pf2');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.headers.get('Idempotency-Key')).not.toBe(first.request.headers.get('Idempotency-Key'));
  });

  it('staff can choose too, from the active people only; the choice is names, nothing else', async () => {
    const page = await open(NewBillComponent, { role: 'staff' });
    await page.click(/Massage/);
    const options = [...(performerSelects(page)[0]?.options ?? [])].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Performed by…', 'Meena', 'Asha']);              // Old Hand is deactivated
  });

  it('with the Performers page switched off there is no choice, and the bill is sent exactly as it always was', async () => {
    const page = await open(NewBillComponent, { role: 'admin', off: ['page.performers'] });
    await page.click(/Massage/);
    expect(performerSelects(page).length).toBe(0);
    expect(page.text()).not.toContain('Performed by');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.items).toEqual([{ serviceId: 's3', quantity: 1 }]);
  });
});

describe('a saved bill and who performed it', () => {
  it('shows who performed each line on screen, and leaves it off what is printed', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    expect(page.text()).toContain('Performed by Meena');
    expect(countOf(page, /Performed by/g)).toBe(1);                           // the Wax line has nobody
    expect(html(page, '.no-print.desc')?.textContent).toContain('Performed by Meena');
  });
});

describe('the dashboard: sales by performer', () => {
  it('lists each person\'s sales, and what nobody was credited for', async () => {
    const page = await open(DashboardComponent, { role: 'admin' });
    for (const text of ['Sales by performer', 'Meena', '₹4,200', 'Asha', '₹2,150.50', 'Not credited to anyone', '₹800']) expect(page.text()).toContain(text);
    expect(page.text()).toContain('By team member');                           // who made the bill is still reported, separately
  });

  it('is not there at all when the Performers page is switched off, and the rest of the dashboard is unchanged', async () => {
    const page = await open(DashboardComponent, { role: 'admin', off: ['page.performers'] });
    expect(page.text()).not.toContain('Sales by performer');
    for (const text of ['Takings', 'Top services', 'By team member']) expect(page.text()).toContain(text);
  });
});

describe('the Commissions page', () => {
  it('shows what was earned, paid and is still to pay, per person, with the rules and the payments made', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    for (const text of ['Sales credited', 'Commission earned', 'Already paid', 'Still to pay', '₹450', 'Meena', '₹420', '₹300', 'Asha', 'Old Hand', 'Deactivated']) expect(page.text()).toContain(text);
    expect(page.text()).toContain('₹50 of commission was paid on bills that were voided afterwards');   // reported, never changed for you
    expect(buttonsMatching(page, /^\s*Mark as paid/)).toBe(2);                 // Meena and Asha; Old Hand has nothing to pay
    // the rules, in words
    for (const text of ['10% of what the service took in', '₹50 each time it is performed', 'Massage']) expect(page.text()).toContain(text);
    // payments made
    expect(page.text()).toContain('Payments made');
    expect(page.text()).toContain('₹120');
    expect(page.text()).toMatch(/Olive Owner/);
  });

  it('with nothing yet, says what to do instead of showing an empty table', async () => {
    const page = await open(CommissionsComponent, { role: 'admin', empty: true });
    expect(page.text()).toContain('No performers yet');
    expect(page.text()).toContain('No rules yet');
    expect(page.text()).toContain('Nothing has been marked as paid yet');
    expect(buttonsMatching(page, /Mark as paid/)).toBe(0);
  });

  it('"Show bills" lists the lines behind a person\'s numbers, with the rule each was made under, and hides them again', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/Show bills/);
    for (const text of ['DP-00001', 'DP-00002', 'DP-00003', '10%', '₹50 each', 'No rule', 'Paid out', 'To pay', 'Voided']) expect(page.text()).toContain(text);
    expect(page.text()).toContain('× 2');                                       // 2 massages on one line
    await page.click(/Hide bills/);
    expect(page.text()).not.toContain('DP-00001');
  });

  it('"Mark as paid" asks first, then sends the person, the days and the exact amount that was on screen', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/^\s*Mark as paid/);                                       // Meena, ₹300 to pay
    expect(page.text()).toContain('Mark Meena as paid');
    expect(page.text()).toContain('₹300.00');
    expect(page.text()).toContain('does not move any money');
    page.http.expectNone((r) => r.method === 'POST');                           // nothing is sent by opening it

    await clickIn(page, 'dialog', /Mark ₹300\.00 as paid/);
    const req = page.expectOne('POST', '/commissions/pay');
    expect(req.request.body).toEqual({ performerId: 'pf1', from: '2026-10-12', to: '2026-10-18', expectedAmount: 300 });
    req.flush({ data: { id: 'po9', performerId: 'pf1', performerName: 'Meena', from: '2026-10-12', to: '2026-10-18', amount: 300, lines: 5, paidAt: '2026-10-18T10:30:00.000Z' } });
    await page.settle();                                                         // the report and the payments are loaded again
    expect(html(page, 'dialog[open]')).toBeNull();
  });

  it('if the amount changed meanwhile (the server pays nothing), the dialog closes and the page is shown again as it now is', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/^\s*Mark as paid/);
    await clickIn(page, 'dialog', /Mark ₹300\.00 as paid/);
    page.expectOne('POST', '/commissions/pay').flush(
      { error: { code: 'AMOUNT_CHANGED', message: 'What Meena is owed has changed: it is now ₹320.00, not ₹300.00. Nothing was paid. Check the page and try again.' } },
      { status: 409, statusText: 'Conflict' });
    await page.settle();                                                         // reloads without being asked
    expect(html(page, 'dialog[open]')).toBeNull();
    expect(page.text()).toContain('Meena');
  });

  it('the Mark as paid button follows its own switch, and goes when the Performers or Commissions page is off (it chains)', async () => {
    const own = await open(CommissionsComponent, { role: 'admin', off: ['action.commissions.pay'] });
    expect(buttonsMatching(own, /Mark as paid/)).toBe(0);
    expect(own.text()).toContain('₹300');                                        // the numbers are still there
    TestBed.resetTestingModule();
    const viaPerformers = await open(CommissionsComponent, { role: 'admin', off: ['page.performers'] });
    expect(buttonsMatching(viaPerformers, /Mark as paid/)).toBe(0);
  });

  it('adds a rule for a person: nothing is sent until a person is chosen and the value makes sense', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/Add rule/);
    await submit(page, '#rule-form');
    expect(page.text()).toContain('Choose a person');
    page.http.expectNone((r) => r.method === 'POST');

    await choose(page, '#r-person', 'pf2');
    await page.type('#r-value', '150');
    await submit(page, '#rule-form');
    expect(page.text()).toContain('A percentage cannot be more than 100');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#r-value', '12.5');
    await submit(page, '#rule-form');
    const req = page.expectOne('POST', '/commissions/rules');
    expect(req.request.body).toEqual({ scope: 'performer', performerId: 'pf2', kind: 'percent', value: 12.5, isActive: true });
    req.flush({ data: { id: 'cr9', kind: 'percent', value: 12.5, scope: 'performer', priority: 2, isActive: true, performerId: 'pf2', performerName: 'Asha', serviceId: null, serviceName: null, updatedAt: '2026-10-18T10:30:00.000Z' } });
    await page.settle();
    expect(html(page, 'dialog[open]')).toBeNull();
  });

  it('adds a flat amount for a service', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/Add rule/);
    await choose(page, '#r-scope', 'service');
    await choose(page, '#r-service', 's2');
    await page.click(/Flat amount/);
    expect(page.text()).toContain('Rupees each time it is performed');
    await page.type('#r-value', '75');
    await submit(page, '#rule-form');
    expect(page.expectOne('POST', '/commissions/rules').request.body).toEqual({ scope: 'service', serviceId: 's2', kind: 'flat', value: 75, isActive: true });
  });

  it('editing shows the current rule and who it is for, and sends the change for that rule', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/^\s*Edit/);                                                // the first rule (the most specific): Meena doing Haircut, 20%
    expect(page.text()).toContain('Edit commission rule');
    expect(html(page, 'dialog[open]')?.textContent).toContain('Meena doing Haircut');
    expect((html(page, '#r-value') as HTMLInputElement).value).toBe('20');
    expect(html(page, '#r-scope')).toBeNull();                                  // who a rule is for cannot be changed
    await page.type('#r-value', '25');
    await submit(page, '#rule-form');
    const req = page.expectOne('PATCH', '/commissions/rules/cr4');
    expect(req.request.body).toEqual({ kind: 'percent', value: 25, isActive: true });
    page.http.expectNone((r) => r.method === 'PUT' || r.method === 'POST');
  });

  it('removing a rule asks first, and says that bills already made keep their commission', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/^\s*Remove/);
    expect(page.text()).toContain('Remove this rule?');
    expect(page.text()).toContain('Bills already made, and commission already paid, keep what they earned');
    page.http.expectNone((r) => r.method === 'DELETE');
    await clickIn(page, 'dialog', /Remove rule/);
    const req = page.expectOne('DELETE', '/commissions/rules/cr4');
    req.flush(null);
    await page.settle();
    expect(html(page, 'dialog[open]')).toBeNull();
  });
});

describe('referral amounts: what is owed, and marking it as paid', () => {
  it('the Referrals list shows what each referrer is owed, and Mark as paid only where something is owed', async () => {
    const page = await open(ReferralsComponent, { role: 'admin' });
    expect(page.text()).toContain('Owed');
    expect(page.text()).toContain('₹240');
    expect(buttonsMatching(page, /Mark as paid/)).toBe(1);                       // Anita (owed ₹240); Kumar is owed nothing
  });

  it('asks first, then sends exactly the amount that was on screen', async () => {
    const page = await open(ReferralsComponent, { role: 'admin' });
    await page.click(/Mark as paid/);
    expect(page.text()).toContain('Mark Anita Rao as paid');
    expect(page.text()).toContain('₹240.00');
    page.http.expectNone((r) => r.method === 'POST');
    await clickIn(page, 'dialog', /Mark ₹240\.00 as paid/);
    const req = page.expectOne('POST', '/referrers/r1/pay');
    expect(req.request.body).toEqual({ expectedAmount: 240 });
    req.flush({ data: { id: 'rp9', referrerId: 'r1', referrerName: 'Anita Rao', amount: 240, bills: 2, paidAt: '2026-10-18T10:30:00.000Z' } });
    await page.settle();                                                           // the list is loaded again
    expect(html(page, 'dialog[open]')).toBeNull();
  });

  it('if what is owed changed meanwhile, nothing is paid and the list is shown again as it now is', async () => {
    const page = await open(ReferralsComponent, { role: 'admin' });
    await page.click(/Mark as paid/);
    await clickIn(page, 'dialog', /Mark ₹240\.00 as paid/);
    page.expectOne('POST', '/referrers/r1/pay').flush(
      { error: { code: 'AMOUNT_CHANGED', message: 'What Anita Rao is owed has changed: it is now ₹260.00, not ₹240.00. Nothing was paid. Check the page and try again.' } },
      { status: 409, statusText: 'Conflict' });
    await page.settle();
    expect(html(page, 'dialog[open]')).toBeNull();
  });

  it('the button follows its own switch, and the Referrals page it lives on', async () => {
    const page = await open(ReferralsComponent, { role: 'admin', off: ['action.referrals.pay'] });
    expect(buttonsMatching(page, /Mark as paid/)).toBe(0);
    expect(page.text()).toContain('Owed');                                          // what is owed is still shown
    expect(page.text()).toMatch(/New referrer/);                                    // other buttons are untouched
  });

  it('the referrer\'s own page shows owed and paid, each bill\'s state, the payments made, and a warning for a bill voided after payment', async () => {
    const page = await open(ReferralDetailComponent, { role: 'admin' });
    for (const text of ['Owed to them', '₹240', 'Paid so far', 'Referral amount', 'Owed', 'Paid, then voided', 'Payments made', '₹90', 'Olive Owner']) expect(page.text()).toContain(text);
    expect(page.text()).toContain('₹150 was paid to Anita Rao on bills that were voided afterwards');
    expect(buttonsMatching(page, /Mark ₹240\.00 as paid/)).toBe(1);

    await page.click(/Mark ₹240\.00 as paid/);
    await clickIn(page, 'dialog', /Mark ₹240\.00 as paid/);
    expect(page.expectOne('POST', '/referrers/r1/pay').request.body).toEqual({ expectedAmount: 240 });
  });

  it('the referrer\'s own page has no Mark as paid button when its switch is off', async () => {
    const page = await open(ReferralDetailComponent, { role: 'admin', off: ['action.referrals.pay'] });
    expect(page.text()).toContain('Owed to them');
    expect(buttonsMatching(page, /Mark .* as paid/)).toBe(0);
  });
});

describe('the platform admin\'s switches for performers and commission', () => {
  it('lists the new pages and buttons, tied to the page they need, and a button\'s page can itself need another page', async () => {
    const page = await open(ParlourDetailComponent, { role: 'super_admin' });
    for (const label of ['Performers', 'Commissions', 'Add performer button', 'Mark commission as paid button', 'Mark referral as paid button']) expect(page.text()).toContain(label);
    // switching Performers off takes Commissions, and the Mark-as-paid button on it, away too: three notes
    expect(countOf(page, /Unavailable while the Performers page is off\./g)).toBe(0);
    const performers = [...page.host.querySelectorAll('[role="switch"]')].find((s) => document.getElementById(s.getAttribute('aria-labelledby') ?? '')?.textContent === 'Performers') as HTMLElement;
    performers.click();
    await page.settle();
    expect(countOf(page, /Unavailable while the Performers page is off\./g)).toBe(3);   // Commissions, Add performer, Mark commission as paid
    expect(countOf(page, /Unavailable while the Commissions page is off\./g)).toBe(0);   // the nearest page that is off is named, not its parent
  });
});

// ───────────────────── sign in with an email or a mobile number ─────────────────────

describe('sign in with an email or a mobile number', () => {
  const field = (page: Page) => html(page, '#identifier') as HTMLInputElement;

  it('asks for an email or a mobile number, and still has no sign-up link', async () => {
    const page = await open(LoginComponent);
    expect(page.text()).toContain('Email or mobile number');
    expect(field(page)).not.toBeNull();
    expect(field(page).getAttribute('autocomplete')).toBe('username');
    expect(page.text()).not.toMatch(/create (an )?account|register|sign up/i);
  });

  it('sends what was typed as one "identifier", whether it is an email or a mobile number', async () => {
    for (const typed of ['riya@x.test', '98400 12345', '+91 98400-12345']) {
      const page = await open(LoginComponent);
      await page.type('#identifier', `  ${typed}  `);
      await page.type('#password', 'Secret123');
      await page.click(/^Sign in$/);
      expect(page.expectOne('POST', '/auth/login').request.body).toEqual({ identifier: typed, password: 'Secret123' });
      TestBed.resetTestingModule();
    }
  });

  it('refuses an empty box, a word, and a number with fewer than 10 digits, without calling the server', async () => {
    const page = await open(LoginComponent);
    await page.type('#password', 'Secret123');
    await page.click(/^Sign in$/);
    expect(page.text()).toContain('Enter your email or mobile number');
    for (const bad of ['riya', 'riya@', '98400 123', '12']) {
      await page.type('#identifier', bad);
      await page.click(/^Sign in$/);
      expect(page.text()).toContain('Enter a valid email address or mobile number');
      page.http.expectNone((r) => r.method === 'POST');
    }
  });

  it('a wrong password is one message above the form, the same for an email and a mobile number', async () => {
    for (const typed of ['riya@x.test', '9840012345']) {
      const page = await open(LoginComponent);
      await page.type('#identifier', typed);
      await page.type('#password', 'Wrong-pass-1');
      await page.click(/^Sign in$/);
      page.expectOne('POST', '/auth/login').flush({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }, { status: 401, statusText: 'Unauthorized' });
      await page.settle();
      expect(html(page, '.form-alert')?.textContent).toContain('Incorrect email or password');
      TestBed.resetTestingModule();
    }
  });

  it('a message the server sends about the sign-in box is shown beside it', async () => {
    const page = await open(LoginComponent);
    await page.type('#identifier', '9840012345');
    await page.type('#password', 'x');
    await page.click(/^Sign in$/);
    page.expectOne('POST', '/auth/login').flush({ error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details: { identifier: 'Enter a valid email address or mobile number' } } }, { status: 400, statusText: 'Bad Request' });
    await page.settle();
    expect(html(page, '.field-error')?.textContent).toContain('Enter a valid email address or mobile number');
  });
});

// ───────────────────── the Team page and the Account page for staff who sign in by mobile ─────────────────────

describe('team members who sign in with a mobile number', () => {
  const fill = async (page: Page, v: { name?: string; email?: string; mobile?: string; role?: string }) => {
    await page.type('#a-name', v.name ?? 'Kiosk Kim');
    if (v.email !== undefined) await page.type('#a-email', v.email);
    await page.type('#a-mobile', v.mobile ?? '98400 12345');
    await page.type('#a-pass', 'Secret123');
    if (v.role) {
      const select = html(page, '#a-role') as HTMLSelectElement;
      select.value = v.role;
      select.dispatchEvent(new Event('change'));
      await page.settle();
    }
  };

  it('the list shows a member with no email by their number, and says they sign in with it', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    expect(page.text()).toContain('Kiosk Kim');
    expect(page.text()).toContain('+91 98400 33333');
    expect(page.text()).toContain('No email: signs in with mobile number');
    expect(page.text()).toContain('riya@x.test'); // members who have an email still show it
  });

  it('staff can be added with a mobile number and no email, and no empty email is sent', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    await page.click(/Add team member/);
    expect(page.text()).toContain('Email (optional for staff)');
    await fill(page, { email: '' });
    await page.click(/Add member/);
    expect(page.expectOne('POST', '/staff').request.body).toEqual({ name: 'Kiosk Kim', mobile: '98400 12345', password: 'Secret123', role: 'staff' });
  });

  it('an admin needs an email: asked for when the role is chosen, and nothing is sent until it is given', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    await page.click(/Add team member/);
    await fill(page, { email: '', role: 'admin' });
    await page.click(/Add member/);
    expect(page.text()).toContain('Enter an email address for an admin');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#a-email', 'boss@x.test');
    await page.click(/Add member/);
    expect(page.expectOne('POST', '/staff').request.body).toEqual({ name: 'Kiosk Kim', email: 'boss@x.test', mobile: '98400 12345', password: 'Secret123', role: 'admin' });
  });

  it('a new number needs at least 10 digits, and a number someone else has is shown on the mobile box', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    await page.click(/Add team member/);
    await fill(page, { mobile: '98400 123' });
    await page.click(/Add member/);
    expect(page.text()).toContain('Enter a mobile number with at least 10 digits');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#a-mobile', '98400 12345');
    await page.click(/Add member/);
    page.expectOne('POST', '/staff').flush({ error: { code: 'MOBILE_TAKEN', message: 'An account with this mobile number already exists', details: { mobile: 'An account with this mobile number already exists' } } }, { status: 409, statusText: 'Conflict' });
    await page.settle();
    expect(page.text()).toContain('An account with this mobile number already exists');
  });

  it('editing a member whose saved number is shorter than 10 digits does not send it again, but a changed number needs 10', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    const edits = [...page.host.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim() === 'Edit');
    edits[4].click();                                        // Old Timer, saved with 8 digits
    await page.settle();
    expect((html(page, '#e-mobile') as HTMLInputElement).value).toBe('12345678');
    await page.type('#e-name', 'Old Timer Jr');
    await page.click(/Save changes/);
    expect(page.expectOne('PATCH', '/staff/u5').request.body).toEqual({ name: 'Old Timer Jr', role: 'staff' });

    TestBed.resetTestingModule();
    const again = await open(TeamComponent, { role: 'admin' });
    const edits2 = [...again.host.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim() === 'Edit');
    edits2[4].click();
    await again.settle();
    await again.type('#e-mobile', '123456789');             // changed, but still 9 digits
    await again.click(/Save changes/);
    expect(again.text()).toContain('Enter a mobile number with at least 10 digits');
    again.http.expectNone((r) => r.method === 'PATCH');
    await again.type('#e-mobile', '98400 55555');
    await again.click(/Save changes/);
    expect(again.expectOne('PATCH', '/staff/u5').request.body).toEqual({ name: 'Old Timer', mobile: '98400 55555', role: 'staff' });
  });
});

describe('the Account page', () => {
  it('shows the mobile number, and no email line, for staff who sign in by mobile number', async () => {
    const page = await open(AccountComponent, { role: 'staff', user: { email: null, mobile: '9840033333' } });
    expect(page.text()).toContain('Mobile number');
    expect(page.text()).toContain('9840033333');
    expect(page.text()).not.toMatch(/Email/);
  });

  it('still shows the email for an account that has one and no mobile number', async () => {
    const page = await open(AccountComponent, { role: 'admin' });
    expect(page.text()).toContain('o@x.test');
    expect(page.text()).not.toContain('Mobile number');
  });
});

describe('appointments: the day calendar and the walk-in queue', () => {
  const primary = (page: { host: HTMLElement }, scope = 'dialog') => page.host.querySelector(`${scope} .btn-primary`) as HTMLButtonElement;
  const press = async (page: Page, el: Element | null) => { (el as HTMLElement).click(); await page.settle(); };
  const byLabel = (page: Page, label: string) => page.host.querySelector(`[aria-label="${label}"]`);

  it('shows one column for each active person and one for visits with nobody chosen, and what each visit is', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    for (const text of ['Meena', 'Asha', 'Nobody chosen yet', 'Cara Customer', 'Late Lata', 'Haircut, Facial', 'In service', 'Billed', 'Allergic to ammonia']) expect(page.text()).toContain(text);
    expect(page.text()).not.toContain('Old Hand');                       // deactivated, and has no visits
    expect(page.text()).toMatch(/2 visits from earlier days are still open/);
    expect(page.text()).toContain('View bill DP-00001');
    page.http.verify();
  });

  it('shows the same calendar to staff, and a clear empty state', async () => {
    const staff = await open(AppointmentsComponent, { role: 'staff' });
    expect(staff.text()).toContain('Cara Customer');
    TestBed.resetTestingModule();
    const empty = await open(AppointmentsComponent, { role: 'admin', empty: true });
    expect(empty.text()).toContain('Nothing booked');
    await empty.click(/Walk-in queue/);
    expect(empty.text()).toContain('Nobody is waiting');
  });

  it('lists the queue in order, with places', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    await page.click(/Walk-in queue/);
    const text = page.text();
    expect(text.indexOf('Walk-in Wanda')).toBeGreaterThan(-1);
    expect(text.indexOf('Walk-in Wanda')).toBeLessThan(text.indexOf('Second Sita'));
    expect(page.host.querySelectorAll('.place').length).toBe(2);
  });

  it('the buttons on a visit follow the switches', async () => {
    const on = await open(AppointmentsComponent, { role: 'admin' });
    expect(on.text()).toContain('Bill this visit');
    expect(on.text()).toContain('Remind');
    TestBed.resetTestingModule();
    const noRemind = await open(AppointmentsComponent, { role: 'admin', off: ['action.appointments.remind'] });
    expect(noRemind.text()).not.toContain('Remind');
    expect(noRemind.text()).toContain('Bill this visit');
    TestBed.resetTestingModule();
    const noBill = await open(AppointmentsComponent, { role: 'admin', off: ['action.appointments.bill'] });
    expect(noBill.text()).not.toContain('Bill this visit');
    expect(noBill.text()).toContain('Remind');
    expect(noBill.text()).toContain('Start');
  });

  it('offers no-show only once the time has passed, and a reminder only before it', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    expect(page.host.querySelectorAll('[data-status="booked"]').length).toBe(2);
    const late = [...page.host.querySelectorAll('article')].find((c) => (c.textContent ?? '').includes('Late Lata'))!;
    const future = [...page.host.querySelectorAll('article')].find((c) => (c.textContent ?? '').includes('Cara Customer') && c.getAttribute('data-status') === 'booked')!;
    expect(late.textContent).toContain('No-show');
    expect(late.textContent).not.toContain('Remind');
    expect(future.textContent).not.toContain('No-show');
    expect(future.textContent).toContain('Remind');
  });

  it('one tap on "Bill this visit" opens the billing screen for that visit', async () => {
    const page = await open(AppointmentsComponent, { role: 'staff' });
    const go = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await page.click(/Bill this visit/);
    expect(go).toHaveBeenCalledWith(['/staff', 'new-bill'], { queryParams: { appointmentId: 'ap1' } });
  });

  it('cancelling asks for an optional reason and keeps the visit on record', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    await page.click(/^\s*Cancel\s*$/);
    await page.type('#cancel-reason', 'Customer called');
    await press(page, page.host.querySelector('dialog .btn-danger'));
    const req = page.expectOne('POST', '/appointments/ap1/cancel');
    expect(req.request.body).toEqual({ reason: 'Customer called' });
    req.flush({ data: {} });
  });

  it('starting a walk-in asks who will do it, then starts it', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    await page.click(/Walk-in queue/);
    await page.click(/^\s*Start\s*$/);
    expect(page.text()).toContain('Who will do it');
    await press(page, primary(page));
    const req = page.expectOne('POST', '/appointments/aq1/start');
    expect(req.request.body).toEqual({});
    req.flush({ data: {} });
  });

  it('starting a visit whose person is busy says so, and only an extra tap starts it anyway', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    await page.click(/^\s*Start\s*$/);                                   // Cara's visit already has Meena chosen: one tap
    const first = page.expectOne('POST', '/appointments/ap1/start');
    first.flush({ error: { code: 'SLOT_TAKEN', message: 'Meena already has Late Lata then.' } }, { status: 409, statusText: 'Conflict' });
    await page.settle();
    expect(page.text()).toContain('Meena already has Late Lata then.');
    await press(page, primary(page));
    expect(page.expectOne('POST', '/appointments/ap1/start').request.body).toEqual({ performerId: 'pf1', allowOverlap: true });
  });

  it('marks a no-show', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    await page.click(/No-show/);
    page.expectOne('POST', '/appointments/ap2/no-show').flush({ data: {} });
  });

  describe('the reminder is a WhatsApp link the person taps', () => {
    it('opens it, and records that it was opened', async () => {
      const win = { location: { href: '' }, opener: {}, close: jest.fn() };
      jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Remind/);
      page.expectOne('GET', '/appointments/ap1/reminder').flush({ data: { url: 'https://wa.me/919000000005?text=Hi', message: 'Hi', phone: '919000000005' } });
      expect(win.location.href).toBe('https://wa.me/919000000005?text=Hi');
      page.expectOne('POST', '/appointments/ap1/reminded').flush({ data: {} });
      await page.settle();
    });

    it('asks for a number when the visit has none, and sends nothing until one is typed', async () => {
      const win = { location: { href: '' }, opener: {}, close: jest.fn() };
      jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Remind/);
      page.expectOne('GET', '/appointments/ap1/reminder').flush({ error: { code: 'PHONE_REQUIRED', message: 'Enter the customer’s WhatsApp number' } }, { status: 400, statusText: 'Bad Request' });
      await page.settle();
      expect(win.close).toHaveBeenCalled();
      expect(page.text()).toContain('WhatsApp number');
      await page.type('#remind-phone', '98400 12345');
      await press(page, primary(page));
      const req = page.expectOne('GET', '/appointments/ap1/reminder');
      expect(req.request.params.get('phone')).toBe('98400 12345');
      req.flush({ data: { url: 'https://wa.me/919840012345?text=Hi', message: 'Hi', phone: '919840012345' } });
      page.expectOne('POST', '/appointments/ap1/reminded').flush({ data: {} });
    });
  });

  describe('booking and walk-ins', () => {
    const tick = async (page: Page, label: string) => press(page, byLabel(page, label));

    it('books a visit with what was typed, and sends no price', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Book appointment/);
      await page.type('#ap-name', 'Meena Rao');
      await page.type('#ap-date', '2026-10-20');
      await page.type('#ap-time', '11:00');
      await tick(page, 'One more Haircut');
      await tick(page, 'One more Haircut');
      await press(page, primary(page));
      const req = page.expectOne('POST', '/appointments');
      expect(req.request.body).toEqual({ kind: 'booked', date: '2026-10-20', time: '11:00', customerName: 'Meena Rao', items: [{ serviceId: 's1', quantity: 2 }] });
      req.flush({ data: {} });
    });

    it('says what is missing, field by field, and sends nothing', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Book appointment/);
      await press(page, primary(page));
      for (const m of ['Choose the time', 'Enter the customer name or choose a saved customer', 'Choose at least one service']) expect(page.text()).toContain(m);
      page.http.expectNone((r) => r.method === 'POST');
    });

    it('when the person already has someone then, says so and saves only on a second, deliberate tap', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Book appointment/);
      await page.type('#ap-name', 'Meena Rao');
      await page.type('#ap-time', '10:30');
      await tick(page, 'One more Facial');
      await press(page, primary(page));
      page.expectOne('POST', '/appointments').flush({ error: { code: 'SLOT_TAKEN', message: 'Meena already has Cara at 10:30.' } }, { status: 409, statusText: 'Conflict' });
      await page.settle();
      expect(page.text()).toContain('Meena already has Cara at 10:30.');
      expect(page.text()).toContain('Save anyway');
      await press(page, primary(page));
      expect(page.expectOne('POST', '/appointments').request.body.allowOverlap).toBe(true);
    });

    it('adds a walk-in with no time and no name needed', async () => {
      const page = await open(AppointmentsComponent, { role: 'staff' });
      await page.click(/Add walk-in/);
      expect(page.host.querySelector('#ap-time')).toBeNull();
      await tick(page, 'One more Massage');
      await press(page, primary(page));
      expect(page.expectOne('POST', '/appointments').request.body).toEqual({ kind: 'walk_in', items: [{ serviceId: 's3', quantity: 1 }] });
    });

    it('changing a visit sends only what changed', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Change/);
      expect(page.text()).toContain('Change appointment');
      await page.type('#ap-time', '12:15');
      await press(page, primary(page));
      const req = page.expectOne('PATCH', '/appointments/ap1');
      expect(req.request.body).toEqual({ date: '2026-10-19', time: '12:15' });
    });

    it('changing nothing sends nothing', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Change/);
      await press(page, primary(page));
      page.http.expectNone((r) => r.method === 'PATCH');
    });
  });

  it('the sidebar shows Appointments to admin and staff, and not when the page is off', async () => {
    for (const role of ['admin', 'staff'] as const) {
      const on = await open(ShellComponent, { role });
      expect(on.text()).toContain('Appointments');
      TestBed.resetTestingModule();
      const off = await open(ShellComponent, { role, off: ['page.appointments'] });
      expect(off.text()).not.toContain('Appointments');
      TestBed.resetTestingModule();
    }
  });
});

describe('appointments: billing a visit in one tap', () => {
  it('fills the bill from the visit and sends the visit with it', async () => {
    const page = await open(NewBillComponent, { role: 'staff', query: '?appointmentId=ap1' });
    expect(page.text()).toContain('Billing the visit of Cara Customer');
    expect(page.text()).toContain('₹735');                                    // Haircut 200 + Facial 500, + 5% GST
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body).toEqual({
      customerId: 'cu1', items: [{ serviceId: 's1', performedBy: 'pf1', quantity: 1 }, { serviceId: 's2', performedBy: 'pf1', quantity: 1 }],
      referrerId: null, discount: 0, paymentMethod: 'cash', appointmentId: 'ap1',
    });
  });

  it('"Not this visit" makes an ordinary bill, and the visit is not sent', async () => {
    const page = await open(NewBillComponent, { role: 'admin', query: '?appointmentId=ap1' });
    await page.click(/Not this visit/);
    expect(page.text()).not.toContain('Billing the visit');
    await page.click(/Save bill/);
    expect('appointmentId' in page.expectOne('POST', '/invoices').request.body).toBe(false);
  });

  it('with the button switched off, it says so, does not even load the visit, and bills as usual', async () => {
    const page = await open(NewBillComponent, { role: 'admin', query: '?appointmentId=ap1', off: ['action.appointments.bill'] });
    expect(page.text()).toContain('switched off');
    page.http.expectNone((r) => r.url.includes('/appointments'));
  });

  it('if someone else billed the visit meanwhile, the visit comes off and the next save is an ordinary bill', async () => {
    const page = await open(NewBillComponent, { role: 'admin', query: '?appointmentId=ap1' });
    await page.click(/Save bill/);
    page.expectOne('POST', '/invoices').flush({ error: { code: 'APPOINTMENT_ALREADY_BILLED', message: 'This visit has already been billed.' } }, { status: 409, statusText: 'Conflict' });
    await page.settle();
    expect(page.text()).not.toContain('Billing the visit');
    await page.click(/Save bill/);
    expect('appointmentId' in page.expectOne('POST', '/invoices').request.body).toBe(false);
  });

  it('a plain bill never mentions a visit', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    expect(page.text()).not.toContain('Billing the visit');
    page.http.expectNone((r) => r.url.includes('/appointments'));
  });
});

describe('appointments: filter by person, the hour grid, and the walk-in board', () => {
  const press = async (page: Page, el: Element | null) => { (el as HTMLElement).click(); await page.settle(); };
  const choose = async (page: Page, selector: string, value: string) => {
    const el = page.host.querySelector(selector) as HTMLSelectElement;
    el.value = value;
    el.dispatchEvent(new Event('change'));
    await page.settle();
  };
  const FILTER = 'select[aria-label="Show one person"]';
  const heads = (page: Page) => [...page.host.querySelectorAll('.col-head')].map((h) => (h.textContent ?? '').trim());
  const cardFor = (page: Page, name: string) => [...page.host.querySelectorAll('article')].find((c) => (c.textContent ?? '').includes(name))!;
  const buttonsOf = (card: Element) => [...card.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());

  describe('the day as hour rows', () => {
    it('has one row for each hour from the earliest visit (07:00) to 20:00, and a cell for each person in each row', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      const hours = [...page.host.querySelectorAll('.slot-time')].map((h) => (h.textContent ?? '').trim());
      expect(hours[0]).toBe('07:00');
      expect(hours[hours.length - 1]).toBe('20:00');
      expect(hours.length).toBe(14);
      expect(heads(page).length).toBe(3);                                     // Meena, Asha, and the visits with nobody chosen
      expect(page.host.querySelectorAll('.slot-cell').length).toBe(14 * 3);
      page.http.verify();
    });

    it('puts each visit in its own hour: the billed 07:00 visit is Meena\'s first cell and the 10:30 booking her fourth', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      const cells = [...page.host.querySelectorAll('.slot-cell')];                // one person after another: Meena\'s 14 hours come first
      expect(cells[0].textContent).toContain('View bill DP-00001');              // 07:00
      expect(cells[3].textContent).toContain('Remind');                          // 10:00 hour: the booking that starts at 10:30
      expect(cells[1].querySelectorAll('article').length).toBe(0);               // 08:00 is free for Meena
      const asha = cells.slice(14, 28);
      expect(asha[2].textContent).toContain('Allergic to ammonia');              // 09:15 walk-in in service is in the 09:00 hour
      const nobody = cells.slice(28, 42);
      expect(nobody[1].textContent).toContain('Late Lata');                      // 08:00
    });

    it('shows the cards in the same order as before (each person from the top down), so the first button on the page is still the same visit', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      const order = [...page.host.querySelectorAll('article')].map((a) => a.getAttribute('data-status'));
      expect(order).toEqual(['completed', 'booked', 'in_service', 'booked']);   // ap4, ap1 (Meena), ap3 (Asha), ap2 (nobody)
    });

    it('a visit that is not on the hour is in the hour it starts in, and the status indicators are still on every card', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      for (const status of ['completed', 'booked', 'in_service']) expect(page.host.querySelector(`article[data-status="${status}"]`)).toBeTruthy();
      expect(page.host.querySelectorAll('.badge').length).toBe(4);
    });

    it('an empty day still shows the hours (09:00 to 20:00), with the one list saying nothing is booked', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin', empty: true });   // no visits and no people: one plain list
      expect(page.host.querySelectorAll('.slot-time').length).toBe(12);          // 09:00 to 20:00
      expect(page.text()).toContain('Nothing booked');
      expect(page.host.querySelectorAll('article').length).toBe(0);
    });
  });

  describe('filtering by person', () => {
    it('offers everyone, each person, and the visits with nobody chosen', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      const options = [...page.host.querySelectorAll(`${FILTER} option`)].map((o) => (o.textContent ?? '').trim());
      expect(options).toEqual(['Everyone', 'Meena', 'Asha', 'Nobody chosen yet']);
    });

    it('choosing a person shows only that person\'s column and visits; choosing everyone brings the rest back', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await choose(page, FILTER, 'pf2');
      expect(heads(page).length).toBe(1);
      expect(heads(page)[0]).toContain('Asha');
      expect(page.text()).toContain('Allergic to ammonia');
      expect(page.text()).not.toContain('Late Lata');
      expect(page.text()).not.toContain('View bill DP-00001');
      expect(page.host.querySelectorAll('article').length).toBe(1);
      expect(page.host.querySelectorAll('.slot-cell').length).toBe(page.host.querySelectorAll('.slot-time').length);   // one cell per hour
      await choose(page, FILTER, '');
      expect(heads(page).length).toBe(3);
      expect(page.host.querySelectorAll('article').length).toBe(4);
    });

    it('can show just the visits with nobody chosen', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await choose(page, FILTER, 'nobody');
      expect(heads(page)[0]).toContain('Nobody chosen yet');
      expect(page.text()).toContain('Late Lata');
      expect(page.host.querySelectorAll('article').length).toBe(1);
    });

    it('a filtered calendar still offers the same actions on its visits', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await choose(page, FILTER, 'pf1');
      const go = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await page.click(/Bill this visit/);
      expect(go).toHaveBeenCalledWith(['/admin', 'new-bill'], { queryParams: { appointmentId: 'ap1' } });
    });

    it('is not offered when there is only one list to choose from, and staff get it like admin', async () => {
      const one = await open(AppointmentsComponent, { role: 'admin', empty: true });    // no visits and no people: one plain list
      expect(one.host.querySelector(FILTER)).toBeNull();
      expect(heads(one).length).toBe(1);
      TestBed.resetTestingModule();
      const staff = await open(AppointmentsComponent, { role: 'staff' });
      expect(staff.host.querySelector(FILTER)).toBeTruthy();
    });
  });

  describe('the walk-in board', () => {
    it('shows who is waiting, who is in service and who has been billed today, each under its own heading and in that order', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Walk-in queue/);
      const text = page.text();
      for (const heading of ['Waiting', 'In service', 'Completed today']) expect(text).toContain(heading);
      const at = (s: string) => text.indexOf(s);
      expect(at('Walk-in Wanda')).toBeGreaterThan(-1);
      expect(at('Second Sita')).toBeLessThan(at('In service'));
      expect(at('Busy Bhavna')).toBeGreaterThan(at('In service'));
      expect(at('Busy Bhavna')).toBeLessThan(at('Completed today'));
      expect(at('Done Deepa')).toBeGreaterThan(at('Completed today'));
      expect(page.host.querySelectorAll('.place').length).toBe(2);              // only the waiting have a place in line
    });

    it('a walk-in in service can be billed but not started again; a waiting one can be started and billed', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Walk-in queue/);
      expect(buttonsOf(cardFor(page, 'Busy Bhavna'))).toContain('Bill this visit');
      expect(buttonsOf(cardFor(page, 'Busy Bhavna'))).not.toContain('Start');
      expect(buttonsOf(cardFor(page, 'Walk-in Wanda'))).toEqual(expect.arrayContaining(['Start', 'Bill this visit']));
    });

    it('a billed walk-in links to its bill and has no buttons that change it; a voided bill says so', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin' });
      await page.click(/Walk-in queue/);
      const done = cardFor(page, 'Done Deepa');
      expect(done.textContent).toContain('View bill DP-00002');
      expect(done.textContent).not.toContain('voided');
      expect(buttonsOf(done)).toEqual([]);
      const voided = cardFor(page, 'Void Vani');
      expect(voided.textContent).toContain('DP-00003 (voided)');
      expect(buttonsOf(voided)).toEqual([]);
    });

    it('turning a walk-in into a bill is one tap: the billing screen opens for that walk-in (staff and admin)', async () => {
      for (const [role, base] of [['admin', '/admin'], ['staff', '/staff']] as const) {
        const page = await open(AppointmentsComponent, { role });
        const go = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        await page.click(/Walk-in queue/);
        await press(page, cardFor(page, 'Walk-in Wanda').querySelector('.btn-primary'));
        expect(go).toHaveBeenCalledWith([base, 'new-bill'], { queryParams: { appointmentId: 'aq1' } });
        TestBed.resetTestingModule();
      }
    });

    it('with the Bill button switched off, a walk-in cannot be turned into a bill from here', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin', off: ['action.appointments.bill'] });
      await page.click(/Walk-in queue/);
      expect(page.text()).not.toContain('Bill this visit');
      expect(page.text()).toContain('Walk-in Wanda');
    });

    it('with nobody in any state, it says so and shows no empty headings', async () => {
      const page = await open(AppointmentsComponent, { role: 'admin', empty: true });
      await page.click(/Walk-in queue/);
      expect(page.text()).toContain('Nobody is waiting');
      expect(page.text()).not.toContain('In service');
      expect(page.text()).not.toContain('Completed today');
    });
  });

  it('on the day calendar a billed visit with a voided bill says so, and one with a good bill does not', async () => {
    const page = await open(AppointmentsComponent, { role: 'admin' });
    expect(page.text()).toContain('View bill DP-00001');
    expect(page.text()).not.toContain('voided');
  });
});

// ───────────── Staff, performers, tip sharing and advanced commission ─────────────

const byLabel = (page: Page, label: string) => page.host.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const press = async (page: Page, label: string) => {
  const el = byLabel(page, label);
  if (!el) throw new Error(`No control labelled "${label}". Page text: ${page.text().slice(0, 300)}`);
  el.click();
  await page.settle();
};
const typeInto = async (page: Page, label: string, value: string) => {
  const el = byLabel(page, label) as HTMLInputElement | null;
  if (!el) throw new Error(`No box labelled "${label}"`);
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await page.settle();
};
const pick = async (page: Page, label: string, value: string) => {
  const el = byLabel(page, label) as HTMLSelectElement | null;
  if (!el) throw new Error(`No choice labelled "${label}"`);
  el.value = value;
  el.dispatchEvent(new Event('change'));
  await page.settle();
};
const saveButton = (page: Page) => [...page.host.querySelectorAll('button')].find((b) => /Save bill/.test(b.textContent ?? '')) as HTMLButtonElement;
const shareStatus = (page: Page) => (page.host.querySelector('.shares .share-status')?.textContent ?? '').trim();
const tipStatus = (page: Page) => (page.host.querySelector('.tip-share .share-status')?.textContent ?? '').trim();

describe('billing: one service shared between several people', () => {
  it('"Share" splits the line 50 / 50 between two people; Save waits until both are chosen, then sends the percentages (never performedBy)', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    await pick(page, 'Performed by, Massage', 'pf1');
    expect(page.host.querySelector('.shares')).toBeNull();
    await press(page, 'Share Massage between people');
    expect(page.host.querySelector('.shares')).not.toBeNull();
    expect(page.host.querySelector('select.performer')).toBeNull();            // the single choice is replaced by the people
    expect((byLabel(page, 'Person 1 for Massage') as HTMLSelectElement).value).toBe('pf1');      // the person already chosen stays
    expect((byLabel(page, 'Person 2 for Massage') as HTMLSelectElement).value).toBe('');
    expect((byLabel(page, 'Percent for person 1 on Massage') as HTMLInputElement).value).toBe('50');
    expect((byLabel(page, 'Percent for person 2 on Massage') as HTMLInputElement).value).toBe('50');
    expect(shareStatus(page)).toBe('Choose a person');
    expect(saveButton(page).disabled).toBe(true);
    page.http.expectNone((r) => r.method === 'POST');

    await pick(page, 'Person 2 for Massage', 'pf2');
    expect(shareStatus(page)).toBe('Adds up to 100%');
    expect(saveButton(page).disabled).toBe(false);
    await page.click(/Save bill/);
    const body = page.expectOne('POST', '/invoices').request.body;
    expect(body.items).toEqual([{ serviceId: 's3', performers: [{ performerId: 'pf1', percent: 50 }, { performerId: 'pf2', percent: 50 }], quantity: 1 }]);
    expect(JSON.stringify(body)).not.toContain('performedBy');
  });

  it('percentages that do not add up to exactly 100 say what is left and block Save; "Split equally" fixes it, down to the hundredth', async () => {
    const page = await open(NewBillComponent, { role: 'staff' });
    await page.click(/Massage/);
    await press(page, 'Share Massage between people');
    await pick(page, 'Person 1 for Massage', 'pf1');
    await pick(page, 'Person 2 for Massage', 'pf2');
    await typeInto(page, 'Percent for person 1 on Massage', '60');
    expect(shareStatus(page)).toBe('10% too much');
    expect(saveButton(page).disabled).toBe(true);
    await typeInto(page, 'Percent for person 2 on Massage', '39.99');
    expect(shareStatus(page)).toBe('0.01% still to share');
    expect(saveButton(page).disabled).toBe(true);
    await typeInto(page, 'Percent for person 2 on Massage', '40.001');
    expect(shareStatus(page)).toBe('Enter a percentage like 50 or 33.33');
    expect(saveButton(page).disabled).toBe(true);
    await typeInto(page, 'Percent for person 2 on Massage', '40');
    expect(shareStatus(page)).toBe('Adds up to 100%');

    // three people: equal shares add up to exactly 100 (the spare hundredth goes to the first)
    await press(page, 'Remove person 2 from Massage');                              // back to one person: shared no more
    expect(page.host.querySelector('.shares')).toBeNull();
    expect((byLabel(page, 'Performed by, Massage') as HTMLSelectElement).value).toBe('pf1');
  });

  it('the same person cannot be listed twice, and "Split equally" gives each person an equal share', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    await press(page, 'Share Massage between people');
    await pick(page, 'Person 1 for Massage', 'pf1');
    await pick(page, 'Person 2 for Massage', 'pf1');
    expect(shareStatus(page)).toBe('This person is listed twice');
    expect(saveButton(page).disabled).toBe(true);
    await pick(page, 'Person 2 for Massage', 'pf2');
    await page.click(/Split equally/);
    expect((byLabel(page, 'Percent for person 1 on Massage') as HTMLInputElement).value).toBe('50');
    expect(shareStatus(page)).toBe('Adds up to 100%');
  });

  it('a combo can be shared too; a line that is not shared still sends performedBy as it always did', async () => {
    const page = await open(NewBillComponent, { role: 'staff' });
    await page.click(/^\s*Combos/);
    await page.click(/Glow Pack/);
    await page.click(/^\s*Services/);
    await page.click(/Facial/);
    await pick(page, 'Performed by, Facial', 'pf2');
    await press(page, 'Share Glow Pack between people');
    await pick(page, 'Person 1 for Glow Pack', 'pf1');
    await pick(page, 'Person 2 for Glow Pack', 'pf2');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.items).toEqual([
      { comboId: 'c1', performers: [{ performerId: 'pf1', percent: 50 }, { performerId: 'pf2', percent: 50 }], quantity: 1 },
      { serviceId: 's2', performedBy: 'pf2', quantity: 1 },
    ]);
  });

  it('removing the line, or clearing the bill, forgets how it was shared; a new bill starts fresh', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    await press(page, 'Share Massage between people');
    expect(page.host.querySelector('.shares')).not.toBeNull();
    await page.click(/Clear bill/);
    expect(page.host.querySelector('.shares')).toBeNull();
    await page.click(/Massage/);
    expect(page.host.querySelector('.shares')).toBeNull();
    expect((byLabel(page, 'Performed by, Massage') as HTMLSelectElement).value).toBe('');
  });

  it('changing how a line is shared is a different bill, so it gets its own idempotency key', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    await press(page, 'Share Massage between people');
    await pick(page, 'Person 1 for Massage', 'pf1');
    await pick(page, 'Person 2 for Massage', 'pf2');
    await page.click(/Save bill/);
    const first = page.expectOne('POST', '/invoices');
    first.flush({ error: { code: 'X', message: 'Try again' } }, { status: 500, statusText: 'Server Error' });
    await page.settle();
    await page.click(/Save bill/);
    const same = page.expectOne('POST', '/invoices');
    expect(same.request.headers.get('Idempotency-Key')).toBe(first.request.headers.get('Idempotency-Key'));
    same.flush({ error: { code: 'X', message: 'Try again' } }, { status: 500, statusText: 'Server Error' });
    await page.settle();
    await typeInto(page, 'Percent for person 1 on Massage', '70');
    await typeInto(page, 'Percent for person 2 on Massage', '30');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.headers.get('Idempotency-Key')).not.toBe(first.request.headers.get('Idempotency-Key'));
  });

  it('with the Performers page switched off nobody can be chosen or shared with', async () => {
    const page = await open(NewBillComponent, { role: 'admin', off: ['page.performers'] });
    await page.click(/Massage/);
    expect(byLabel(page, 'Share Massage between people')).toBeNull();
    expect(page.host.querySelector('.shares')).toBeNull();
  });
});

describe('billing: a performer made compulsory', () => {
  it('Save is blocked, and the lines that still need someone are named, until each has a performer; discount and tip never need one', async () => {
    const page = await open(NewBillComponent, { role: 'staff', parlour: { performerRequired: true } });
    await page.click(/Massage/);
    await page.click(/Facial/);
    expect(saveButton(page).disabled).toBe(true);
    expect(page.text()).toContain('Choose who performed: Massage, Facial');
    expect(page.text()).toContain('Choose who performed this');
    page.http.expectNone((r) => r.method === 'POST');
    await pick(page, 'Performed by, Massage', 'pf1');
    // a line added next starts with the person chosen last, so Facial has pf1 too; blank it again to see only one line named
    await pick(page, 'Performed by, Facial', '');
    expect(page.text()).toContain('Choose who performed: Facial');
    expect(page.text()).not.toContain('Choose who performed: Massage');
    await pick(page, 'Performed by, Facial', 'pf2');
    expect(page.text()).not.toContain('Choose who performed');
    expect(saveButton(page).disabled).toBe(false);
    await page.type('#tip', '20');
    expect(saveButton(page).disabled).toBe(false);
  });

  it('a line shared between people counts as having performers', async () => {
    const page = await open(NewBillComponent, { role: 'admin', parlour: { performerRequired: true } });
    await page.click(/Massage/);
    expect(saveButton(page).disabled).toBe(true);
    await press(page, 'Share Massage between people');
    await pick(page, 'Person 1 for Massage', 'pf1');
    await pick(page, 'Person 2 for Massage', 'pf2');
    expect(page.text()).not.toContain('Choose who performed');
    expect(saveButton(page).disabled).toBe(false);
  });

  it('nothing is demanded when it is off (as it always was)', async () => {
    const off = await open(NewBillComponent, { role: 'staff' });
    await off.click(/Massage/);
    expect(saveButton(off).disabled).toBe(false);
    expect(off.text()).not.toContain('Choose who performed');
  });

  it('nothing is demanded when the Performers page is switched off, so nobody can be chosen', async () => {
    const pageOff = await open(NewBillComponent, { role: 'staff', parlour: { performerRequired: true }, off: ['page.performers'] });
    await pageOff.click(/Massage/);
    expect(saveButton(pageOff).disabled).toBe(false);
    expect(pageOff.text()).not.toContain('Choose who performed');
  });

  it('if the server still refuses (someone else just switched it on), the bill is kept as it was so it can be fixed and saved again', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    await page.click(/Save bill/);
    page.expectOne('POST', '/invoices').flush({ error: { code: 'PERFORMER_REQUIRED', message: 'Choose who performed: Massage', details: { items: 'Choose who performed: Massage' } } }, { status: 400, statusText: 'Bad Request' });
    await page.settle();
    expect(page.host.querySelectorAll('li.receipt-line').length).toBe(1);
    expect(saveButton(page).disabled).toBe(false);
    await pick(page, 'Performed by, Massage', 'pf2');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.items).toEqual([{ serviceId: 's3', performedBy: 'pf2', quantity: 1 }]);
  });
});

describe('billing: sharing a tip between people', () => {
  const withTip = async (opts: Parameters<typeof open>[1] = { role: 'admin' }) => {
    const page = await open(NewBillComponent, opts);
    await page.click(/Massage/);
    await pick(page, 'Performed by, Massage', 'pf1');
    await page.type('#tip', '500');
    return page;
  };

  it('is offered only when there is a tip, and is "not shared" until chosen: the bill is sent exactly as before', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    expect(page.host.querySelector('.tip-share')).toBeNull();                       // no tip yet
    await page.type('#tip', '500');
    expect(page.host.querySelector('.tip-share')).not.toBeNull();
    expect(page.text()).toContain('Share the tip');
    await page.click(/Save bill/);
    const body = page.expectOne('POST', '/invoices').request.body;
    expect(body.tip).toBe(500);
    expect('tipSplit' in body).toBe(false);
  });

  it('by amount: ₹500 between two people; it says what is left, blocks Save until it adds up, and sends the amounts', async () => {
    const page = await withTip();
    await page.click(/By amount/);
    // starts with the people on the bill, equally (here, the one person chosen)
    expect((byLabel(page, 'Tip: person 1') as HTMLSelectElement).value).toBe('pf1');
    expect((byLabel(page, 'Tip amount for person 1') as HTMLInputElement).value).toBe('500');
    expect(tipStatus(page)).toBe('Adds up to the tip');
    await page.click(/^\s*Add person/);
    await pick(page, 'Tip: person 2', 'pf2');
    expect(tipStatus(page)).toBe('Enter an amount like 250 or 99.50');             // person 2 has no amount yet
    await typeInto(page, 'Tip amount for person 1', '250');
    await typeInto(page, 'Tip amount for person 2', '100');
    expect(tipStatus(page)).toBe('₹150 still to share');
    expect(saveButton(page).disabled).toBe(true);
    await typeInto(page, 'Tip amount for person 2', '251');
    expect(tipStatus(page)).toBe('₹1 too much');
    expect(saveButton(page).disabled).toBe(true);
    page.http.expectNone((r) => r.method === 'POST');
    await typeInto(page, 'Tip amount for person 2', '250');
    expect(tipStatus(page)).toBe('Adds up to the tip');
    expect(saveButton(page).disabled).toBe(false);
    await page.click(/Save bill/);
    const body = page.expectOne('POST', '/invoices').request.body;
    expect(body.tip).toBe(500);
    expect(body.tipSplit).toEqual({ mode: 'fixed', shares: [{ performerId: 'pf1', value: 250 }, { performerId: 'pf2', value: 250 }] });
  });

  it('by percentage: they must add up to 100; "Split equally" shares the tip down to the paisa', async () => {
    const page = await withTip();
    await page.click(/By percentage/);
    expect((byLabel(page, 'Tip percent for person 1') as HTMLInputElement).value).toBe('100');
    await page.click(/^\s*Add person/);
    await pick(page, 'Tip: person 2', 'pf2');
    await typeInto(page, 'Tip percent for person 1', '50');
    await typeInto(page, 'Tip percent for person 2', '49');
    expect(tipStatus(page)).toBe('1% still to share');
    expect(saveButton(page).disabled).toBe(true);
    await page.click(/Split equally/);
    expect(tipStatus(page)).toBe('Adds up to 100%');
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.tipSplit).toEqual({ mode: 'percent', shares: [{ performerId: 'pf1', value: 50 }, { performerId: 'pf2', value: 50 }] });
  });

  it('by amount, an odd tip is split to the paisa, the spare going to the first person', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);
    await pick(page, 'Performed by, Massage', 'pf1');
    await page.type('#tip', '100.01');
    await page.click(/By amount/);
    await page.click(/^\s*Add person/);
    await pick(page, 'Tip: person 2', 'pf2');
    await page.click(/Split equally/);
    expect((byLabel(page, 'Tip amount for person 1') as HTMLInputElement).value).toBe('50.01');
    expect((byLabel(page, 'Tip amount for person 2') as HTMLInputElement).value).toBe('50');
    expect(tipStatus(page)).toBe('Adds up to the tip');
  });

  it('the same person twice, nobody chosen, and a changed tip each block Save; "Not shared" sends no split and forgets nothing about the tip', async () => {
    const page = await withTip();
    await page.click(/By amount/);
    await page.click(/^\s*Add person/);
    await pick(page, 'Tip: person 2', 'pf1');
    expect(tipStatus(page)).toBe('This person is listed twice');
    expect(saveButton(page).disabled).toBe(true);
    await pick(page, 'Tip: person 2', '');
    expect(tipStatus(page)).toBe('Choose a person');
    // the tip changes after it was shared: the amounts no longer add up
    await press(page, 'Remove tip person 2');
    expect(tipStatus(page)).toBe('Adds up to the tip');
    await page.type('#tip', '400');
    expect(tipStatus(page)).toBe('₹100 too much');
    expect(saveButton(page).disabled).toBe(true);
    await page.type('#tip', '600');
    expect(tipStatus(page)).toBe('₹100 still to share');
    await page.click(/Not shared/);
    expect(saveButton(page).disabled).toBe(false);
    await page.click(/Save bill/);
    const body = page.expectOne('POST', '/invoices').request.body;
    expect(body.tip).toBe(600);
    expect('tipSplit' in body).toBe(false);
  });

  it('a tip cleared back to nothing leaves nothing to share; Clear bill forgets the whole split', async () => {
    const page = await withTip();
    await page.click(/By amount/);
    await page.type('#tip', '0');
    expect(page.host.querySelector('.tip-share')).toBeNull();
    expect(saveButton(page).disabled).toBe(false);
    await page.type('#tip', '500');
    expect((byLabel(page, 'Tip amount for person 1') as HTMLInputElement | null)?.value).toBe('500');     // still as it was
    await page.click(/Clear bill/);
    await page.click(/Massage/);
    await page.type('#tip', '500');
    expect(page.text()).toContain('Not shared');
    expect(byLabel(page, 'Tip amount for person 1')).toBeNull();
  });

  it('is not offered without the Tip box', async () => {
    const noTip = await open(NewBillComponent, { role: 'admin', off: ['action.payments.tip'] });
    await noTip.click(/Massage/);
    expect(noTip.host.querySelector('.tip-share')).toBeNull();
  });

  it('is not offered without the Performers page (sharing names people), though the tip itself still works', async () => {
    const noPeople = await open(NewBillComponent, { role: 'admin', off: ['page.performers'] });
    await noPeople.click(/Massage/);
    await noPeople.type('#tip', '500');
    expect(noPeople.host.querySelector('.tip-share')).toBeNull();
    await noPeople.click(/Save bill/);
    const body = noPeople.expectOne('POST', '/invoices').request.body;
    expect(body.tip).toBe(500);
    expect('tipSplit' in body).toBe(false);
  });

  it('a split paid across methods can share its tip too', async () => {
    const page = await withTip();
    await page.click(/By percentage/);
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.tipSplit).toEqual({ mode: 'percent', shares: [{ performerId: 'pf1', value: 100 }] });
  });
});

describe('Settings: the performer is compulsory', () => {
  it('shows what is saved, explains the change before it is saved, and sends it', async () => {
    const page = await open(SettingsComponent, { role: 'admin' });
    const box = html(page, '#performer-required') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(page.text()).toContain('Every service on a bill must say who performed it');
    expect(page.text()).not.toContain('cannot be saved until someone is chosen');
    box.click(); await page.settle();
    expect(page.text()).toContain('a service or combo cannot be saved until someone is chosen');
    expect(page.text()).toContain('Discounts, GST and tips never need one');
    expect(page.text()).toContain('Bills already made do not change');
    await page.click(/Save settings/);
    const req = page.expectOne('PATCH', '/parlour');
    expect(req.request.body.performerRequired).toBe(true);
    req.flush({ data: {} });
    await page.settle();
    expect(page.text()).not.toContain('Bills already made do not change');
  });

  it('opens showing it on when the parlour has it on', async () => {
    const on = await open(SettingsComponent, { role: 'admin', parlour: { performerRequired: true } });
    expect((html(on, '#performer-required') as HTMLInputElement).checked).toBe(true);
    expect(on.text()).not.toContain('Bills already made do not change');
  });

  it('the server\'s refusal (nobody to choose yet) shows next to the setting', async () => {
    const page = await open(SettingsComponent, { role: 'admin' });
    (html(page, '#performer-required') as HTMLInputElement).click(); await page.settle();
    await page.click(/Save settings/);
    page.expectOne('PATCH', '/parlour').flush({ error: { code: 'NO_PERFORMERS_YET', message: 'Add at least one active person on the Performers page before making the performer compulsory.', details: { performerRequired: 'Add a performer first' } } }, { status: 400, statusText: 'Bad Request' });
    await page.settle();
    expect(page.text()).toContain('Add a performer first');
  });
});

describe('the invoice: who performed each line, and how the tip was shared', () => {
  it('a line shared between people lists each with their percentage', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin', invoiceKind: 'shared' });
    expect(page.text()).toMatch(/Performed by\s*Meena 60%\s*·\s*Asha 40%/);
    expect(page.text()).not.toContain('Performed by Meena 100');
  });

  it('a line one person performed still says "Performed by", with no percentage', async () => {
    const solo = await open(InvoiceDetailComponent, { role: 'admin', invoiceKind: 'split' });
    expect(solo.text()).toContain('Performed by Meena');
    expect(solo.text()).not.toMatch(/Meena 100/);
  });

  it('shows how the tip was shared, apart from the total, and leaves both off the printed receipt', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin', invoiceKind: 'shared' });
    expect(page.text()).toMatch(/Tip ₹500(\.00)?: extra, not included in the total above/);
    expect(page.text()).toContain('Tip shared: Meena ₹300');
    expect(page.text()).toContain('Asha ₹200');
    const marked = [...page.host.querySelectorAll('.tip-shares, .performers')];
    expect(marked.length).toBe(2);
    for (const el of marked) expect(el.classList.contains('no-print')).toBe(true);
  });

  it('a bill whose tip was not shared says nothing about sharing', async () => {
    const plain = await open(InvoiceDetailComponent, { role: 'admin', invoiceKind: 'parts' });
    expect(plain.text()).not.toContain('Tip shared');
  });

  it('staff see the same, and never what anyone earned', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'staff', invoiceKind: 'shared' });
    expect(page.text()).toContain('Performed by Meena 60%');
    expect(page.text().toLowerCase()).not.toContain('commission');
  });
});

describe('the Commissions page: rules, priority, history and tips', () => {
  it('lists every rule most specific first, with its priority, who it is for and whether it is on', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    const rows = [...page.host.querySelectorAll('section[aria-labelledby="rules-h"] tbody tr')].map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(rows.length).toBe(5);
    expect(rows[0]).toContain('1 · Person + service');
    expect(rows[0]).toContain('Meena doing Haircut');
    expect(rows[0]).toContain('20% of what the service took in');
    expect(rows[1]).toContain('2 · Person');
    expect(rows[2]).toContain('3 · Service');
    expect(rows[2]).toContain('₹50 each time it is performed');
    expect(rows[3]).toContain('4 · Default');
    expect(rows[3]).toContain('Everybody (default)');
    expect(rows[0]).toContain('Active');
    expect(rows[4]).toContain('Facial');
    expect(rows[4]).toContain('Off');
    expect(page.text()).toContain('1 person + service, 2 person, 3 service, 4 default');
    expect(page.text()).toContain('bills already made, and commission already paid, keep theirs');
  });

  it('adds the default for everybody, which needs neither a person nor a service', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/Add rule/);
    await choose(page, '#r-scope', 'default');
    expect(html(page, '#r-person')).toBeNull();
    expect(html(page, '#r-service')).toBeNull();
    await page.type('#r-value', '5');
    await submit(page, '#rule-form');
    expect(page.expectOne('POST', '/commissions/rules').request.body).toEqual({ scope: 'default', kind: 'percent', value: 5, isActive: true });
  });

  it('adds a rule for a person doing one service: both must be chosen, and both are sent', async () => {
    const pair = await open(CommissionsComponent, { role: 'admin' });
    await pair.click(/Add rule/);
    await choose(pair, '#r-scope', 'performer_service');
    await pair.type('#r-value', '20');
    await submit(pair, '#rule-form');
    expect(pair.text()).toContain('Choose a person');
    expect(pair.text()).toContain('Choose a service');
    pair.http.expectNone((r) => r.method === 'POST');
    await choose(pair, '#r-person', 'pf1');
    await choose(pair, '#r-service', 's3');
    await submit(pair, '#rule-form');
    expect(pair.expectOne('POST', '/commissions/rules').request.body).toEqual({ scope: 'performer_service', performerId: 'pf1', serviceId: 's3', kind: 'percent', value: 20, isActive: true });
  });

  it('a rule that already exists is refused by the server and the message is shown in the dialog', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/Add rule/);
    await choose(page, '#r-person', 'pf1');
    await page.type('#r-value', '5');
    await submit(page, '#rule-form');
    page.expectOne('POST', '/commissions/rules').flush({ error: { code: 'RULE_EXISTS', message: 'There is already a rule for this. Edit that rule instead.' } }, { status: 409, statusText: 'Conflict' });
    await page.settle();
    expect(page.text()).toContain('There is already a rule for this. Edit that rule instead.');
  });

  it('"Switch off" and "Switch on" change only whether the rule is used, and say it applies to new bills', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/Switch off/);
    const off = page.expectOne('PATCH', '/commissions/rules/cr4');
    expect(off.request.body).toEqual({ isActive: false });
    page.http.expectNone((r) => r.method === 'PUT' || r.method === 'POST' || r.method === 'DELETE');
  });

  it('"Switch on" sends only the on/off change for a rule that is off', async () => {
    const on = await open(CommissionsComponent, { role: 'admin' });
    await on.click(/Switch on/);
    expect(on.expectOne('PATCH', '/commissions/rules/cr5').request.body).toEqual({ isActive: true });
  });

  it('editing a switched-off rule shows it unticked, and the rule history lists what was done, with the old and new values', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    const edits = [...page.host.querySelectorAll('section[aria-labelledby="rules-h"] tbody tr')][4].querySelector('button') as HTMLButtonElement;
    edits.click(); await page.settle();
    expect((page.host.querySelector('dialog input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
    await clickIn(page, 'dialog', /Cancel/);
    expect(page.text()).not.toContain('Changed from');
    await page.click(/Show rule history/);
    expect(page.text()).toContain('Changed from 15% of what the service took in to 20% of what the service took in');
    expect(page.text()).toContain('Switched off');
    expect(page.text()).toContain('Olive Owner');
  });

  it('"Which rule applies?" explains the winner and what else could have applied', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    await page.click(/Which rule applies/);
    await choose(page, '#q-person', 'pf1');
    await choose(page, '#q-service', 's1');
    await clickIn(page, 'dialog', /^\s*Check/);                                  // (a read: the test harness answers it)
    expect(page.text()).toContain('20% of what the service took in');
    expect(page.text()).toContain('priority 1');
    expect(page.text()).toContain('← used');
    expect(page.text()).toContain('4 · Default: Everybody (default)');
    expect(page.text()).toContain('3 · Service: Massage');
  });

  it('the people table has a Tips column, and a shared line shows the person\'s share, their part, and which rule it came from', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    expect([...page.host.querySelectorAll('th')].some((th) => /Tips/.test(th.textContent ?? ''))).toBe(true);
    expect(page.text()).toContain('Tips shared');
    await page.click(/Show bills/);
    for (const text of ['Their share', '60%', '20% · Person + service', '5% · Default', '10% · Earlier rule', '10% · Person', '₹50 each · Service', 'No rule']) {
      expect(page.text()).toContain(text);
    }
  });

  it('the tips panel shows what was given to whom, and which bills; tips are never added to commission', async () => {
    const page = await open(CommissionsComponent, { role: 'admin' });
    expect(page.text()).toContain('₹540.00 in tips');
    expect(page.text()).toContain('₹500.00 given to people');
    expect(page.text()).toContain('₹40.00 not shared with anyone');
    expect(page.text()).toContain('not sales, not commission');
    await page.click(/Show the 2 bills with a tip/);
    expect(page.text()).toContain('DP-00001');
    expect(page.text()).toContain('Meena ₹300');
    expect(page.text()).toContain('Asha ₹200');
    expect(page.text()).toContain('(40%)');
    expect(page.text()).toContain('Not shared');
    const r = (page.host.querySelectorAll('.ledger-item')[1] as HTMLElement | undefined)?.textContent ?? '';
    expect(r).not.toContain('540');
  });

  it('with no tips in the period the panel says so; if only the tips fail to load, the commission report still shows', async () => {
    const page = await open(CommissionsComponent, { role: 'admin', empty: true });
    expect(page.text()).toContain('No tips were recorded in this period');
  });
});
