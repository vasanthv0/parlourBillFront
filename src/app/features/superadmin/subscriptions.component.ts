import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { parseError } from '../../core/errors';
import { PageMeta } from '../../core/models';
import {
  CYCLE_LABEL, ParlourSubscription, STATUS_LABEL, SubscriptionDashboard, SubscriptionPlan, SubscriptionStatus, SubscriptionsApi,
  remainingText, statusBadge,
} from '../../core/subscriptions';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';

/**
 * The platform admin's subscription overview: how many parlours are paying, who is about to lapse, what the recurring revenue is, and what money
 * is still expected. Every figure comes from the server. "Expiring soon" is counted from subscriptions that are active today.
 */
@Component({
  selector: 'app-subscriptions',
  imports: [FormsModule, RouterLink, DatePipe, IconComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Subscriptions</h1>
          <p class="sub">Every parlour you have sold a plan to. Open a parlour to give it a plan, renew it, change its plan or record a payment.</p>
        </div>
        <a class="btn btn-secondary" routerLink="/superadmin/plans"><app-icon name="package" /> Manage plans</a>
      </div>

      @if (dash(); as d) {
        <div class="ledger" style="margin-bottom: 12px">
          <div class="ledger-item"><div class="k">Total subscriptions</div><div class="v">{{ d.totalSubscriptions }}</div><div class="s">{{ d.parlourWithoutSubscription }} parlour{{ d.parlourWithoutSubscription === 1 ? '' : 's' }} without one</div></div>
          <div class="ledger-item"><div class="k">Active</div><div class="v">{{ d.byStatus.active }}</div><div class="s">{{ d.activeByCycle.monthly }} monthly · {{ d.activeByCycle.yearly }} yearly</div></div>
          <div class="ledger-item"><div class="k">Expired</div><div class="v">{{ d.byStatus.expired }}</div><div class="s">{{ d.byStatus.pending }} pending · {{ d.byStatus.suspended }} suspended</div></div>
          <div class="ledger-item"><div class="k">Expiring soon</div><div class="v">{{ d.expiringSoon.count }}</div><div class="s">within {{ d.expiringSoon.days }} days</div></div>
        </div>
        <div class="ledger" style="margin-bottom: 24px">
          <div class="ledger-item"><div class="k">Monthly recurring revenue</div><div class="v">{{ d.monthlyRecurringRevenue | money }}</div><div class="s">a yearly plan counts as a twelfth</div></div>
          <div class="ledger-item"><div class="k">Yearly recurring revenue</div><div class="v">{{ d.yearlyRecurringRevenue | money }}</div><div class="s">a monthly plan counts as twelve months</div></div>
          <div class="ledger-item"><div class="k">Pending payments</div><div class="v">{{ d.pendingPayments.count }}</div><div class="s">{{ d.pendingPayments.amount | money }} expected · <a routerLink="/superadmin/plan-payments" [queryParams]="{ status: 'pending' }">see them</a></div></div>
        </div>
        <p class="hint" style="margin: -12px 0 24px">Recurring revenue counts only subscriptions that are active today. Only payments you have recorded as received are ever treated as money in. No payment is collected online.</p>
      } @else if (dashError()) {
        <div class="form-alert" role="alert" style="margin-bottom: 16px">Could not load the totals: {{ dashError() }}</div>
      } @else {
        <div class="skeleton" style="height: 92px; margin-bottom: 24px"></div>
      }

      <div class="toolbar">
        <div class="search input-affix">
          <input class="input" type="search" placeholder="Search by parlour name" aria-label="Search subscriptions" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
          <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
        </div>
        <select class="select" aria-label="Status" [ngModel]="status()" (ngModelChange)="setStatus($event)">
          <option value="">All statuses</option>
          @for (s of statuses; track s) { <option [value]="s">{{ label[s] }}</option> }
        </select>
        <select class="select" aria-label="Plan" [ngModel]="planId()" (ngModelChange)="setPlan($event)">
          <option value="">All plans</option>
          @for (p of plans(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
        <label class="check"><input type="checkbox" [checked]="soon()" (change)="setSoon($any($event.target).checked)" /> <span>Expiring within 7 days</span></label>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 260px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load subscriptions</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          @if (filtered()) { <h3>No subscription matches</h3><p>Try a different status or plan, or clear the search.</p><button class="btn btn-secondary" (click)="clear()">Clear filters</button> }
          @else { <h3>No subscriptions yet</h3><p>Open a parlour and give it a plan. Until then it keeps working exactly as it does today.</p><a class="btn btn-primary" routerLink="/superadmin/parlours">Go to parlours</a> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Parlour</th><th>Plan</th><th>Status</th><th>Started</th><th>Expires</th><th class="num">Price</th><th><span class="sr-only">Manage</span></th></tr></thead>
            <tbody>
              @for (s of items(); track s.id) {
                <tr class="row-link" tabindex="0" (click)="open(s)" (keydown.enter)="open(s)">
                  <td><strong>{{ s.parlourName }}</strong></td>
                  <td>{{ s.plan.name }}<div class="muted small">{{ cycle[s.billingCycle] }}</div></td>
                  <td>
                    <span class="badge" [class]="badge(s.status)">{{ label[s.status] }}</span>
                    <div class="muted small" [class.warn]="s.expiringSoon">{{ remaining(s) }}</div>
                  </td>
                  <td class="nowrap">{{ s.startsOn | date: 'd MMM y' }}</td>
                  <td class="nowrap">{{ s.expiresOn | date: 'd MMM y' }}</td>
                  <td class="num">{{ s.price | money }}<div class="muted small">{{ s.billingCycle === 'yearly' ? 'a year' : 'a month' }}</div></td>
                  <td class="cell-actions"><a class="btn btn-secondary btn-sm" [routerLink]="['/superadmin/parlours', s.parlourId]" (click)="$event.stopPropagation()">Manage</a></td>
                </tr>
              }
            </tbody>
          </table>
          <div class="table-foot">
            <span>{{ meta().total }} subscription{{ meta().total === 1 ? '' : 's' }}</span>
            <span class="row">
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
              <span>Page {{ meta().page }} of {{ meta().pages }}</span>
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
            </span>
          </div>
        </div>
      }
    </div>`,
  styles: [`
    .warn { color: var(--amber); font-weight: 600; }
    .check { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
    .toolbar .select { width: auto; min-width: 150px; }
  `],
})
export class SubscriptionsComponent {
  private readonly api = inject(SubscriptionsApi);
  private readonly router = inject(Router);
  private readonly typed$ = new Subject<string>();

  protected readonly statuses: SubscriptionStatus[] = ['active', 'pending', 'expired', 'suspended'];
  protected readonly label = STATUS_LABEL;
  protected readonly cycle = CYCLE_LABEL;
  protected readonly badge = statusBadge;
  protected readonly remaining = remainingText;

  protected readonly dash = signal<SubscriptionDashboard | null>(null);
  protected readonly dashError = signal('');
  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly items = signal<ParlourSubscription[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly search = signal('');
  protected readonly status = signal<SubscriptionStatus | ''>('');
  protected readonly planId = signal('');
  protected readonly soon = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    this.typed$.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.go(1));
    this.api.plans().subscribe({ next: (p) => this.plans.set(p), error: () => undefined });
    this.loadDashboard();
    this.load();
  }

  protected filtered() { return !!(this.search().trim() || this.status() || this.planId() || this.soon()); }
  protected onSearch(q: string) { this.search.set(q); this.typed$.next(q.trim()); }
  protected setStatus(v: SubscriptionStatus | '') { this.status.set(v); this.go(1); }
  protected setPlan(v: string) { this.planId.set(v); this.go(1); }
  protected setSoon(v: boolean) { this.soon.set(v); this.go(1); }
  protected clear() { this.search.set(''); this.status.set(''); this.planId.set(''); this.soon.set(false); this.go(1); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }
  protected open(s: ParlourSubscription) { void this.router.navigate(['/superadmin/parlours', s.parlourId]); }

  private loadDashboard() {
    this.dashError.set('');
    this.api.dashboard().subscribe({ next: (d) => this.dash.set(d), error: (e) => this.dashError.set(parseError(e).message) });
  }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.list({
      search: this.search().trim() || undefined,
      status: this.status() || undefined,
      planId: this.planId() || undefined,
      expiringWithin: this.soon() ? 7 : undefined,
      page: this.meta().page,
      limit: 20,
    }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }
}
