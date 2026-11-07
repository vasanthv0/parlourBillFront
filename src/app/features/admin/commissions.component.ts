import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { CommissionsApi, PerformersApi, ServicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { CommissionKind, CommissionLine, CommissionLines, CommissionPayout, CommissionPerson, CommissionReport, CommissionRule, Performer, Service } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

type Preset = 'today' | '7d' | '30d' | 'month';
const PRESETS: { id: Preset; label: string }[] = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'month', label: 'This month' }];
type Dialog = { kind: 'pay'; person: CommissionPerson } | { kind: 'rule'; rule: CommissionRule | null } | { kind: 'remove'; rule: CommissionRule } | null;
type Target = 'performer' | 'service';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s: string, fmt = 'd MMM y') => new DatePipe('en-US').transform(`${s}T00:00:00`, fmt) ?? s;

/**
 * What each person has earned in a date range, the rules it is worked out with, and recording that they were paid.
 *
 *   Commission is worked out on what the customer actually paid for the service: after discounts, before GST. The tip is not part of it.
 *   Each bill line keeps the rule it was made under, so changing a rule here only changes FUTURE bills.
 *   "Mark as paid" only records that you paid. It does not move any money.
 */
@Component({
  selector: 'app-commissions',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, IconComponent, ModalComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Commissions</h1><p class="sub">{{ rangeLabel() }}</p></div>
        <div class="segmented" role="group" aria-label="Date range">
          @for (p of presets; track p.id) { <button type="button" [attr.aria-pressed]="preset() === p.id" (click)="pick(p.id)">{{ p.label }}</button> }
        </div>
      </div>

      @if (error()) {
        <div class="panel empty"><h3>Could not load commissions</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (!report()) {
        <div class="skeleton" style="height: 92px; margin-bottom: 24px"></div><div class="skeleton" style="height: 240px"></div>
      } @else {
        @if (report(); as r) {
          <div class="ledger">
            <div class="ledger-item"><div class="k">Sales credited</div><div class="v">{{ r.totals.sales | money }}</div><div class="s">after discounts, before GST</div></div>
            <div class="ledger-item"><div class="k">Commission earned</div><div class="v">{{ r.totals.earned | money }}</div><div class="s">voided bills excluded</div></div>
            <div class="ledger-item"><div class="k">Already paid</div><div class="v">{{ r.totals.paid | money }}</div></div>
            <div class="ledger-item"><div class="k">Still to pay</div><div class="v">{{ r.totals.due | money }}</div></div>
          </div>

          @if (r.totals.voidedAfterPaid > 0) {
            <div class="form-alert" role="alert" style="margin-top: 16px">
              {{ r.totals.voidedAfterPaid | money }} of commission was paid on bills that were voided afterwards. Nothing was changed automatically.
              Settle it with the person yourself. The bills are marked in the lists below.
            </div>
          }

          <section class="panel" style="margin-top: 24px">
            <div class="panel-head"><h2>What each person has earned</h2></div>
            @if (!r.people.length) {
              <div class="panel-body empty">
                <h3>No performers yet</h3>
                <p>Add the people who perform services, then choose who did each service when you make a bill.</p>
                <a class="btn btn-primary" routerLink="/admin/performers">Go to Performers</a>
              </div>
            } @else {
              <div class="table-wrap" style="border: 0; border-radius: 0">
                <table class="table">
                  <thead><tr><th>Name</th><th class="num">Bill lines</th><th class="num">Sales</th><th class="num">Earned</th><th class="num">Paid</th><th class="num">To pay</th><th><span class="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    @for (p of r.people; track p.id) {
                      <tr [class.off]="!p.isActive">
                        <td><strong>{{ p.name }}</strong> @if (!p.isActive) { <span class="badge badge-void">Deactivated</span> }
                          @if (p.voidedAfterPaid > 0) { <div class="muted small">{{ p.voidedAfterPaid | money }} paid on voided bills</div> }
                        </td>
                        <td class="num">{{ p.lines }}</td>
                        <td class="num">{{ p.sales | money }}</td>
                        <td class="num">{{ p.earned | money }}</td>
                        <td class="num">{{ p.paid | money }}</td>
                        <td class="num"><strong>{{ p.due | money }}</strong></td>
                        <td class="cell-actions">
                          <button type="button" class="btn btn-ghost btn-sm" [attr.aria-expanded]="openId() === p.id" (click)="toggle(p)">{{ openId() === p.id ? 'Hide bills' : 'Show bills' }}</button>
                          @if (canPay() && p.due > 0) { <button type="button" class="btn btn-primary btn-sm" (click)="open({ kind: 'pay', person: p })">Mark as paid</button> }
                        </td>
                      </tr>
                      @if (openId() === p.id) {
                        <tr class="detail">
                          <td colspan="7">
                            @if (linesError()) {
                              <p class="muted">{{ linesError() }} <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(p, true)">Try again</button></p>
                            } @else if (!lines()) {
                              <div class="skeleton" style="height: 80px"></div>
                            } @else if (lines()) {
                              @let l = lines()!;
                              @if (!l.lines.length) {
                                <p class="muted">No bill lines for {{ p.name }} in this period.</p>
                              } @else {
                                <table class="table inner">
                                  <thead><tr><th>Bill</th><th>Service</th><th class="num">Took in</th><th>Rule</th><th class="num">Commission</th><th>Status</th></tr></thead>
                                  <tbody>
                                    @for (x of l.lines; track x.id) {
                                      <tr [class.off]="x.status === 'void'">
                                        <td><a [routerLink]="['/admin/invoices', x.invoiceId]">{{ x.number }}</a><div class="muted small">{{ x.createdAt | date: 'd MMM, h:mm a' }}</div></td>
                                        <td>{{ x.name }}@if (x.quantity > 1) { <span class="muted"> × {{ x.quantity }}</span> }</td>
                                        <td class="num">{{ x.base === null ? '–' : (x.base | money) }}</td>
                                        <td class="muted small">{{ ruleOf(x) }}</td>
                                        <td class="num">{{ x.commission | money }}</td>
                                        <td><span class="badge" [class.badge-paid]="statusOf(x) === 'Paid out'" [class.badge-warn]="statusOf(x) === 'To pay'" [class.badge-void]="x.status === 'void'">{{ statusOf(x) }}</span></td>
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                                @if (l.truncated) { <p class="hint">Only the newest 500 lines are shown. Choose a shorter period to see the rest.</p> }
                              }
                            }
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
          <p class="hint" style="margin-top: 12px">
            Commission is worked out on what the customer actually paid for each service: after discounts, before GST. Tips are not part of it.
            “Mark as paid” covers the bills in the dates above that are not voided. It only records that you have paid; it does not move any money.
          </p>
        }

        <section class="panel" style="margin-top: 24px">
          <div class="panel-head">
            <h2>Commission rules</h2>
            <button type="button" class="btn btn-secondary btn-sm" (click)="open({ kind: 'rule', rule: null })"><app-icon name="plus" [size]="16" /> Add rule</button>
          </div>
          <div class="panel-body">
            <p class="muted small" style="margin-top: 0">
              A rule is a percentage, or a flat amount for each time a service is performed, for one person or one service.
              If a person and a service both have a rule, the person's rule is used. A combo only uses the person's rule.
              People and services without a rule earn no commission. A changed rule applies to future bills only; bills already made keep theirs.
            </p>
          </div>
          @if (rules() === null) {
            <div class="panel-body"><div class="skeleton" style="height: 60px"></div></div>
          } @else if (!rules()!.length) {
            <div class="panel-body empty"><h3>No rules yet</h3><p>Add a rule for a person or a service to start working out commission on new bills.</p></div>
          } @else {
            <div class="table-wrap" style="border: 0; border-radius: 0">
              <table class="table">
                <thead><tr><th>Applies to</th><th>Commission</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  @for (x of rules(); track x.id) {
                    <tr>
                      <td><strong>{{ x.performerName ?? x.serviceName }}</strong> <span class="badge">{{ x.performerId ? 'Person' : 'Service' }}</span></td>
                      <td>{{ ruleText(x) }}</td>
                      <td class="cell-actions">
                        <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'rule', rule: x })"><app-icon name="pencil" [size]="16" /> Edit</button>
                        <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'remove', rule: x })"><app-icon name="trash" [size]="16" /> Remove</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <section class="panel" style="margin-top: 24px">
          <div class="panel-head"><h2>Payments made</h2></div>
          @if (payouts() === null) {
            <div class="panel-body"><div class="skeleton" style="height: 60px"></div></div>
          } @else if (!payouts()!.length) {
            <div class="panel-body empty"><p>Nothing has been marked as paid yet.</p></div>
          } @else {
            <div class="table-wrap" style="border: 0; border-radius: 0">
              <table class="table">
                <thead><tr><th>Paid on</th><th>Person</th><th>Bills from</th><th class="num">Lines</th><th class="num">Amount</th><th>Recorded by</th></tr></thead>
                <tbody>
                  @for (x of payouts(); track x.id) {
                    <tr>
                      <td>{{ x.paidAt | date: 'd MMM y, h:mm a' }}</td>
                      <td><strong>{{ x.performerName }}</strong></td>
                      <td class="muted">{{ dates(x.from, x.to) }}</td>
                      <td class="num">{{ x.lines }}</td>
                      <td class="num"><strong>{{ x.amount | money }}</strong></td>
                      <td class="muted">{{ x.paidByName ?? '–' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>

    @if (dialog(); as d) {
      @switch (d.kind) {
        @case ('pay') {
          <app-modal [title]="'Mark ' + d.person.name + ' as paid'" (closed)="close()">
            <div class="stack">
              <p>Record that you have paid <strong>{{ d.person.name }}</strong> <strong>{{ d.person.due | money: true }}</strong> commission for bills from {{ dates(report()!.range.from, report()!.range.to) }}.</p>
              <p class="muted small">This only records the payment. It does not move any money, and it cannot be undone here. It covers bills in those dates that are not voided.</p>
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="pay(d.person)">{{ busy() ? 'Saving…' : 'Mark ' + (d.person.due | money: true) + ' as paid' }}</button>
            </ng-container>
          </app-modal>
        }
        @case ('rule') {
          <app-modal [title]="d.rule ? 'Edit commission rule' : 'Add commission rule'" (closed)="close()">
            <form id="rule-form" [formGroup]="ruleForm" (ngSubmit)="saveRule(d.rule)" class="stack" novalidate>
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }

              @if (d.rule) {
                <div class="field"><span class="label">Applies to</span><div><strong>{{ d.rule.performerName ?? d.rule.serviceName }}</strong> <span class="badge">{{ d.rule.performerId ? 'Person' : 'Service' }}</span></div></div>
              } @else {
                <div class="field">
                  <span class="label" id="rule-for">Applies to</span>
                  <div class="segmented fill" role="group" aria-labelledby="rule-for">
                    <button type="button" [attr.aria-pressed]="ruleForm.controls.target.value === 'performer'" (click)="setTarget('performer')">A person</button>
                    <button type="button" [attr.aria-pressed]="ruleForm.controls.target.value === 'service'" (click)="setTarget('service')">A service</button>
                  </div>
                </div>
                @if (ruleForm.controls.target.value === 'performer') {
                  <div class="field" [class.invalid]="err('performerId')">
                    <label class="label" for="r-person">Person</label>
                    <select id="r-person" class="select" formControlName="performerId">
                      <option value="">Choose a person</option>
                      @for (p of activePeople(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                    </select>
                    @if (err('performerId'); as m) { <span class="field-error">{{ m }}</span> }
                  </div>
                } @else {
                  <div class="field" [class.invalid]="err('serviceId')">
                    <label class="label" for="r-service">Service</label>
                    <select id="r-service" class="select" formControlName="serviceId">
                      <option value="">Choose a service</option>
                      @for (s of services(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                    </select>
                    @if (err('serviceId'); as m) { <span class="field-error">{{ m }}</span> }
                  </div>
                }
                <p class="hint" style="margin: -4px 0 0">If they already have a rule, this replaces it.</p>
              }

              <div class="field">
                <span class="label" id="rule-kind">How it is worked out</span>
                <div class="segmented fill" role="group" aria-labelledby="rule-kind">
                  <button type="button" [attr.aria-pressed]="ruleForm.controls.kind.value === 'percent'" (click)="setKind('percent')">Percentage</button>
                  <button type="button" [attr.aria-pressed]="ruleForm.controls.kind.value === 'flat'" (click)="setKind('flat')">Flat amount</button>
                </div>
              </div>
              <div class="field" [class.invalid]="err('value')">
                <label class="label" for="r-value">{{ ruleForm.controls.kind.value === 'percent' ? 'Percentage of what the service took in' : 'Rupees each time it is performed' }}</label>
                <input id="r-value" class="input" type="number" inputmode="decimal" step="0.01" min="0" formControlName="value" />
                @if (err('value'); as m) { <span class="field-error">{{ m }}</span> }
                <span class="hint">{{ ruleForm.controls.kind.value === 'percent'
                  ? 'Worked out on what the customer actually paid for it: after discounts, before GST.'
                  : 'Paid for every unit performed, but never more than the service took in on that bill.' }}</span>
              </div>
            </form>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="submit" form="rule-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save rule' }}</button>
            </ng-container>
          </app-modal>
        }
        @case ('remove') {
          <app-modal title="Remove this rule?" (closed)="close()">
            <div class="stack">
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              <p>{{ d.rule.performerName ?? d.rule.serviceName }} will earn no commission from this rule on new bills. Bills already made keep the commission they earned.</p>
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="removeRule(d.rule)">{{ busy() ? 'Removing…' : 'Remove rule' }}</button>
            </ng-container>
          </app-modal>
        }
      }
    }`,
  styles: [`
    .off td { color: var(--muted); }
    .detail > td { background: var(--surface-2, #faf8fb); padding: 12px 16px; }
    .inner { margin: 0; }
  `],
})
export class CommissionsComponent {
  private readonly api = inject(CommissionsApi);
  private readonly peopleApi = inject(PerformersApi);
  private readonly servicesApi = inject(ServicesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly money = new MoneyPipe();
  protected readonly canPay = () => this.auth.hasFeature('action.commissions.pay');

  protected readonly presets = PRESETS;
  protected readonly preset = signal<Preset>('month');
  protected readonly report = signal<CommissionReport | null>(null);
  protected readonly error = signal('');
  protected readonly rules = signal<CommissionRule[] | null>(null);
  protected readonly payouts = signal<CommissionPayout[] | null>(null);
  protected readonly activePeople = signal<Performer[]>([]);
  protected readonly services = signal<Service[]>([]);

  protected readonly openId = signal<string | null>(null);
  protected readonly lines = signal<CommissionLines | null>(null);
  protected readonly linesError = signal('');

  protected readonly dialog = signal<Dialog>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  protected readonly ruleForm = this.fb.group({
    target: ['performer' as Target],
    performerId: [''],
    serviceId: [''],
    kind: ['percent' as CommissionKind],
    value: [10, [Validators.required, Validators.min(0.01)]],
  });

  protected readonly rangeLabel = computed(() => {
    const r = this.report()?.range;
    return r ? this.dates(r.from, r.to) : 'What each person has earned, and what is still to pay.';
  });

  constructor() {
    this.load();
    this.loadRules();
    this.loadPayouts();
    this.peopleApi.list(true).subscribe({ next: (l) => this.activePeople.set(l.filter((p) => p.isActive)), error: () => undefined });
    this.servicesApi.list().subscribe({ next: (l) => this.services.set(l), error: () => undefined });
  }

  protected dates(from: string, to: string) { return from === to ? day(from) : `${day(from)} to ${day(to)}`; }

  protected pick(p: Preset) { this.preset.set(p); this.load(); }

  protected load() {
    this.error.set('');
    this.report.set(null);
    this.closeDetail();
    const now = new Date();
    const start = new Date(now);
    if (this.preset() === '7d') start.setDate(now.getDate() - 6);
    else if (this.preset() === '30d') start.setDate(now.getDate() - 29);
    else if (this.preset() === 'month') start.setDate(1);
    this.api.report({ from: ymd(start), to: ymd(now) }).subscribe({ next: (r) => this.report.set(r), error: (e) => this.error.set(parseError(e).message) });
  }

  private loadRules() { this.api.rules().subscribe({ next: (r) => this.rules.set(r), error: () => this.rules.set([]) }); }
  private loadPayouts() { this.api.payouts().subscribe({ next: (p) => this.payouts.set(p), error: () => this.payouts.set([]) }); }

  // ── the bills behind one person's numbers ──
  private closeDetail() { this.openId.set(null); this.lines.set(null); this.linesError.set(''); }

  protected toggle(p: CommissionPerson, reload = false) {
    if (this.openId() === p.id && !reload) { this.closeDetail(); return; }
    const range = this.report()?.range;
    if (!range) return;
    this.openId.set(p.id);
    this.lines.set(null);
    this.linesError.set('');
    this.api.lines(p.id, range).subscribe({
      next: (l) => { if (this.openId() === p.id) this.lines.set(l); },
      error: (e) => { if (this.openId() === p.id) this.linesError.set(parseError(e).message); },
    });
  }

  protected ruleOf(x: CommissionLine): string {
    if (!x.kind || x.rate === null) return 'No rule';
    return x.kind === 'percent' ? `${x.rate}%` : `${this.money.transform(x.rate)} each`;
  }

  protected statusOf(x: CommissionLine): string {
    if (x.status === 'void') return x.paid ? 'Voided after payment' : 'Voided';
    if (x.commission <= 0) return 'No commission';
    return x.paid ? 'Paid out' : 'To pay';
  }

  protected ruleText(x: CommissionRule): string {
    return x.kind === 'percent' ? `${x.value}% of what the service took in` : `${this.money.transform(x.value)} each time it is performed`;
  }

  // ── dialogs ──
  protected err(name: 'performerId' | 'serviceId' | 'value') {
    return controlError(this.ruleForm.get(name), { required: 'Enter a number' });
  }

  protected open(d: Dialog) {
    this.formError.set('');
    if (d?.kind === 'rule') {
      if (d.rule) this.ruleForm.reset({ target: d.rule.performerId ? 'performer' : 'service', performerId: d.rule.performerId ?? '', serviceId: d.rule.serviceId ?? '', kind: d.rule.kind, value: d.rule.value });
      else this.ruleForm.reset({ target: 'performer', performerId: '', serviceId: '', kind: 'percent', value: 10 });
    }
    this.dialog.set(d);
  }
  protected close() { this.dialog.set(null); }

  protected setTarget(t: Target) { this.ruleForm.controls.target.setValue(t); }
  protected setKind(k: CommissionKind) { this.ruleForm.controls.kind.setValue(k); }

  private run(obs: Observable<unknown>, done: string, withForm: boolean, after?: () => void) {
    this.busy.set(true);
    this.formError.set('');
    obs.subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success(done); after?.(); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (!withForm || !applyFieldErrors(this.ruleForm, info)) this.formError.set(info.message);
      },
    });
  }

  protected saveRule(existing: CommissionRule | null) {
    const v = this.ruleForm.getRawValue();
    const target = existing ? (existing.performerId ? 'performer' : 'service') : v.target;
    const targetId = existing ? (existing.performerId ?? existing.serviceId ?? '') : target === 'performer' ? v.performerId : v.serviceId;
    if (!targetId) {
      const c = this.ruleForm.controls[target === 'performer' ? 'performerId' : 'serviceId'];
      c.setErrors({ server: target === 'performer' ? 'Choose a person' : 'Choose a service' });
      c.markAsTouched();
      return;
    }
    const value = Number(v.value);
    const bad = !(value > 0) ? 'Enter a number above 0' : v.kind === 'percent' && value > 100 ? 'A percentage cannot be more than 100' : null;
    if (bad) { this.ruleForm.controls.value.setErrors({ server: bad }); this.ruleForm.controls.value.markAsTouched(); return; }
    const body = { ...(target === 'performer' ? { performerId: targetId } : { serviceId: targetId }), kind: v.kind, value };
    this.busy.set(true);
    this.formError.set('');
    this.api.setRule(body).subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success('Rule saved. It applies to new bills.'); this.loadRules(); },
      error: (e) => { this.busy.set(false); const info = parseError(e); if (!applyFieldErrors(this.ruleForm, info)) this.formError.set(info.message); },
    });
  }

  protected removeRule(r: CommissionRule) {
    this.run(this.api.removeRule(r.id), 'Rule removed', false, () => this.loadRules());
  }

  protected pay(p: CommissionPerson) {
    const range = this.report()?.range;
    if (!range) return;
    this.busy.set(true);
    // The amount the admin saw goes with the request: if it is no longer exactly that, the server pays nothing.
    this.api.pay({ performerId: p.id, from: range.from, to: range.to, expectedAmount: p.due }).subscribe({
      next: (x) => { this.busy.set(false); this.close(); this.toast.success(`${this.money.transform(x.amount, true)} marked as paid to ${x.performerName}`); this.load(); this.loadPayouts(); },
      error: (e) => {
        // Whatever went wrong (the amount changed, or someone else already paid it), show the truth: reload.
        this.busy.set(false);
        this.close();
        this.toast.error(parseError(e).message);
        this.load();
        this.loadPayouts();
      },
    });
  }
}
