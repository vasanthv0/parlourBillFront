import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, catchError, of } from 'rxjs';
import { AppointmentsApi, CombosApi, CustomersApi, InvoicesApi, NewInvoice, ParlourApi, PerformersApi, ReportsApi, ServicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { computeBill, halfRate, percentOf } from '../../core/gst';
import { BillAttempt } from '../../core/idempotency';
import { SplitInput, emptySplit, formatAmount, parseAmount, paymentsBody, restFor, splitStatus } from '../../core/payments';
import { Appointment, Combo, Customer, Parlour, PaymentMethod, Performer, ReferrerLookup, Service } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { CustomerPickerComponent } from './customer-picker.component';
import { ReferrerPickerComponent } from './referrer-picker.component';

const toPaise = (n: number) => Math.round(n * 100);

/** One line on the bill: a service or a combo. `key` is 's:<id>' or 'c:<id>'. `performerId` is who performed it ('' when nobody is chosen). */
interface Line { key: string; id: string; kind: 'service' | 'combo'; name: string; contents: string; unitPaise: number; qty: number; linePaise: number; performerId: string }
const SWATCHES: Record<string, string> = { hair: 'var(--cat-hair)', skin: 'var(--cat-skin)', nails: 'var(--cat-nails)', waxing: 'var(--cat-waxing)', bridal: 'var(--cat-bridal)' };

@Component({
  selector: 'app-new-bill',
  imports: [FormsModule, RouterLink, DatePipe, MoneyPipe, IconComponent, CustomerPickerComponent, ReferrerPickerComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>New bill</h1>
          <p class="sub">
            @if (myDay(); as d) { Today you have made {{ d.invoices }} bill{{ d.invoices === 1 ? '' : 's' }} totalling {{ d.revenue | money }}. }
            @else { Tap services to build the bill. }
          </p>
        </div>
      </div>

      @if (visit(); as v) {
        <div class="visit-note" role="status">
          <app-icon name="calendar" [size]="16" />
          <span>Billing the visit of <strong>{{ v.customerName }}</strong> ({{ v.kind === 'walk_in' ? 'walk-in' : 'booked for ' + v.time }}). Check the services, choose how it was paid and save.</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="detachVisit()">Not this visit</button>
        </div>
      }
      @if (visitNotice()) { <div class="form-alert" role="alert">{{ visitNotice() }}</div> }

      @if (loading()) {
        <div class="layout"><div class="skeleton" style="height: 360px"></div><div class="skeleton" style="height: 420px"></div></div>
      } @else if (loadError()) {
        <div class="panel empty"><h3>Could not load the service menu</h3><p>{{ loadError() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (services().length === 0) {
        <div class="panel empty">
          <h3>No services on the menu yet</h3>
          @if (auth.role() === 'admin' && auth.hasFeature('action.services.add')) {
            <p>Add the services you offer and their prices, then come back to bill.</p>
            <a class="btn btn-primary" routerLink="/admin/services">Add services</a>
          } @else if (auth.role() === 'admin') { <p>Your menu has not been set up yet. Contact the team that manages your account.</p> }
          @else { <p>Ask your admin to add the service menu, then refresh this page.</p> }
        </div>
      } @else {
        <div class="layout">
          <section aria-label="Services">
            @if (showCombos()) {
              <div class="segmented viewtoggle" role="group" aria-label="What to add">
                <button type="button" [attr.aria-pressed]="view() === 'services'" (click)="view.set('services')">Services</button>
                <button type="button" [attr.aria-pressed]="view() === 'combos'" (click)="view.set('combos')">Combos <span class="count">{{ availableCombos().length }}</span></button>
              </div>
            }
            @if (view() === 'services' || !showCombos()) {
            <div class="toolbar">
              <div class="search input-affix">
                <input class="input" type="search" placeholder="Search services" aria-label="Search services" [ngModel]="search()" (ngModelChange)="search.set($event)" />
                <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
              </div>
            </div>
            <div class="row-wrap chips" role="group" aria-label="Filter by category">
              <button type="button" class="chip" [attr.aria-pressed]="category() === ''" (click)="category.set('')">All</button>
              @for (c of categories(); track c) {
                <button type="button" class="chip" [attr.aria-pressed]="category() === c" (click)="category.set(c)">{{ c }}</button>
              }
            </div>

            @if (visible().length === 0) {
              <div class="panel empty"><h3>No services match</h3><p>Try a different word or category.</p></div>
            } @else {
              <div class="tile-grid">
                @for (s of visible(); track s.id) {
                  <button type="button" class="tile" [class.in-bill]="qtyOf('s:' + s.id) > 0" [style.--swatch]="swatch(s.category)" (click)="add('s:' + s.id)" [attr.aria-label]="'Add ' + s.name + ', ' + (s.price | money)">
                    @if (qtyOf('s:' + s.id) > 0) { <span class="t-count" aria-hidden="true">{{ qtyOf('s:' + s.id) }}</span> }
                    <span class="t-name">{{ s.name }}</span>
                    <span class="t-meta"><span>{{ s.durationMin }} min</span><span class="t-price">{{ s.price | money }}</span></span>
                  </button>
                }
              </div>
            }
            } @else {
              <div class="tile-grid">
                @for (c of availableCombos(); track c.id) {
                  <button type="button" class="tile combo" [class.in-bill]="qtyOf('c:' + c.id) > 0" (click)="add('c:' + c.id)" [attr.aria-label]="'Add combo ' + c.name + ', ' + (c.price | money)">
                    @if (qtyOf('c:' + c.id) > 0) { <span class="t-count" aria-hidden="true">{{ qtyOf('c:' + c.id) }}</span> }
                    <span class="t-name">{{ c.name }}</span>
                    <span class="t-contents">{{ contents(c) }}</span>
                    <span class="t-meta"><span class="t-save">{{ c.savings > 0 ? 'Save ' + (c.savings | money) : 'Combo' }}</span><span class="t-price">{{ c.price | money }}</span></span>
                  </button>
                }
              </div>
            }
          </section>

          <aside class="bill" #billPanel aria-label="Current bill">
            <div class="receipt">
              <div class="receipt-title">
                <h2>{{ parlour()?.name }}</h2>
                <div class="meta">New bill · {{ today | date: 'd MMM y, h:mm a' }}</div>
              </div>

              <div class="customer">
                @if (customer(); as c) {
                  <div class="row spread">
                    <div><strong>{{ c.name }}</strong><div class="muted small num">{{ c.phone }}</div></div>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="customer.set(null)">Change</button>
                  </div>
                } @else {
                  @if (auth.hasFeature('page.customers')) { <app-customer-picker (picked)="customer.set($event)" /> }
                  <input class="input walkin" [placeholder]="auth.hasFeature('page.customers') ? 'Or type a walk-in name (optional)' : 'Customer name (optional)'" aria-label="Walk-in name" maxlength="80" [ngModel]="walkIn()" (ngModelChange)="walkIn.set($event)" />
                }
              </div>

              @if (auth.hasFeature('page.referrals')) {
                <div class="referral">
                  @if (referrer(); as r) {
                    <div class="row spread">
                      <div><strong>{{ r.name }}</strong> <span class="badge badge-admin num">{{ r.code }}</span><div class="muted small">{{ r.percent }}% referral discount</div></div>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="referrer.set(null)">Remove</button>
                    </div>
                  } @else { <app-referrer-picker (picked)="referrer.set($event)" /> }
                </div>
              }

              @if (lines().length === 0) {
                <p class="empty-lines muted">Nothing on the bill yet. Tap a service{{ showCombos() ? ' or a combo' : '' }} to add it.</p>
              } @else {
                <ul class="receipt-lines">
                  @for (l of lines(); track l.key) {
                    <li class="receipt-line">
                      <span class="name">{{ l.name }} @if (l.kind === 'combo') { <span class="badge badge-admin">Combo</span> }</span>
                      <span class="amt">{{ l.linePaise / 100 | money }}</span>
                      <span class="sub">{{ l.unitPaise / 100 | money }} each</span>
                      <span class="qty-wrap">
                        <span class="qty">
                          <button type="button" [attr.aria-label]="'Remove one ' + l.name" (click)="change(l.key, -1)"><app-icon [name]="l.qty === 1 ? 'trash' : 'minus'" [size]="14" /></button>
                          <span aria-live="polite">{{ l.qty }}</span>
                          <button type="button" [attr.aria-label]="'Add one ' + l.name" (click)="change(l.key, 1)"><app-icon name="plus" [size]="14" /></button>
                        </span>
                      </span>
                      @if (l.contents) { <span class="contents">{{ l.contents }}</span> }
                      @if (showPerformers()) {
                        <select class="select performer" [attr.aria-label]="'Performed by, ' + l.name" [ngModel]="l.performerId" (ngModelChange)="setPerformer(l.key, $event)">
                          <option value="">Performed by…</option>
                          @for (p of performers(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                        </select>
                      }
                    </li>
                  }
                </ul>
              }

              <div class="receipt-sums">
                <div class="line"><span>Subtotal{{ inclusive() ? ' (incl. GST)' : '' }}</span><span>{{ subtotalP() / 100 | money: true }}</span></div>
                @if (referrer(); as r) { <div class="line referral-line"><span>Referral discount ({{ r.percent }}%)</span><span>− {{ referralP() / 100 | money: true }}</span></div> }
                <div class="line discount">
                  <label for="discount">{{ referrer() ? 'Extra discount' : 'Discount' }}</label>
                  <span class="input-prefix"><span class="prefix">₹</span><input id="discount" class="input" inputmode="decimal" placeholder="0" [ngModel]="discountInput()" (ngModelChange)="discountInput.set($event)" [class.bad]="discountError()" /></span>
                </div>
                @if (discountError(); as m) { <div class="field-error">{{ m }}</div> }
                @if (bill().tax > 0 && !inclusive()) {
                  <div class="line"><span>Taxable value</span><span>{{ bill().taxable / 100 | money: true }}</span></div>
                  <div class="line"><span>CGST {{ half() }}%</span><span>{{ bill().cgst / 100 | money: true }}</span></div>
                  <div class="line"><span>SGST {{ half() }}%</span><span>{{ bill().sgst / 100 | money: true }}</span></div>
                }
              </div>
              <div class="receipt-total"><span class="label">Total</span><span class="amount">{{ totalP() / 100 | money }}</span></div>
              @if (inclusive()) {
                <div class="receipt-sums included">
                  <div class="line heading"><span>Total includes GST of {{ bill().tax / 100 | money: true }}</span></div>
                  <div class="line"><span>Taxable value</span><span>{{ bill().taxable / 100 | money: true }}</span></div>
                  <div class="line"><span>CGST {{ half() }}%</span><span>{{ bill().cgst / 100 | money: true }}</span></div>
                  <div class="line"><span>SGST {{ half() }}%</span><span>{{ bill().sgst / 100 | money: true }}</span></div>
                </div>
              }

              <div class="pay">
                <div class="row spread">
                  <div class="label" id="pay-label">Payment</div>
                  @if (canSplit()) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="toggleSplit()">{{ splitting() ? 'Pay with one method' : 'Split payment' }}</button>
                  }
                </div>
                @if (!splitting()) {
                  <div class="segmented fill" role="group" aria-labelledby="pay-label">
                    @for (m of methods; track m.value) {
                      <button type="button" [attr.aria-pressed]="payment() === m.value" (click)="payment.set(m.value)">{{ m.label }}</button>
                    }
                  </div>
                } @else {
                  <div class="split" role="group" aria-labelledby="pay-label">
                    @for (m of methods; track m.value) {
                      <div class="split-row">
                        <label [for]="'pay-' + m.value">{{ m.label }}</label>
                        <span class="input-prefix"><span class="prefix">₹</span><input [id]="'pay-' + m.value" class="input" inputmode="decimal" placeholder="0" [ngModel]="splitInput()[m.value]" (ngModelChange)="setPart(m.value, $event)" [class.bad]="splitState().invalid.includes(m.value)" /></span>
                        <button type="button" class="btn btn-ghost btn-sm" [attr.aria-label]="'Put the rest of the bill in ' + m.label" (click)="fillRest(m.value)">Rest</button>
                      </div>
                    }
                    <div class="split-status" role="status" [class.ok]="splitState().ok">
                      @if (splitState().invalid.length) { Enter amounts like 100 or 99.50 }
                      @else if (splitState().ok) { Adds up to the total }
                      @else if (splitState().remaining > 0) { {{ splitState().remaining / 100 | money: true }} still to pay }
                      @else { {{ -splitState().remaining / 100 | money: true }} too much }
                    </div>
                  </div>
                }
                @if (canTip()) {
                  <div class="tip">
                    <label for="tip">Tip <span class="muted small">(optional, not in the total)</span></label>
                    <span class="input-prefix"><span class="prefix">₹</span><input id="tip" class="input" inputmode="decimal" placeholder="0" [ngModel]="tipInput()" (ngModelChange)="tipInput.set($event)" [class.bad]="tipError()" /></span>
                  </div>
                  @if (tipError(); as m) { <div class="field-error">{{ m }}</div> }
                }
              </div>

              <button type="button" class="btn btn-primary btn-lg btn-block save" [disabled]="!canSave()" (click)="save()">
                {{ saving() ? 'Saving…' : lines().length ? 'Save bill · ' + (totalP() / 100 | money) : 'Save bill' }}
              </button>
              @if (lines().length) { <button type="button" class="btn btn-ghost btn-block clear" (click)="clear()">Clear bill</button> }
            </div>
          </aside>
        </div>

        @if (lines().length) {
          <div class="mobile-bar no-print">
            <div><div class="muted small">{{ itemCount() }} item{{ itemCount() === 1 ? '' : 's' }}</div><strong class="num">{{ totalP() / 100 | money }}</strong></div>
            <button type="button" class="btn btn-primary" (click)="jumpToBill()">Review bill</button>
          </div>
        }
      }
    </div>`,
  styles: [`
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 28px; align-items: start; }
    .chips { margin-bottom: 16px; gap: 8px; }
    .bill { position: sticky; top: 20px; padding: 8px 0 12px; }
    .customer { padding: 14px 0; border-bottom: 1px dashed var(--line-strong); display: grid; gap: 8px; }
    .walkin { min-height: 38px; font-size: 14px; }
    .referral { padding: 14px 0; border-bottom: 1px dashed var(--line-strong); }
    .referral-line { color: var(--sage); font-weight: 600; }
    .included { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line-strong); font-size: 13.5px; .heading { color: var(--muted); font-weight: 600; } }
    .viewtoggle { margin-bottom: 14px; .count { margin-left: 4px; opacity: 0.7; } }
    .tile.combo { .t-contents { color: var(--muted); font-size: 13px; line-height: 1.3; } .t-save { color: var(--sage); font-weight: 600; } }
    .receipt-line .contents { grid-column: 1 / -1; color: var(--muted); font-size: 13px; }
    .receipt-line .performer { grid-column: 1 / -1; min-height: 34px; padding-top: 4px; padding-bottom: 4px; font-size: 13.5px; }
    .empty-lines { padding: 22px 0; text-align: center; border-bottom: 1px dashed var(--line-strong); }
    .receipt-line .qty-wrap { grid-column: 2; grid-row: 2; justify-self: end; }
    .receipt-line .sub { grid-column: 1; grid-row: 2; align-self: center; }
    .discount { align-items: center; .input-prefix { width: 120px; } .input { text-align: right; min-height: 36px; padding-top: 6px; padding-bottom: 6px; } .input.bad { border-color: var(--brick); } }
    .pay { margin-top: 18px; display: grid; gap: 6px; }
    .split { display: grid; gap: 8px; }
    .split-row { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 8px; .input { text-align: right; min-height: 36px; padding-top: 6px; padding-bottom: 6px; } .input.bad { border-color: var(--brick); } }
    .split-status { font-size: 13.5px; font-weight: 600; color: var(--brick); text-align: right; &.ok { color: var(--sage); } }
    .tip { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; .input-prefix { width: 120px; flex: none; } .input { text-align: right; min-height: 36px; padding-top: 6px; padding-bottom: 6px; } .input.bad { border-color: var(--brick); } }
    .visit-note { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 12px; border-radius: var(--r-control); background: var(--lacquer-tint); color: var(--lacquer-ink); font-size: 14px; }
    .save { margin-top: 16px; }
    .clear { margin-top: 6px; }
    .mobile-bar { display: none; }
    @media (max-width: 1000px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .bill { position: static; }
      .mobile-bar { display: flex; align-items: center; justify-content: space-between; position: fixed; left: 0; right: 0; bottom: 0; z-index: 25; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: var(--surface); border-top: 1px solid var(--line-strong); box-shadow: 0 -6px 18px rgba(36, 26, 39, 0.1); strong { font-family: var(--font-display); font-size: 20px; } }
    }
  `],
})
export class NewBillComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly invoicesApi = inject(InvoicesApi);
  private readonly servicesApi = inject(ServicesApi);
  private readonly combosApi = inject(CombosApi);
  private readonly parlourApi = inject(ParlourApi);
  private readonly reports = inject(ReportsApi);
  private readonly performersApi = inject(PerformersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly appointmentsApi = inject(AppointmentsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly billEl = viewChild<ElementRef<HTMLElement>>('billPanel');

  protected readonly methods: { value: PaymentMethod; label: string }[] = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }];
  protected readonly today = new Date();

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly services = signal<Service[]>([]);
  protected readonly combos = signal<Combo[]>([]);
  protected readonly parlour = signal<Parlour | null>(null);
  protected readonly myDay = signal<{ invoices: number; revenue: number } | null>(null);

  protected readonly view = signal<'services' | 'combos'>('services');
  protected readonly search = signal('');
  protected readonly category = signal('');
  protected readonly cart = signal<ReadonlyMap<string, number>>(new Map());
  /** Who performed each line (line key to performer id). A line with no entry has nobody chosen, and the bill is saved without one. */
  protected readonly performerOf = signal<ReadonlyMap<string, string>>(new Map());
  /** The person chosen most recently: a line added next starts with them, because one person usually does the whole bill. */
  private readonly lastPerformer = signal('');
  protected readonly performers = signal<Performer[]>([]);
  protected readonly customer = signal<Customer | null>(null);
  protected readonly referrer = signal<ReferrerLookup | null>(null);
  protected readonly walkIn = signal('');
  protected readonly discountInput = signal('');
  protected readonly payment = signal<PaymentMethod>('cash');
  protected readonly saving = signal(false);

  /** The visit being billed (opened from the Appointments page). Making the bill closes it. Null for an ordinary bill. */
  protected readonly visit = signal<Appointment | null>(null);
  protected readonly visitNotice = signal('');
  /** The visit asked for in the address, until it has been loaded once (or given up on). */
  private pendingVisit: string | null = this.route.snapshot.queryParamMap.get('appointmentId');

  protected readonly categories = computed(() => [...new Set(this.services().map((s) => s.category))].sort());
  protected readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.category();
    return this.services().filter((s) => (!cat || s.category === cat) && (!q || s.name.toLowerCase().includes(q)));
  });
  protected readonly availableCombos = computed(() => this.combos().filter((c) => c.available));
  protected readonly showCombos = computed(() => this.auth.hasFeature('page.combos') && this.availableCombos().length > 0);
  /** The "Performed by" choice shows only when the Performers page is on and there is someone to choose. */
  protected readonly showPerformers = computed(() => this.auth.hasFeature('page.performers') && this.performers().length > 0);

  // Same arithmetic as the server (integer paise, core/gst.ts), so the total on screen is the total that is saved.
  protected readonly lines = computed<Line[]>(() => {
    const services = new Map(this.services().map((s) => [s.id, s]));
    const combos = new Map(this.availableCombos().map((c) => [c.id, c]));
    const who = this.performerOf();
    return [...this.cart().entries()].flatMap(([key, qty]): Line[] => {
      const id = key.slice(2);
      if (key.startsWith('s:')) {
        const s = services.get(id);
        return s ? [{ key, id, kind: 'service', name: s.name, contents: '', unitPaise: toPaise(s.price), qty, linePaise: toPaise(s.price) * qty, performerId: who.get(key) ?? '' }] : [];
      }
      const c = combos.get(id);
      return c ? [{ key, id, kind: 'combo', name: c.name, contents: this.contents(c), unitPaise: toPaise(c.price), qty, linePaise: toPaise(c.price) * qty, performerId: who.get(key) ?? '' }] : [];
    });
  });
  protected readonly itemCount = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));
  protected readonly subtotalP = computed(() => this.lines().reduce((s, l) => s + l.linePaise, 0));
  /** The referrer's percentage of the subtotal. */
  protected readonly referralP = computed(() => {
    const r = this.referrer();
    return r ? percentOf(this.subtotalP(), r.percent) : 0;
  });
  private readonly discountValue = computed(() => {
    const raw = this.discountInput().trim();
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n : NaN;
  });
  protected readonly discountError = computed(() => {
    const d = this.discountValue();
    if (Number.isNaN(d)) return 'Enter an amount like 100 or 99.50';
    if (toPaise(d) + this.referralP() <= this.subtotalP()) return '';
    return this.referralP() ? 'With the referral discount, this is more than the subtotal' : 'Discount cannot be more than the subtotal';
  });
  private readonly discountP = computed(() => (this.discountError() ? 0 : toPaise(this.discountValue())));
  /** The whole bill: GST added on top of the prices or already inside them, as the parlour's setting says, split into CGST and SGST. */
  protected readonly bill = computed(() => computeBill({
    subtotal: this.subtotalP(), referral: this.referralP(), discount: this.discountP(),
    taxPercent: this.parlour()?.taxPercent ?? 0, priceMode: this.parlour()?.gstPriceMode ?? 'exclusive',
  }));
  protected readonly totalP = computed(() => this.bill().total);
  /** The prices already contain GST, so the tax is part of the total rather than added to it. */
  protected readonly inclusive = computed(() => this.bill().priceMode === 'inclusive' && this.bill().tax > 0);
  protected readonly half = computed(() => halfRate(this.parlour()?.taxPercent ?? 0));

  // How it is paid. One method is the default and is never switchable; splitting a bill and recording a tip each have a switch.
  protected readonly splitMode = signal(false);
  protected readonly splitInput = signal<SplitInput>(emptySplit());
  protected readonly tipInput = signal('');
  /** Splitting needs its button switched on, and something to pay: a bill of ₹0 has nothing to split. */
  protected readonly canSplit = computed(() => this.auth.hasFeature('action.payments.split') && this.totalP() > 0);
  protected readonly canTip = computed(() => this.auth.hasFeature('action.payments.tip'));
  protected readonly splitting = computed(() => this.splitMode() && this.canSplit());
  /** Where the split stands against the total, in whole paise. The server checks the same rule again when the bill is saved. */
  protected readonly splitState = computed(() => splitStatus(this.splitInput(), this.totalP()));
  private readonly tipParsed = computed(() => (this.canTip() ? parseAmount(this.tipInput()) : 0));
  protected readonly tipError = computed(() => (this.tipParsed() === null ? 'Enter an amount like 50 or 49.50' : ''));
  /** Extra money for the staff. It is not part of the total and takes no part in the payments adding up. */
  private readonly tipP = computed(() => this.tipParsed() ?? 0);
  protected readonly canSave = computed(() => this.lines().length > 0 && !this.discountError() && !this.tipError() && (!this.splitting() || this.splitState().ok) && !this.saving());

  constructor() {
    this.load();
    this.reports.myDay().subscribe({ next: (d) => this.myDay.set(d), error: () => undefined });
  }

  protected contents(c: Combo) { return c.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(' + '); }

  protected load() {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      services: this.servicesApi.list(),
      parlour: this.parlourApi.get(),
      // Combos are optional: if they are switched off or fail to load, billing carries on with services.
      combos: this.auth.hasFeature('page.combos') ? this.combosApi.list().pipe(catchError(() => of([] as Combo[]))) : of([] as Combo[]),
      // The people to choose from are optional too: if they are switched off or fail to load, billing carries on without them.
      performers: this.auth.hasFeature('page.performers') ? this.performersApi.list().pipe(catchError(() => of([] as Performer[]))) : of([] as Performer[]),
    }).subscribe({
      next: ({ services, parlour, combos, performers }) => {
        this.services.set(services);
        this.setPerformers(performers);
        this.combos.set(combos);
        this.parlour.set(parlour);
        // Drop anything in the bill that is no longer for sale.
        const valid = new Set([...services.map((s) => 's:' + s.id), ...combos.filter((c) => c.available).map((c) => 'c:' + c.id)]);
        this.cart.update((c) => new Map([...c].filter(([key]) => valid.has(key))));
        if (this.view() === 'combos' && !combos.some((c) => c.available)) this.view.set('services');
        this.loading.set(false);
        this.loadVisit(services, performers);
      },
      error: (e) => { this.loadError.set(parseError(e).message); this.loading.set(false); },
    });
  }

  /**
   * Fills the bill from the visit: its services, who does them, and its customer. The prices come from the menu as always, and the
   * server prices the bill again when it is saved. Anything that no longer matches (a service gone from the menu) is left off, and said so.
   */
  private loadVisit(services: Service[], performers: Performer[]) {
    const id = this.pendingVisit;
    this.pendingVisit = null;
    if (!id) return;
    if (!this.auth.hasFeature('action.appointments.bill')) { this.visitNotice.set('Billing a visit is switched off for this parlour. Make the bill here as usual.'); return; }
    this.appointmentsApi.get(id).subscribe({
      next: (a) => {
        if (a.status !== 'booked' && a.status !== 'waiting' && a.status !== 'in_service') {
          this.visitNotice.set(a.status === 'completed' ? 'That visit has already been billed.' : 'That visit was cancelled, so it cannot be billed.');
          return;
        }
        const menu = new Map(services.map((s) => [s.id, s]));
        const cart = new Map<string, number>();
        let left = 0;
        for (const l of a.services) {
          const s = l.serviceId ? menu.get(l.serviceId) : undefined;
          if (s) cart.set('s:' + s.id, Math.min(50, (cart.get('s:' + s.id) ?? 0) + l.quantity)); else left++;
        }
        this.cart.set(cart);
        if (a.performerId && performers.some((p) => p.id === a.performerId)) {
          this.performerOf.set(new Map([...cart.keys()].map((k) => [k, a.performerId as string])));
          this.lastPerformer.set(a.performerId);
        }
        if (a.customerId && this.auth.hasFeature('page.customers')) {
          this.customersApi.get(a.customerId).subscribe({ next: (c) => this.customer.set(c), error: () => this.walkIn.set(a.customerName) });
        } else if (a.customerName && a.customerName !== 'Walk-in') {
          this.walkIn.set(a.customerName);
        }
        if (left) this.visitNotice.set(`${left} ${left === 1 ? 'service' : 'services'} on the visit ${left === 1 ? 'is' : 'are'} no longer on the menu and ${left === 1 ? 'was' : 'were'} left off. Add what was done.`);
        this.visit.set(a);
      },
      error: (e) => this.visitNotice.set(parseError(e).message),
    });
  }

  /** Make an ordinary bill instead: the visit stays open. */
  protected detachVisit() { this.visit.set(null); this.visitNotice.set(''); }

  protected qtyOf(key: string) { return this.cart().get(key) ?? 0; }
  protected add(key: string) { this.change(key, 1); }
  protected change(key: string, delta: number) {
    const isNew = !this.cart().has(key);
    this.cart.update((c) => {
      const next = new Map(c);
      const qty = Math.min(50, (next.get(key) ?? 0) + delta);
      if (qty <= 0) next.delete(key); else next.set(key, qty);
      return next;
    });
    if (!this.cart().has(key)) this.performerOf.update((m) => { const next = new Map(m); next.delete(key); return next; });
    else if (isNew && this.showPerformers() && this.lastPerformer()) this.performerOf.update((m) => new Map(m).set(key, this.lastPerformer()));
  }

  /** Choose who performed a line (an empty choice means nobody). */
  protected setPerformer(key: string, id: string) {
    this.performerOf.update((m) => { const next = new Map(m); if (id) next.set(key, id); else next.delete(key); return next; });
    if (id) this.lastPerformer.set(id);
  }

  /** Takes the list of people on offer, and drops anyone chosen on the bill who is no longer on it (deactivated or removed). */
  private setPerformers(list: Performer[]) {
    this.performers.set(list);
    const ok = new Set(list.map((p) => p.id));
    this.performerOf.update((m) => new Map([...m].filter(([, id]) => ok.has(id))));
    if (!ok.has(this.lastPerformer())) this.lastPerformer.set('');
  }

  protected clear() {
    this.performerOf.set(new Map()); this.lastPerformer.set('');
    this.cart.set(new Map()); this.discountInput.set(''); this.referrer.set(null);
    this.tipInput.set(''); this.splitMode.set(false); this.splitInput.set(emptySplit());
  }

  protected toggleSplit() {
    if (this.splitMode()) { this.splitMode.set(false); return; }
    // Start with the whole bill on the method already chosen, so only the part for another method has to be typed.
    this.splitInput.set({ ...emptySplit(), [this.payment()]: formatAmount(this.totalP()) });
    this.splitMode.set(true);
  }
  protected setPart(method: PaymentMethod, text: string) { this.splitInput.update((s) => ({ ...s, [method]: text })); }
  /** Puts whatever is still to be paid in this method's box. */
  protected fillRest(method: PaymentMethod) { this.splitInput.update((s) => ({ ...s, [method]: restFor(s, method, this.totalP()) })); }
  protected swatch(category: string) { return SWATCHES[category.trim().toLowerCase()] ?? 'var(--cat-other)'; }
  protected jumpToBill() { this.billEl()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /**
   * One key per distinct bill. Tapping Save again on the SAME bill (after a timeout, or a dropped connection where the
   * server may already have saved it) sends the same key, so the server returns that bill instead of making another.
   * Change anything on the bill and the next Save gets a new key.
   */
  private readonly attempt = new BillAttempt();

  protected save() {
    if (!this.canSave()) return;
    this.saving.set(true);
    const tip = this.tipP();
    const bill: NewInvoice = {
      customerId: this.customer()?.id ?? null,
      walkInName: this.customer() ? undefined : this.walkIn().trim() || undefined,
      items: this.lines().map((l) => ({ ...(l.kind === 'combo' ? { comboId: l.id } : { serviceId: l.id }), ...(l.performerId ? { performedBy: l.performerId } : {}), quantity: l.qty })),
      referrerId: this.referrer()?.id ?? null,
      discount: this.discountP() / 100,
      // One method is sent exactly as it always was; a split sends each amount. Either way the server checks they add up.
      ...(this.splitting() ? { payments: paymentsBody(this.splitState().parts) } : { paymentMethod: this.payment() }),
      ...(tip > 0 ? { tip: tip / 100 } : {}),
      ...(this.visit() ? { appointmentId: this.visit()!.id } : {}),
    };
    this.invoicesApi.create(bill, this.attempt.keyFor(bill)).subscribe({
      next: (inv) => {
        this.toast.success(`Bill ${inv.number} saved`);
        void this.router.navigate([this.auth.basePath(), 'invoices', inv.id], { queryParams: { new: 1 } });
      },
      error: (e) => {
        this.saving.set(false);
        const info = parseError(e);
        this.toast.error(info.message);
        // The menu changed while billing: refresh it. A referrer that is no longer valid comes off the bill.
        if (info.code === 'SERVICE_UNAVAILABLE' || info.code === 'COMBO_UNAVAILABLE') this.load();
        if (info.code === 'REFERRER_UNAVAILABLE') this.referrer.set(null);
        // Someone chosen on the bill was deactivated meanwhile: refresh the list, which takes them off the bill.
        if (info.code === 'PERFORMER_UNAVAILABLE') this.performersApi.list().subscribe({ next: (l) => this.setPerformers(l), error: () => undefined });
        // The visit was billed, cancelled or removed by someone else meanwhile: this becomes an ordinary bill.
        if (info.code === 'APPOINTMENT_ALREADY_BILLED' || info.code === 'APPOINTMENT_CLOSED' || info.code === 'APPOINTMENT_NOT_FOUND' || info.code === 'FEATURE_DISABLED') this.detachVisit();
        if (info.code === 'IDEMPOTENCY_KEY_REUSED') this.attempt.forget(bill); // the next Save starts a fresh attempt
      },
    });
  }
}
