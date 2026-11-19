import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { parseError } from '../../core/errors';
import { PageMeta } from '../../core/models';
import {
  CYCLE_LABEL, METHOD_LABEL, PAYMENT_STATUS_LABEL, SubscriptionMeta, SubscriptionPayment, SubscriptionPaymentStatus, SubscriptionsApi, paymentBadge,
} from '../../core/subscriptions';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { PaymentStatusDialogComponent } from './payment-status-dialog.component';

/**
 * Every subscription payment across all parlours: money PARLOURS paid YOU for ParlourBill, entered by hand. Not the bills a parlour raised for
 * its own customers. Use it mainly to chase what is still pending and to settle it.
 */
@Component({
  selector: 'app-plan-payments',
  imports: [FormsModule, RouterLink, DatePipe, IconComponent, MoneyPipe, PaymentStatusDialogComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Plan payments</h1>
          <p class="sub">Money parlours pay you for ParlourBill, recorded by hand. This is not the bills a parlour makes for its own customers. Record a payment from the parlour’s page.</p>
        </div>
      </div>

      <div class="toolbar">
        <select class="select" aria-label="Status" [ngModel]="status()" (ngModelChange)="setStatus($event)">
          <option value="">All statuses</option>
          @for (s of statuses; track s) { <option [value]="s">{{ statusLabel[s] }}</option> }
        </select>
        <select class="select" aria-label="Method" [ngModel]="method()" (ngModelChange)="setMethod($event)">
          <option value="">All methods</option>
          @for (m of meta()?.paymentMethods ?? []; track m) { <option [value]="m">{{ methodLabel[m] }}</option> }
        </select>
        <label class="inline"><span class="muted small">From</span> <input class="input" type="date" aria-label="From date" [ngModel]="from()" (ngModelChange)="setFrom($event)" /></label>
        <label class="inline"><span class="muted small">To</span> <input class="input" type="date" aria-label="To date" [ngModel]="to()" (ngModelChange)="setTo($event)" /></label>
        @if (filtered()) { <button type="button" class="btn btn-ghost btn-sm" (click)="clear()">Clear filters</button> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 260px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load payments</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          @if (filtered()) { <h3>No payment matches</h3><p>Try a different status or dates.</p> }
          @else { <h3>No payments recorded yet</h3><p>When a parlour pays for its subscription, open the parlour and record the payment.</p> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Date</th><th>Parlour</th><th>Plan</th><th>Method</th><th>Reference</th><th class="num">Amount</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (p of items(); track p.id) {
                <tr>
                  <td class="nowrap">{{ p.paymentDate | date: 'd MMM y' }}</td>
                  <td><a [routerLink]="['/superadmin/parlours', p.parlourId]"><strong>{{ p.parlourName }}</strong></a></td>
                  <td>{{ p.planName }}<div class="muted small">{{ cycleLabel[p.billingCycle] }}</div></td>
                  <td>{{ methodLabel[p.method] }}</td>
                  <td>{{ p.reference ?? '' }}@if (!p.reference) { <span class="muted">None</span> }</td>
                  <td class="num">{{ p.amount | money: true }}</td>
                  <td><span class="badge" [class]="badge(p.status)">{{ statusLabel[p.status] }}</span></td>
                  <td class="cell-actions">
                    @for (t of next(p); track t) {
                      <button type="button" class="btn btn-secondary btn-sm" (click)="act(p, t)">{{ t === 'paid' ? 'Mark received' : t === 'failed' ? 'Mark failed' : 'Mark refunded' }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="table-foot">
            <span>{{ meta2().total }} payment{{ meta2().total === 1 ? '' : 's' }}</span>
            <span class="row">
              <button class="btn btn-secondary btn-sm" [disabled]="meta2().page <= 1" (click)="go(meta2().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
              <span>Page {{ meta2().page }} of {{ meta2().pages }}</span>
              <button class="btn btn-secondary btn-sm" [disabled]="meta2().page >= meta2().pages" (click)="go(meta2().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
            </span>
          </div>
        </div>
      }
    </div>

    @if (dialog(); as d) {
      @if (meta(); as m) {
        <app-payment-status-dialog [payment]="d.payment" [target]="d.target" [meta]="m" (cancelled)="dialog.set(null)" (saved)="dialog.set(null); load()" />
      }
    }`,
  styles: [`
    .inline { display: inline-flex; align-items: center; gap: 8px; }
    .inline .input { width: auto; }
    .toolbar .select { width: auto; min-width: 150px; }
  `],
})
export class PlanPaymentsComponent {
  private readonly api = inject(SubscriptionsApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly statuses: SubscriptionPaymentStatus[] = ['pending', 'paid', 'failed', 'refunded'];
  protected readonly statusLabel = PAYMENT_STATUS_LABEL;
  protected readonly methodLabel = METHOD_LABEL;
  protected readonly cycleLabel = CYCLE_LABEL;
  protected readonly badge = paymentBadge;

  protected readonly meta = signal<SubscriptionMeta | null>(null);
  protected readonly items = signal<SubscriptionPayment[]>([]);
  // `meta` is the form options; the page numbers are `meta2`.
  protected readonly meta2 = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly status = signal<SubscriptionPaymentStatus | ''>('');
  protected readonly method = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly dialog = signal<{ payment: SubscriptionPayment; target: 'paid' | 'failed' | 'refunded' } | null>(null);

  constructor() {
    // The overview links here with ?status=pending.
    const q = this.route.snapshot.queryParamMap.get('status');
    if (q && (this.statuses as string[]).includes(q)) this.status.set(q as SubscriptionPaymentStatus);
    this.api.meta().subscribe({ next: (m) => this.meta.set(m), error: () => undefined });
    this.load();
  }

  protected filtered() { return !!(this.status() || this.method() || this.from() || this.to()); }
  protected setStatus(v: SubscriptionPaymentStatus | '') { this.status.set(v); this.go(1); }
  protected setMethod(v: string) { this.method.set(v); this.go(1); }
  protected setFrom(v: string) { this.from.set(v); this.go(1); }
  protected setTo(v: string) { this.to.set(v); this.go(1); }
  protected clear() { this.status.set(''); this.method.set(''); this.from.set(''); this.to.set(''); this.go(1); }
  protected go(page: number) { this.meta2.update((m) => ({ ...m, page })); this.load(); }

  /** Where this payment can go next, from the server's own list of moves. */
  protected next(p: SubscriptionPayment): ('paid' | 'failed' | 'refunded')[] {
    return (this.meta()?.paymentTransitions[p.status] ?? []).filter((t): t is 'paid' | 'failed' | 'refunded' => t !== 'pending');
  }
  protected act(payment: SubscriptionPayment, target: 'paid' | 'failed' | 'refunded') { this.dialog.set({ payment, target }); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.allPayments({
      status: this.status() || undefined,
      method: (this.method() || undefined) as SubscriptionPayment['method'] | undefined,
      from: this.from() || undefined,
      to: this.to() || undefined,
      page: this.meta2().page,
      limit: 20,
    }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta2.set(r.meta); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }
}
