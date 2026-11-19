import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { parseError } from '../../core/errors';
import { PageMeta } from '../../core/models';
import {
  BillingCycle, CYCLE_LABEL, EVENT_LABEL, METHOD_LABEL, PAYMENT_STATUS_LABEL, PaymentDraft, PaymentInput, ParlourSubscription, STATUS_LABEL,
  SubscriptionAction, SubscriptionEvent, SubscriptionMeta, SubscriptionPayment, SubscriptionPlan, SubscriptionsApi, actionsFor, emptyPaymentDraft,
  eventDetail, formatDate, paymentBadge, paymentFromDraft, remainingText, statusBadge, todayIso,
} from '../../core/subscriptions';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { PaymentFieldsComponent } from './payment-fields.component';
import { PaymentStatusDialogComponent } from './payment-status-dialog.component';

type DialogKind = SubscriptionAction | 'assign' | 'record';
type PayTarget = 'paid' | 'failed' | 'refunded';
type Tab = 'payments' | 'history' | 'access';

/** The keys the server uses for a payment's own fields, so its messages land under the payment form. */
const PAYMENT_FIELDS = ['amount', 'method', 'status', 'paymentDate', 'reference', 'notes'];

/**
 * One parlour's subscription, for the platform admin: its plan, dates and status; the things you can do to it (give a plan, activate, renew,
 * change plan, suspend, reactivate, remove); the payments you have recorded by hand; its history; and exactly which pages each parlour gets
 * and why (your switch, the plan, or the subscription being inactive).
 *
 * Everything is a request to the server, which checks it again. No payment is collected here: you type in money you received.
 * Nothing on this panel ever changes the parlour's own on/off switches.
 */
@Component({
  selector: 'app-parlour-subscription',
  imports: [IconComponent, ModalComponent, MoneyPipe, PaymentFieldsComponent, PaymentStatusDialogComponent],
  template: `
    <section class="panel" aria-labelledby="sub-h">
      <div class="panel-head">
        <h2 id="sub-h">Subscription</h2>
        @if (sub(); as s) { <span class="badge" [class]="badge(s.status)">{{ statusLabel[s.status] }}</span> }
      </div>

      @if (loading()) {
        <div class="panel-body"><div class="skeleton" style="height: 120px"></div></div>
      } @else if (error()) {
        <div class="panel-body"><div class="form-alert" role="alert">{{ error() }}</div><button class="btn btn-secondary btn-sm" (click)="load()">Try again</button></div>
      } @else if (!sub()) {
        <div class="panel-body empty-sub">
          <p><strong>No subscription.</strong> This parlour runs without a plan: every page you leave switched on below is available, with no limits, exactly as before subscriptions existed.</p>
          <button type="button" class="btn btn-primary" [disabled]="!ready()" (click)="open('assign')"><app-icon name="plus" /> Give a plan</button>
        </div>
      } @else {
        @if (sub(); as s) {
          <div class="panel-body stack">
            @if (s.entitlements?.mode === 'lapsed') {
              <div class="form-alert" role="note">
                @if (s.status === 'pending') { This subscription is waiting to be activated. Until then <strong>{{ s.parlourName }}</strong> can only use billing and its subscription page. }
                @else if (s.status === 'expired') { This subscription ended on {{ date(s.expiresOn) }}. Until it is renewed <strong>{{ s.parlourName }}</strong> can only use billing and its subscription page. }
                @else { This subscription is suspended. Until it is reactivated <strong>{{ s.parlourName }}</strong> can only use billing and its subscription page. }
              </div>
            }

            <div class="facts">
              <div><div class="k">Plan</div><div class="v">{{ s.plan.name }}@if (!s.plan.isActive) { <span class="badge badge-warn">No longer offered</span> }</div><div class="muted small">{{ cycle[s.billingCycle] }} · {{ s.price | money }} {{ s.billingCycle === 'yearly' ? 'a year' : 'a month' }}</div></div>
              <div><div class="k">Started</div><div class="v">{{ date(s.startsOn) }}</div></div>
              <div><div class="k">Expires</div><div class="v">{{ date(s.expiresOn) }}</div><div class="small" [class.warn]="s.expiringSoon || s.status === 'expired'">{{ remaining(s) }}</div></div>
              <div><div class="k">Next renewal</div><div class="v">{{ s.renewalPrice | money }}</div><div class="muted small">{{ s.renewalPrice !== s.price ? 'The plan’s price has changed since this period started.' : 'Same as now.' }}</div></div>
            </div>

            <div class="actions">
              @for (a of actions(); track a) {
                @switch (a) {
                  @case ('activate') { <button type="button" class="btn btn-primary" (click)="open('activate')">Activate</button> }
                  @case ('renew') { <button type="button" class="btn btn-primary" (click)="open('renew')">Renew</button> }
                  @case ('reactivate') { <button type="button" class="btn btn-primary" (click)="open('reactivate')">Reactivate subscription</button> }
                  @case ('change') { <button type="button" class="btn btn-secondary" (click)="open('change')">Change plan</button> }
                  @case ('suspend') { <button type="button" class="btn btn-secondary" (click)="open('suspend')">Suspend subscription</button> }
                  @case ('remove') { <button type="button" class="btn btn-ghost danger-text" (click)="open('remove')">Remove plan</button> }
                }
              }
              <button type="button" class="btn btn-secondary" (click)="open('record')"><app-icon name="wallet" /> Record a payment</button>
            </div>
          </div>

          <div class="tabs-bar">
            <div class="segmented" role="group" aria-label="Subscription details">
              <button type="button" [attr.aria-pressed]="tab() === 'payments'" (click)="setTab('payments')">Payments</button>
              <button type="button" [attr.aria-pressed]="tab() === 'history'" (click)="setTab('history')">History</button>
              <button type="button" [attr.aria-pressed]="tab() === 'access'" (click)="setTab('access')">What they get</button>
            </div>
          </div>

          <div class="panel-body">
            @switch (tab()) {
              @case ('payments') {
                <p class="muted small" style="margin-bottom: 10px">Money this parlour pays you for ParlourBill, recorded by hand. Not the bills it makes for its own customers.</p>
                @if (listLoading()) { <div class="skeleton" style="height: 90px"></div> }
                @else if (payments().length === 0) { <p class="muted">No payment recorded yet.</p> }
                @else {
                  <div class="table-wrap">
                    <table class="table">
                      <thead><tr><th>Date</th><th>For</th><th>Method</th><th>Reference</th><th class="num">Amount</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
                      <tbody>
                        @for (p of payments(); track p.id) {
                          <tr>
                            <td class="nowrap">{{ date(p.paymentDate) }}</td>
                            <td>{{ p.planName }}<div class="muted small">@if (p.periodStart && p.periodEnd) { {{ date(p.periodStart) }} – {{ date(p.periodEnd) }} } @else { {{ cycle[p.billingCycle] }} }</div></td>
                            <td>{{ methods[p.method] }}</td>
                            <td>{{ p.reference }}@if (!p.reference) { <span class="muted">None</span> }@if (p.notes) { <div class="muted small">{{ p.notes }}</div> }</td>
                            <td class="num">{{ p.amount | money: true }}</td>
                            <td><span class="badge" [class]="payBadge(p.status)">{{ payLabel[p.status] }}</span></td>
                            <td class="cell-actions">
                              @for (t of nextFor(p); track t) {
                                <button type="button" class="btn btn-secondary btn-sm" (click)="settle(p, t)">{{ t === 'paid' ? 'Mark received' : t === 'failed' ? 'Mark failed' : 'Mark refunded' }}</button>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                    @if (payMeta().pages > 1) {
                      <div class="table-foot">
                        <span>{{ payMeta().total }} payments</span>
                        <span class="row">
                          <button class="btn btn-secondary btn-sm" [disabled]="payMeta().page <= 1" (click)="loadPayments(payMeta().page - 1)">Previous</button>
                          <span>Page {{ payMeta().page }} of {{ payMeta().pages }}</span>
                          <button class="btn btn-secondary btn-sm" [disabled]="payMeta().page >= payMeta().pages" (click)="loadPayments(payMeta().page + 1)">Next</button>
                        </span>
                      </div>
                    }
                  </div>
                }
              }
              @case ('history') {
                @if (listLoading()) { <div class="skeleton" style="height: 90px"></div> }
                @else if (events().length === 0) { <p class="muted">Nothing has happened yet.</p> }
                @else {
                  <ol class="timeline">
                    @for (e of events(); track e.id) {
                      <li>
                        <div class="t-head"><strong>{{ eventLabel[e.type] }}</strong><span class="muted small">{{ stamp(e.at) }} · {{ e.by }}</span></div>
                        @if (detail(e); as d) { <div class="muted small">{{ d }}</div> }
                      </li>
                    }
                  </ol>
                  @if (evMeta().pages > 1) {
                    <div class="row" style="margin-top: 12px; justify-content: space-between">
                      <button class="btn btn-secondary btn-sm" [disabled]="evMeta().page <= 1" (click)="loadHistory(evMeta().page - 1)">Newer</button>
                      <span class="muted small">Page {{ evMeta().page }} of {{ evMeta().pages }}</span>
                      <button class="btn btn-secondary btn-sm" [disabled]="evMeta().page >= evMeta().pages" (click)="loadHistory(evMeta().page + 1)">Older</button>
                    </div>
                  }
                }
              }
              @case ('access') {
                @if (s.entitlements; as en) {
                  <p class="muted small" style="margin-bottom: 10px">
                    A page works only if <strong>your switch is on</strong> and <strong>the plan includes it</strong> and the subscription is active. A plan never turns on anything you switched off, and it never changes your switches.
                  </p>
                  <div class="table-wrap">
                    <table class="table">
                      <thead><tr><th>Page or button</th><th>Your switch</th><th>Plan</th><th>Result</th></tr></thead>
                      <tbody>
                        @for (f of en.features; track f.key) {
                          <tr>
                            <td>{{ featureLabel(f.key) }}</td>
                            <td>{{ f.manual ? 'On' : 'Off' }}</td>
                            <td>{{ f.plan === null ? '–' : f.plan ? 'Included' : 'Not included' }}</td>
                            <td><span class="badge" [class.badge-paid]="f.effective" [class.badge-void]="!f.effective">{{ f.effective ? 'Available' : 'Not available' }}</span> @if (!f.effective) { <span class="muted small">{{ why(f.manual, f.plan, en.mode) }}</span> }</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <h3 class="sec">Usage against the plan’s limits</h3>
                  <ul class="limits">
                    @for (l of en.limits; track l.key) {
                      <li><span class="grow">{{ l.label }}</span><span class="num">{{ l.used }} of {{ l.limit === null ? 'no limit' : l.limit }}</span></li>
                    }
                  </ul>
                  @if (!en.limitsEnforced) { <p class="hint">Limits are only applied while the subscription is active.</p> }
                }
              }
            }
          </div>
        }
      }
    </section>

    @if (dialog(); as kind) {
      @if (meta(); as m) {
        <app-modal [title]="titles[kind]" [wide]="kind === 'assign' || kind === 'change' || kind === 'record' || kind === 'renew' || kind === 'activate'" (closed)="dialog.set(null)">
          <form id="sub-form" (submit)="$event.preventDefault(); submit()" class="stack" novalidate>
            @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }

            @switch (kind) {
              @case ('assign') {
                <p class="muted small">This parlour keeps working as it does today until the subscription is active. Choose whether to start it now or leave it pending until the payment is in.</p>
                <div class="form-grid">
                  <div class="field" [class.invalid]="fieldErrors()['planId']">
                    <label class="label" for="sf-plan">Plan</label>
                    <select id="sf-plan" class="select" (change)="setPlan($any($event.target).value)">
                      <option value="" [selected]="!planId()">Choose a plan</option>
                      @for (p of plans(); track p.id) { <option [value]="p.id" [selected]="planId() === p.id">{{ p.name }} · {{ p.monthlyPrice | money }}/month</option> }
                    </select>
                    @if (fieldErrors()['planId']; as e) { <span class="field-error">{{ e }}</span> }
                  </div>
                  <div class="field" [class.invalid]="fieldErrors()['billingCycle']">
                    <label class="label" for="sf-cycle">Billing</label>
                    <select id="sf-cycle" class="select" (change)="setCycle($any($event.target).value)">
                      <option value="monthly" [selected]="cycleValue() === 'monthly'">Monthly</option>
                      <option value="yearly" [selected]="cycleValue() === 'yearly'" [disabled]="!yearlyOffered()">Yearly{{ yearlyOffered() ? '' : ' (not offered)' }}</option>
                    </select>
                    @if (fieldErrors()['billingCycle']; as e) { <span class="field-error">{{ e }}</span> }
                  </div>
                </div>
                @if (chosenPrice() !== null) { <p>Price: <strong>{{ chosenPrice() | money }}</strong> {{ cycleValue() === 'yearly' ? 'a year' : 'a month' }}.</p> }
                <label class="check"><input type="checkbox" [checked]="startNow()" (change)="startNow.set($any($event.target).checked)" /> <span>Start it now (active from {{ startNow() && startDate() ? date(startDate()) : 'today' }}). Leave unticked to keep it pending until you activate it.</span></label>
                @if (startNow()) {
                  <div class="field" [class.invalid]="fieldErrors()['startDate']">
                    <label class="label" for="sf-start">Start date</label>
                    <input id="sf-start" class="input" type="date" [max]="today" [value]="startDate()" (input)="startDate.set($any($event.target).value)" />
                    @if (fieldErrors()['startDate']; as e) { <span class="field-error">{{ e }}</span> } @else { <span class="hint">Today, or a recent day if they paid earlier.</span> }
                  </div>
                }
                <app-payment-fields [(draft)]="pay" [meta]="m" [errors]="payErrors()" />
              }

              @case ('activate') {
                <p>Starts <strong>{{ sub()?.plan?.name }}</strong> for one {{ sub()?.billingCycle === 'yearly' ? 'year' : 'month' }}. The parlour gets what its plan includes from this moment.</p>
                <div class="field" [class.invalid]="fieldErrors()['startDate']">
                  <label class="label" for="sf-start">Start date</label>
                  <input id="sf-start" class="input" type="date" [max]="today" [value]="startDate()" (input)="startDate.set($any($event.target).value)" />
                  @if (fieldErrors()['startDate']; as e) { <span class="field-error">{{ e }}</span> }
                </div>
                <app-payment-fields [(draft)]="pay" [meta]="m" [errors]="payErrors()" />
              }

              @case ('renew') {
                @if (sub()?.status === 'expired') {
                  <p>This subscription has ended, so renewing starts a new period from the date below.</p>
                  <div class="field" [class.invalid]="fieldErrors()['startDate']">
                    <label class="label" for="sf-start">New period starts</label>
                    <input id="sf-start" class="input" type="date" [max]="today" [value]="startDate()" (input)="startDate.set($any($event.target).value)" />
                    @if (fieldErrors()['startDate']; as e) { <span class="field-error">{{ e }}</span> }
                  </div>
                } @else {
                  <p>Adds one {{ sub()?.billingCycle === 'yearly' ? 'year' : 'month' }} after the current expiry date ({{ date(sub()?.expiresOn) }}), so no paid time is lost. The price becomes the plan’s price today: <strong>{{ sub()?.renewalPrice | money }}</strong>.</p>
                }
                <app-payment-fields [(draft)]="pay" [meta]="m" [errors]="payErrors()" />
              }

              @case ('change') {
                <p class="muted small">Moves the parlour to another plan now. The expiry date stays as it is unless you set a new one. Nothing is worked out pro rata: if money changes hands for the difference, record it below.</p>
                <div class="form-grid">
                  <div class="field" [class.invalid]="fieldErrors()['planId']">
                    <label class="label" for="sf-plan">New plan</label>
                    <select id="sf-plan" class="select" (change)="setPlan($any($event.target).value)">
                      @for (p of plans(); track p.id) { <option [value]="p.id" [selected]="planId() === p.id">{{ p.name }} · {{ p.monthlyPrice | money }}/month{{ p.id === sub()?.plan?.id ? ' (current)' : '' }}</option> }
                    </select>
                    @if (fieldErrors()['planId']; as e) { <span class="field-error">{{ e }}</span> }
                  </div>
                  <div class="field" [class.invalid]="fieldErrors()['billingCycle']">
                    <label class="label" for="sf-cycle">Billing</label>
                    <select id="sf-cycle" class="select" (change)="setCycle($any($event.target).value)">
                      <option value="monthly" [selected]="cycleValue() === 'monthly'">Monthly</option>
                      <option value="yearly" [selected]="cycleValue() === 'yearly'" [disabled]="!yearlyOffered()">Yearly{{ yearlyOffered() ? '' : ' (not offered)' }}</option>
                    </select>
                    @if (fieldErrors()['billingCycle']; as e) { <span class="field-error">{{ e }}</span> }
                  </div>
                </div>
                @if (chosenPrice() !== null) { <p>New price: <strong>{{ chosenPrice() | money }}</strong> {{ cycleValue() === 'yearly' ? 'a year' : 'a month' }}.</p> }
                @if (sub()?.status !== 'expired') {
                  <div class="field" [class.invalid]="fieldErrors()['expiresOn']">
                    <label class="label" for="sf-exp">New expiry date (optional)</label>
                    <input id="sf-exp" class="input" type="date" [value]="expiresOn()" (input)="expiresOn.set($any($event.target).value)" />
                    @if (fieldErrors()['expiresOn']; as e) { <span class="field-error">{{ e }}</span> } @else { <span class="hint">Leave empty to keep {{ date(sub()?.expiresOn) }}.</span> }
                  </div>
                }
                <app-payment-fields [(draft)]="pay" [meta]="m" [errors]="payErrors()" />
              }

              @case ('suspend') {
                <p>The parlour keeps its data but loses the plan’s pages until you reactivate it: it can only bill and open its subscription page. Its dates are kept as they are.</p>
                <div class="field" [class.invalid]="fieldErrors()['reason']">
                  <label class="label" for="sf-reason">Reason (for your records)</label>
                  <input id="sf-reason" class="input" maxlength="300" autocomplete="off" [value]="reason()" (input)="reason.set($any($event.target).value)" />
                  @if (fieldErrors()['reason']; as e) { <span class="field-error">{{ e }}</span> }
                </div>
              }

              @case ('reactivate') {
                <p>Puts the subscription back to {{ sub()?.suspendedFrom === 'pending' ? 'pending' : 'active' }}. The time it was suspended is not added to the expiry date ({{ date(sub()?.expiresOn) }}).</p>
                <div class="field">
                  <label class="label" for="sf-note">Note (optional)</label>
                  <input id="sf-note" class="input" maxlength="300" autocomplete="off" [value]="note()" (input)="note.set($any($event.target).value)" />
                </div>
              }

              @case ('remove') {
                <div class="form-alert">This takes the plan off <strong>{{ sub()?.parlourName }}</strong>, which then goes back to running without a plan, and deletes the subscription’s history. It is for a plan given by mistake. It is refused once any payment has been recorded; suspend the subscription instead.</div>
              }

              @case ('record') {
                <p class="muted small">Writes down money <strong>{{ sub()?.parlourName }}</strong> paid you for ParlourBill. It does not change the subscription: use Renew or Activate to do that and record the payment in the same step.</p>
                <app-payment-fields [(draft)]="pay" [meta]="m" [errors]="payErrors()" [optional]="false" />
              }
            }
          </form>
          <ng-container modal-foot>
            <button type="button" class="btn btn-secondary" (click)="dialog.set(null)">Cancel</button>
            <button type="submit" form="sub-form" class="btn" [class.btn-danger]="kind === 'remove' || kind === 'suspend'" [class.btn-primary]="kind !== 'remove' && kind !== 'suspend'" [disabled]="busy()">{{ busy() ? 'Saving…' : confirmLabels[kind] }}</button>
          </ng-container>
        </app-modal>
      }
    }

    @if (settling(); as st) {
      @if (meta(); as m) {
        <app-payment-status-dialog [payment]="st.payment" [target]="st.target" [meta]="m" (cancelled)="settling.set(null)" (saved)="settling.set(null); afterChange()" />
      }
    }`,
  styles: [`
    .empty-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; justify-content: space-between; }
    .empty-sub p { margin: 0; flex: 1 1 320px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px 24px; }
    .facts .k { color: var(--muted); font-size: 13px; }
    .facts .v { font-weight: 650; font-size: 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .warn { color: var(--amber); font-weight: 600; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .danger-text { color: var(--brick); }
    .tabs-bar { padding: 0 20px 12px; }
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline li { padding: 10px 0; border-top: 1px solid var(--line); &:first-child { border-top: 0; } }
    .t-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; justify-content: space-between; }
    .sec { font-size: 15px; margin: 18px 0 6px; }
    .limits { list-style: none; margin: 0; padding: 0; }
    .limits li { display: flex; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); &:first-child { border-top: 0; } }
    .check { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; cursor: pointer; }
    .check input { margin-top: 3px; }
  `],
})
export class ParlourSubscriptionComponent implements OnInit {
  private readonly api = inject(SubscriptionsApi);
  private readonly toast = inject(ToastService);
  private readonly moneyPipe = new MoneyPipe();

  readonly parlourId = input.required<string>();

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly cycle = CYCLE_LABEL;
  protected readonly methods = METHOD_LABEL;
  protected readonly payLabel = PAYMENT_STATUS_LABEL;
  protected readonly eventLabel = EVENT_LABEL;
  protected readonly badge = statusBadge;
  protected readonly payBadge = paymentBadge;
  protected readonly remaining = remainingText;
  protected readonly date = formatDate;
  protected readonly today = todayIso();
  protected readonly titles: Record<DialogKind, string> = {
    assign: 'Give a plan', activate: 'Activate subscription', renew: 'Renew subscription', change: 'Change plan', suspend: 'Suspend subscription',
    reactivate: 'Reactivate subscription', remove: 'Remove subscription', record: 'Record a payment',
  };
  protected readonly confirmLabels: Record<DialogKind, string> = {
    assign: 'Give plan', activate: 'Activate', renew: 'Renew', change: 'Change plan', suspend: 'Suspend', reactivate: 'Reactivate', remove: 'Remove subscription', record: 'Record payment',
  };

  protected readonly sub = signal<ParlourSubscription | null>(null);
  protected readonly meta = signal<SubscriptionMeta | null>(null);
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly ready = computed(() => !!this.meta() && this.plans().length > 0);

  protected readonly tab = signal<Tab>('payments');
  protected readonly listLoading = signal(false);
  protected readonly payments = signal<SubscriptionPayment[]>([]);
  protected readonly payMeta = signal<PageMeta>({ page: 1, limit: 10, total: 0, pages: 1 });
  protected readonly events = signal<SubscriptionEvent[]>([]);
  protected readonly evMeta = signal<PageMeta>({ page: 1, limit: 10, total: 0, pages: 1 });

  protected readonly actions = computed(() => (this.sub() ? actionsFor(this.sub()!.status) : []));
  protected readonly settling = signal<{ payment: SubscriptionPayment; target: PayTarget } | null>(null);

  // ── The dialog ──────────────────────────────────────────────────
  protected readonly dialog = signal<DialogKind | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly payErrors = signal<Record<string, string>>({});
  protected readonly planId = signal('');
  protected readonly cycleValue = signal<BillingCycle>('monthly');
  protected readonly startNow = signal(false);
  protected readonly startDate = signal('');
  protected readonly expiresOn = signal('');
  protected readonly reason = signal('');
  protected readonly note = signal('');
  protected readonly pay = signal<PaymentDraft>(emptyPaymentDraft());

  protected readonly chosenPlan = computed(() => this.plans().find((p) => p.id === this.planId()) ?? null);
  protected readonly yearlyOffered = computed(() => this.chosenPlan()?.yearlyPrice !== null && this.chosenPlan() !== null);
  protected readonly chosenPrice = computed(() => {
    const p = this.chosenPlan();
    if (!p) return null;
    return this.cycleValue() === 'yearly' ? p.yearlyPrice : p.monthlyPrice;
  });

  // The parlour id arrives as an input, so loading waits for it.
  ngOnInit() { this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ sub: this.api.get(this.parlourId()), meta: this.api.meta(), plans: this.api.plans(true) }).subscribe({
      next: ({ sub, meta, plans }) => {
        this.sub.set(sub);
        this.meta.set(meta);
        this.plans.set(plans);
        this.loading.set(false);
        if (sub) this.loadTab();
      },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected setTab(t: Tab) { this.tab.set(t); this.loadTab(); }
  private loadTab() {
    if (this.tab() === 'payments') this.loadPayments(1);
    else if (this.tab() === 'history') this.loadHistory(1);
  }
  protected loadPayments(page: number) {
    this.listLoading.set(true);
    this.api.payments(this.parlourId(), page, 10).subscribe({
      next: (r) => { this.payments.set(r.items); this.payMeta.set(r.meta); this.listLoading.set(false); },
      error: (e) => { this.listLoading.set(false); this.toast.error(parseError(e).message); },
    });
  }
  protected loadHistory(page: number) {
    this.listLoading.set(true);
    this.api.history(this.parlourId(), page, 10).subscribe({
      next: (r) => { this.events.set(r.items); this.evMeta.set(r.meta); this.listLoading.set(false); },
      error: (e) => { this.listLoading.set(false); this.toast.error(parseError(e).message); },
    });
  }

  protected nextFor(p: SubscriptionPayment): PayTarget[] {
    return (this.meta()?.paymentTransitions[p.status] ?? []).filter((t): t is PayTarget => t !== 'pending');
  }
  protected settle(payment: SubscriptionPayment, target: PayTarget) { this.settling.set({ payment, target }); }
  protected featureLabel(key: string) { return this.meta()?.features.find((f) => f.key === key)?.label ?? key; }
  protected why(manual: boolean, plan: boolean | null, mode: 'unmanaged' | 'plan' | 'lapsed') {
    if (!manual) return 'Switched off by you above.';
    if (mode === 'lapsed') return 'The subscription is not active.';
    if (plan === false) return 'Not in the plan.';
    return '';
  }
  protected detail(e: SubscriptionEvent) { return eventDetail(e, (n) => this.moneyPipe.transform(n, true)); }
  protected stamp(iso: string) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // ── Opening a dialog with sensible starting values ──────────────

  protected open(kind: DialogKind) {
    this.formError.set('');
    this.fieldErrors.set({});
    this.payErrors.set({});
    this.reason.set('');
    this.note.set('');
    this.expiresOn.set('');
    this.startNow.set(false);
    const s = this.sub();
    this.startDate.set(todayIso());

    if (kind === 'assign') {
      const first = this.plans()[0];
      this.planId.set(first?.id ?? '');
      this.cycleValue.set('monthly');
      this.startDate.set(todayIso());
      this.pay.set(emptyPaymentDraft(first?.monthlyPrice ?? 0));
    } else if (kind === 'change' && s) {
      this.planId.set(this.plans().find((p) => p.id !== s.plan.id)?.id ?? s.plan.id);
      this.cycleValue.set(s.billingCycle);
      this.pay.set(emptyPaymentDraft(this.chosenPrice() ?? s.renewalPrice));
    } else if (kind === 'record') {
      this.pay.set({ ...emptyPaymentDraft(s?.renewalPrice ?? 0), include: true });
    } else {
      this.pay.set(emptyPaymentDraft(kind === 'activate' ? (s?.price ?? 0) : (s?.renewalPrice ?? 0)));
    }
    this.dialog.set(kind);
  }

  protected setPlan(id: string) {
    this.planId.set(id);
    if (!this.yearlyOffered() && this.cycleValue() === 'yearly') this.cycleValue.set('monthly');
    this.suggestAmount();
  }
  protected setCycle(c: BillingCycle) { this.cycleValue.set(c); this.suggestAmount(); }
  /** The amount box follows the price of what was chosen, until someone types in it. */
  private suggestAmount() {
    const price = this.chosenPrice();
    if (price !== null) this.pay.update((d) => ({ ...d, amount: String(price) }));
  }

  // ── Doing it ────────────────────────────────────────────────────

  /** The payment typed in the dialog: undefined when none is being recorded, null when it is not valid yet (the reasons are shown). */
  private paymentBody(): PaymentInput | undefined | null {
    const d = this.pay();
    if (!d.include) return undefined;
    const r = paymentFromDraft(d, this.meta()?.referenceRequiredMethods ?? []);
    if ('errors' in r) { this.payErrors.set(r.errors); return null; }
    this.payErrors.set({});
    return r.input;
  }

  protected submit() {
    const kind = this.dialog();
    if (!kind) return;
    this.formError.set('');
    this.fieldErrors.set({});
    const id = this.parlourId();
    const s = this.sub();

    const usesPayment = kind === 'assign' || kind === 'activate' || kind === 'renew' || kind === 'change' || kind === 'record';
    const payment = usesPayment ? this.paymentBody() : undefined;
    if (payment === null) return;
    const withPayment = payment ? { payment } : {};

    switch (kind) {
      case 'assign':
        if (!this.planId()) { this.fieldErrors.set({ planId: 'Choose a plan' }); return; }
        return this.run(this.api.assign(id, {
          planId: this.planId(), billingCycle: this.cycleValue(), startNow: this.startNow(),
          ...(this.startNow() && this.startDate() ? { startDate: this.startDate() } : {}), ...withPayment,
        }), 'Plan given. It is pending until you activate it.', (sub) => (sub.status === 'active' ? 'Plan given and started.' : 'Plan given. It is pending until you activate it.'));
      case 'activate':
        return this.run(this.api.activate(id, { ...(this.startDate() ? { startDate: this.startDate() } : {}), ...withPayment }), 'Subscription activated.');
      case 'renew':
        return this.run(this.api.renew(id, { ...(s?.status === 'expired' && this.startDate() ? { startDate: this.startDate() } : {}), ...withPayment }), 'Subscription renewed.');
      case 'change':
        return this.run(this.api.changePlan(id, {
          planId: this.planId(), billingCycle: this.cycleValue(), ...(this.expiresOn() ? { expiresOn: this.expiresOn() } : {}), ...withPayment,
        }), 'Plan changed.', (sub) => (sub.change ? `Plan changed: ${sub.change.direction} from ${sub.change.from} to ${sub.change.to}.` : 'Plan changed.'));
      case 'suspend':
        if (this.reason().trim().length < 3) { this.fieldErrors.set({ reason: 'Say why, for your records' }); return; }
        return this.run(this.api.suspend(id, this.reason().trim()), 'Subscription suspended.');
      case 'reactivate':
        return this.run(this.api.reactivate(id, this.note().trim() || undefined), 'Subscription reactivated.');
      case 'remove':
        this.busy.set(true);
        this.api.remove(id).subscribe({
          next: () => { this.busy.set(false); this.dialog.set(null); this.toast.success('Subscription removed.'); this.sub.set(null); this.payments.set([]); this.events.set([]); },
          error: (e) => this.fail(e),
        });
        return;
      case 'record':
        this.busy.set(true);
        this.api.recordPayment(id, payment as PaymentInput).subscribe({
          next: () => { this.busy.set(false); this.dialog.set(null); this.toast.success('Payment recorded.'); this.afterChange(); },
          error: (e) => this.fail(e),
        });
        return;
    }
  }

  private run(call: ReturnType<SubscriptionsApi['assign']>, message: string, message2?: (s: ParlourSubscription) => string) {
    this.busy.set(true);
    call.subscribe({
      next: (sub) => {
        this.busy.set(false);
        this.dialog.set(null);
        this.sub.set(sub);
        this.toast.success(message2 ? message2(sub) : message);
        this.afterChange();
      },
      error: (e) => this.fail(e),
    });
  }

  /** Puts the server's reasons where they belong: payment fields under the payment form, the rest on their own fields, anything else on top. */
  private fail(e: unknown) {
    this.busy.set(false);
    const info = parseError(e);
    const pay: Record<string, string> = {};
    const other: Record<string, string> = {};
    for (const [k, v] of Object.entries(info.fields)) {
      const key = k.startsWith('payment.') ? k.slice('payment.'.length) : k;
      (PAYMENT_FIELDS.includes(key) ? pay : other)[key] = v;
    }
    this.payErrors.set(pay);
    this.fieldErrors.set(other);
    if (!Object.keys(pay).length && !Object.keys(other).length) this.formError.set(info.message);
  }

  /** After anything changed: show the latest of everything. */
  protected afterChange() {
    this.api.get(this.parlourId()).subscribe({
      next: (sub) => { this.sub.set(sub); if (sub) this.loadTab(); },
      error: (e) => this.toast.error(parseError(e).message),
    });
  }
}
