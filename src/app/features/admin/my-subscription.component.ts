import { Component, computed, inject, signal } from '@angular/core';
import { parseError } from '../../core/errors';
import { PageMeta } from '../../core/models';
import {
  CYCLE_LABEL, METHOD_LABEL, OwnSubscription, OwnSubscriptionApi, OwnSubscriptionPayment, PAYMENT_STATUS_LABEL, STATUS_LABEL, formatDate, paymentBadge,
  remainingText, statusBadge,
} from '../../core/subscriptions';
import { MoneyPipe } from '../../shared/money.pipe';

/**
 * The parlour admin's own subscription, read only: which plan, when it started and ends, how many days are left, what comes next, what the plan
 * includes, how much of each limit is used, and the payment history. It is never behind a feature switch or a plan: a parlour whose subscription
 * has ended can still open this page to see how to renew.
 * Renewing and payments are done by the provider (the platform admin), who records them by hand. Nothing is charged here and nothing renews itself.
 * The server decides which parlour this is from the signed-in user; staff cannot reach this page at all.
 */
@Component({
  selector: 'app-my-subscription',
  imports: [MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>My subscription</h1><p class="sub">Your plan, when it ends and what it includes.</p></div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 220px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load your subscription</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else {
        @if (data(); as d) {
          @if (!d.managed || !d.subscription) {
            <div class="panel empty">
              <h3>You are not on a plan</h3>
              <p>Your parlour is not on a subscription plan. Every page your provider has switched on is available to you, with no plan limits.</p>
            </div>
          } @else {
            @if (d.subscription.status !== 'active') {
              <div class="form-alert" role="alert" style="margin-bottom: 16px">
                @if (d.subscription.status === 'pending') { Your subscription has not been activated yet. Until it is, only billing and this page are available. }
                @else if (d.subscription.status === 'expired') { Your subscription ended on {{ date(d.subscription.expiresOn) }}. Until it is renewed, only billing and this page are available. }
                @else { Your subscription is suspended. Until it is reactivated, only billing and this page are available. }
                Your bills and customers’ records are safe and nothing has been deleted. Contact your provider to sort it out.
              </div>
            } @else if (d.subscription.expiringSoon) {
              <div class="form-alert warn-alert" role="status" style="margin-bottom: 16px">Your subscription ends {{ d.subscription.daysRemaining === 0 ? 'today' : d.subscription.daysRemaining === 1 ? 'tomorrow' : 'in ' + d.subscription.daysRemaining + ' days' }} ({{ date(d.subscription.expiresOn) }}). Contact your provider to renew it so nothing is switched off.</div>
            }

            <div class="ledger" style="margin-bottom: 24px">
              <div class="ledger-item"><div class="k">Current plan</div><div class="v">{{ d.plan?.name }}</div><div class="s">{{ cycle[d.subscription.billingCycle] }} · {{ d.subscription.price | money }} {{ d.subscription.billingCycle === 'yearly' ? 'a year' : 'a month' }}</div></div>
              <div class="ledger-item"><div class="k">Status</div><div class="v"><span class="badge" [class]="badge(d.subscription.status)">{{ statusLabel[d.subscription.status] }}</span></div><div class="s">{{ remaining(d.subscription) }}</div></div>
              <div class="ledger-item"><div class="k">Started</div><div class="v small-v">{{ date(d.subscription.startsOn) }}</div></div>
              <div class="ledger-item"><div class="k">Expires</div><div class="v small-v">{{ date(d.subscription.expiresOn) }}</div><div class="s" [class.warn]="d.subscription.expiringSoon || d.subscription.status === 'expired'">{{ d.subscription.status === 'active' ? (d.subscription.daysRemaining ?? 0) + ' day' + (d.subscription.daysRemaining === 1 ? '' : 's') + ' remaining' : remaining(d.subscription) }}</div></div>
            </div>

            <div class="cols">
              <div class="stack">
                @if (d.plan?.description) { <section class="panel"><div class="panel-body"><p style="margin: 0">{{ d.plan?.description }}</p></div></section> }

                <section class="panel">
                  <div class="panel-head"><h2>Renewal</h2></div>
                  <div class="panel-body stack-sm">
                    @if (d.renewal; as r) {
                      <div class="kv"><span class="muted">Next renewal due</span><strong>{{ date(r.dueOn) }}</strong></div>
                      <div class="kv"><span class="muted">Amount for the next {{ r.billingCycle === 'yearly' ? 'year' : 'month' }}</span><strong>{{ r.amount | money }}</strong></div>
                      <div class="kv"><span class="muted">Renews automatically</span><strong>No</strong></div>
                      <p class="hint">Your provider renews your subscription after you pay them, and records the payment. Nothing is charged here and nothing renews by itself.</p>
                    }
                    @if (d.pendingPayments.count > 0) {
                      <div class="kv"><span class="muted">Payments still expected</span><strong>{{ d.pendingPayments.count }} · {{ d.pendingPayments.amount | money }}</strong></div>
                    }
                    @if (d.lastPayment; as lp) {
                      <div class="kv"><span class="muted">Last payment received</span><strong>{{ lp.amount | money: true }} on {{ date(lp.paymentDate) }}</strong></div>
                    }
                  </div>
                </section>

                <section class="panel">
                  <div class="panel-head"><h2>Payment history</h2></div>
                  <div class="panel-body">
                    <p class="muted small" style="margin-bottom: 10px">What you have paid for your subscription. This is not the bills you make for your customers.</p>
                    @if (payLoading()) { <div class="skeleton" style="height: 80px"></div> }
                    @else if (payments().length === 0) { <p class="muted">No payments recorded yet.</p> }
                    @else {
                      <div class="table-wrap">
                        <table class="table">
                          <thead><tr><th>Date</th><th>For</th><th>Method</th><th>Reference</th><th class="num">Amount</th><th>Status</th></tr></thead>
                          <tbody>
                            @for (p of payments(); track p.id) {
                              <tr>
                                <td class="nowrap">{{ date(p.paymentDate) }}</td>
                                <td>{{ p.planName }}<div class="muted small">@if (p.periodStart && p.periodEnd) { {{ date(p.periodStart) }} – {{ date(p.periodEnd) }} } @else { {{ cycle[p.billingCycle] }} }</div></td>
                                <td>{{ methods[p.method] }}</td>
                                <td>{{ p.reference }}@if (!p.reference) { <span class="muted">None</span> }</td>
                                <td class="num">{{ p.amount | money: true }}</td>
                                <td><span class="badge" [class]="payBadge(p.status)">{{ payLabel[p.status] }}</span></td>
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
                  </div>
                </section>
              </div>

              <div class="stack">
                <section class="panel">
                  <div class="panel-head"><h2>Limits</h2></div>
                  <div class="panel-body">
                    <ul class="plain">
                      @for (l of d.limits; track l.key) {
                        <li>
                          <div class="kv"><span>{{ l.label }}</span><strong>{{ l.used }} of {{ l.limit === null ? 'no limit' : l.limit }}</strong></div>
                          @if (l.limit !== null) { <div class="bar" role="img" [attr.aria-label]="l.used + ' of ' + l.limit + ' used'"><span [style.width.%]="percent(l.used, l.limit)" [class.full]="l.used >= l.limit"></span></div> }
                        </li>
                      }
                    </ul>
                    @if (!enforced()) { <p class="hint">Limits only apply while your subscription is active.</p> }
                  </div>
                </section>

                <section class="panel">
                  <div class="panel-head"><h2>What your plan includes</h2></div>
                  <div class="panel-body">
                    <ul class="plain">
                      @for (f of d.features; track f.key) {
                        <li class="kv">
                          <span [class.off]="!f.available">{{ f.label }}</span>
                          <span class="state" [class.on]="f.available">{{ f.available ? 'Available' : reasonText(f.reason) }}</span>
                        </li>
                      }
                    </ul>
                  </div>
                </section>
              </div>
            </div>
          }
        }
      }
    </div>`,
  styles: [`
    .cols { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 24px; align-items: start; }
    @media (max-width: 999px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    .small-v { font-size: 20px; }
    .warn { color: var(--amber); font-weight: 600; }
    .warn-alert { background: var(--amber-tint); color: var(--amber); border-color: transparent; }
    .kv { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .plain { list-style: none; margin: 0; padding: 0; }
    .plain li { padding: 8px 0; border-top: 1px solid var(--line); &:first-child { border-top: 0; } }
    .off { color: var(--muted); }
    .state { font-size: 13px; color: var(--muted); font-weight: 600; text-align: right; &.on { color: var(--sage); } }
    .bar { height: 6px; border-radius: 3px; background: var(--sunken); margin-top: 6px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--sage); border-radius: 3px; &.full { background: var(--brick); } }
  `],
})
export class MySubscriptionComponent {
  private readonly api = inject(OwnSubscriptionApi);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly cycle = CYCLE_LABEL;
  protected readonly methods = METHOD_LABEL;
  protected readonly payLabel = PAYMENT_STATUS_LABEL;
  protected readonly badge = statusBadge;
  protected readonly payBadge = paymentBadge;
  protected readonly remaining = remainingText;
  protected readonly date = formatDate;

  protected readonly data = signal<OwnSubscription | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly payLoading = signal(false);
  protected readonly payments = signal<OwnSubscriptionPayment[]>([]);
  protected readonly payMeta = signal<PageMeta>({ page: 1, limit: 10, total: 0, pages: 1 });
  protected readonly enforced = computed(() => this.data()?.limits.some((l) => l.enforced) ?? false);

  constructor() { this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.get().subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); if (d.managed) this.loadPayments(1); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected loadPayments(page: number) {
    this.payLoading.set(true);
    this.api.payments(page, 10).subscribe({
      next: (r) => { this.payments.set(r.items); this.payMeta.set(r.meta); this.payLoading.set(false); },
      error: () => this.payLoading.set(false),
    });
  }

  protected percent(used: number, limit: number) { return Math.min(100, Math.round((used / limit) * 100)); }
  /** Why something the page lists is not available right now, in words the parlour can act on. */
  protected reasonText(reason: 'switched_off' | 'subscription' | 'plan' | null) {
    return reason === 'plan' ? 'Not in your plan' : reason === 'subscription' ? 'Subscription not active' : 'Switched off';
  }
}
