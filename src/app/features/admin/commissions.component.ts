import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { CommissionsApi, PerformersApi, ServicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { CommissionKind, CommissionLine, CommissionLines, CommissionPayout, CommissionPerson, CommissionReport, CommissionRule, CommissionRuleChange, CommissionRuleResolution, CommissionScope, CommissionTips, Performer, Service } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

type Preset = 'today' | '7d' | '30d' | 'month';
const PRESETS: { id: Preset; label: string }[] = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'month', label: 'This month' }];
type Dialog = { kind: 'pay'; person: CommissionPerson } | { kind: 'rule'; rule: CommissionRule | null } | { kind: 'remove'; rule: CommissionRule } | { kind: 'resolve' } | null;

/** What the most specific rule that applies is called, most specific first. This is the order they win in. */
const SCOPES: { id: CommissionScope; label: string; help: string }[] = [
  { id: 'performer_service', label: 'A person doing one service', help: 'Wins over every other rule.' },
  { id: 'performer', label: 'A person', help: 'Used when there is no rule for that person and that service.' },
  { id: 'service', label: 'A service', help: 'Used when the person has no rule of their own.' },
  { id: 'default', label: 'Everybody (the default)', help: 'Used when nothing more specific applies. There can be only one.' },
];
const SCOPE_NAME: Record<CommissionScope, string> = { performer_service: 'Person + service', performer: 'Person', service: 'Service', default: 'Default' };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s: string, fmt = 'd MMM y') => new DatePipe('en-US').transform(`${s}T00:00:00`, fmt) ?? s;

/**
 * What each person has earned in a date range, the rules it is worked out with, and recording that they were paid.
 *
 *   Commission is worked out on what the customer actually paid for the service: after discounts, before GST. The tip is not part of it.
 *   A service shared between people credits each of them with their own part, and each earns on that part.
 *   Each bill line keeps the rule it was made under, so changing a rule here only changes FUTURE bills.
 *   Tips are shown beside commission (how they were shared), never added to it.
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
            <div class="ledger-item"><div class="k">Tips shared</div><div class="v">{{ r.totals.tips | money }}</div><div class="s">not sales, not commission</div></div>
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
                  <thead><tr><th>Name</th><th class="num">Bill lines</th><th class="num">Sales</th><th class="num">Earned</th><th class="num">Paid</th><th class="num">To pay</th><th class="num">Tips</th><th><span class="sr-only">Actions</span></th></tr></thead>
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
                        <td class="num">{{ p.tips | money }}</td>
                        <td class="cell-actions">
                          <button type="button" class="btn btn-ghost btn-sm" [attr.aria-expanded]="openId() === p.id" (click)="toggle(p)">{{ openId() === p.id ? 'Hide bills' : 'Show bills' }}</button>
                          @if (canPay() && p.due > 0) { <button type="button" class="btn btn-primary btn-sm" (click)="open({ kind: 'pay', person: p })">Mark as paid</button> }
                        </td>
                      </tr>
                      @if (openId() === p.id) {
                        <tr class="detail">
                          <td colspan="8">
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
                                  <thead><tr><th>Bill</th><th>Service</th><th class="num">Their share</th><th class="num">Took in</th><th>Rule</th><th class="num">Commission</th><th>Status</th></tr></thead>
                                  <tbody>
                                    @for (x of l.lines; track x.id) {
                                      <tr [class.off]="x.status === 'void'">
                                        <td><a [routerLink]="['/admin/invoices', x.invoiceId]">{{ x.number }}</a><div class="muted small">{{ x.createdAt | date: 'd MMM, h:mm a' }}</div></td>
                                        <td>{{ x.name }}@if (x.quantity > 1) { <span class="muted"> × {{ x.quantity }}</span> }</td>
                                        <td class="num">{{ x.sharePercent }}%</td>
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
            A service shared between people counts for each of them on their own part. “Mark as paid” covers the bills in the dates above that
            are not voided. It only records that you have paid; it does not move any money.
          </p>
        }

        <!-- How tips were shared. A tip is not sales and not commission: it is listed apart and never added to either. -->
        <section class="panel" style="margin-top: 24px" aria-labelledby="tips-h">
          <div class="panel-head"><h2 id="tips-h">Tips shared</h2></div>
          @if (tips() === null) {
            <div class="panel-body"><div class="skeleton" style="height: 60px"></div></div>
          } @else if (tipsError()) {
            <div class="panel-body empty"><p>{{ tipsError() }}</p><button type="button" class="btn btn-secondary btn-sm" (click)="loadTips()">Try again</button></div>
          } @else if (!tips()!.bills.length) {
            <div class="panel-body empty"><p>No tips were recorded in this period.</p></div>
          } @else {
            @let t = tips()!;
            <div class="panel-body">
              <p class="muted small" style="margin-top: 0">
                {{ t.totals.tips | money: true }} in tips (voided bills left out): {{ t.totals.shared | money: true }} given to people
                @if (t.totals.unshared > 0) { and {{ t.totals.unshared | money: true }} not shared with anyone }.
              </p>
            </div>
            @if (t.people.length) {
              <div class="table-wrap" style="border: 0; border-radius: 0">
                <table class="table">
                  <thead><tr><th>Name</th><th class="num">Bills with a share</th><th class="num">Tips given</th></tr></thead>
                  <tbody>
                    @for (p of t.people; track p.id) {
                      <tr [class.off]="!p.isActive"><td><strong>{{ p.name }}</strong> @if (!p.isActive) { <span class="badge badge-void">Deactivated</span> }</td><td class="num">{{ p.bills }}</td><td class="num"><strong>{{ p.amount | money }}</strong></td></tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            <div class="panel-body" style="border-top: 1px solid var(--line)">
              <button type="button" class="btn btn-ghost btn-sm" [attr.aria-expanded]="showTipBills()" (click)="showTipBills.set(!showTipBills())">{{ showTipBills() ? 'Hide' : 'Show' }} the {{ t.bills.length }} {{ t.bills.length === 1 ? 'bill' : 'bills' }} with a tip</button>
            </div>
            @if (showTipBills()) {
              <div class="table-wrap" style="border: 0; border-radius: 0">
                <table class="table inner">
                  <thead><tr><th>Bill</th><th class="num">Tip</th><th>Shared as</th></tr></thead>
                  <tbody>
                    @for (b of t.bills; track b.invoiceId) {
                      <tr [class.off]="b.status === 'void'">
                        <td><a [routerLink]="['/admin/invoices', b.invoiceId]">{{ b.number }}</a>@if (b.status === 'void') { <span class="badge badge-void">Void</span> }<div class="muted small">{{ b.createdAt | date: 'd MMM, h:mm a' }}</div></td>
                        <td class="num">{{ b.tip | money }}</td>
                        <td>
                          @for (s of b.shares; track s.performerId) { <span class="tip-who">{{ s.name }} {{ s.amount | money }}@if (s.percent !== null) { <span class="muted"> ({{ s.percent }}%)</span> }</span>@if (!$last) { <span aria-hidden="true"> · </span> } }
                          @empty { <span class="muted">Not shared</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (t.truncated) { <p class="hint" style="padding: 0 16px 12px">Only the newest 200 bills are listed. Choose a shorter period to see the rest.</p> }
            }
          }
        </section>

        <section class="panel" style="margin-top: 24px" aria-labelledby="rules-h">
          <div class="panel-head">
            <h2 id="rules-h">Commission rules</h2>
            <div class="row" style="gap: 8px">
              <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'resolve' })">Which rule applies?</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="open({ kind: 'rule', rule: null })"><app-icon name="plus" [size]="16" /> Add rule</button>
            </div>
          </div>
          <div class="panel-body">
            <p class="muted small" style="margin-top: 0">
              A rule is a percentage, or a flat amount each time a service is performed. It can be for a person doing one service, a person, a service, or everybody (the default).
              The most specific rule that applies wins: <strong>1</strong> person + service, <strong>2</strong> person, <strong>3</strong> service, <strong>4</strong> default.
              A combo has no single service, so only a person's rule or the default applies to it. A rule switched off is ignored.
              A flat amount shared by several people on one service is split between them in proportion to their shares.
              A changed rule applies to future bills only; bills already made, and commission already paid, keep theirs.
            </p>
          </div>
          @if (rules() === null) {
            <div class="panel-body"><div class="skeleton" style="height: 60px"></div></div>
          } @else if (!rules()!.length) {
            <div class="panel-body empty"><h3>No rules yet</h3><p>Add a rule, or a default for everybody, to start working out commission on new bills.</p></div>
          } @else {
            <div class="table-wrap" style="border: 0; border-radius: 0">
              <table class="table">
                <thead><tr><th class="num">Priority</th><th>Applies to</th><th>Commission</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  @for (x of rules(); track x.id) {
                    <tr [class.off]="!x.isActive">
                      <td class="num"><span class="badge" [attr.title]="scopeName(x.scope)">{{ x.priority }} · {{ scopeName(x.scope) }}</span></td>
                      <td><strong>{{ appliesTo(x) }}</strong></td>
                      <td>{{ ruleText(x) }}</td>
                      <td><span class="badge" [class.badge-paid]="x.isActive" [class.badge-void]="!x.isActive">{{ x.isActive ? 'Active' : 'Off' }}</span></td>
                      <td class="cell-actions">
                        <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'rule', rule: x })"><app-icon name="pencil" [size]="16" /> Edit</button>
                        <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="setActive(x, !x.isActive)">{{ x.isActive ? 'Switch off' : 'Switch on' }}</button>
                        <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'remove', rule: x })"><app-icon name="trash" [size]="16" /> Remove</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <div class="panel-body" style="border-top: 1px solid var(--line)">
            <button type="button" class="btn btn-ghost btn-sm" [attr.aria-expanded]="showHistory()" (click)="toggleHistory()">{{ showHistory() ? 'Hide' : 'Show' }} rule history</button>
          </div>
          @if (showHistory()) {
            @if (history() === null) {
              <div class="panel-body"><div class="skeleton" style="height: 60px"></div></div>
            } @else if (!history()!.length) {
              <div class="panel-body empty"><p>No rule has been changed yet.</p></div>
            } @else {
              <div class="table-wrap" style="border: 0; border-radius: 0">
                <table class="table inner">
                  <thead><tr><th>When</th><th>What happened</th><th>Rule</th><th>By</th></tr></thead>
                  <tbody>
                    @for (h of history(); track h.id) {
                      <tr>
                        <td class="muted small">{{ h.changedAt | date: 'd MMM y, h:mm a' }}</td>
                        <td>{{ historyText(h) }}</td>
                        <td>{{ scopeName(h.scope) }}: {{ historyTarget(h) }}</td>
                        <td class="muted">{{ h.changedByName ?? '–' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
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
                <div class="field"><span class="label">Applies to</span><div><strong>{{ appliesTo(d.rule) }}</strong> <span class="badge">{{ d.rule.priority }} · {{ scopeName(d.rule.scope) }}</span></div></div>
                <p class="hint" style="margin: -4px 0 0">Who a rule is for cannot be changed. Remove it and add a new one instead.</p>
              } @else {
                <div class="field">
                  <label class="label" for="r-scope">Applies to</label>
                  <select id="r-scope" class="select" formControlName="scope">
                    @for (sc of scopes; track sc.id) { <option [value]="sc.id">{{ sc.label }}</option> }
                  </select>
                  <span class="hint">{{ scopeHelp() }}</span>
                </div>
                @if (needsPerson()) {
                  <div class="field" [class.invalid]="err('performerId')">
                    <label class="label" for="r-person">Person</label>
                    <select id="r-person" class="select" formControlName="performerId">
                      <option value="">Choose a person</option>
                      @for (p of activePeople(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                    </select>
                    @if (err('performerId'); as m) { <span class="field-error">{{ m }}</span> }
                  </div>
                }
                @if (needsService()) {
                  <div class="field" [class.invalid]="err('serviceId')">
                    <label class="label" for="r-service">Service</label>
                    <select id="r-service" class="select" formControlName="serviceId">
                      <option value="">Choose a service</option>
                      @for (s of services(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                    </select>
                    @if (err('serviceId'); as m) { <span class="field-error">{{ m }}</span> }
                  </div>
                }
                <p class="hint" style="margin: -4px 0 0">If that already has a rule, edit that rule instead: there is only one for each.</p>
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
                  : 'Paid for every unit performed, but never more than the service took in on that bill. When several people share a service, it is split between them in proportion to their shares.' }}</span>
              </div>
              <label class="check"><input type="checkbox" formControlName="isActive" /> <span>Active: used on new bills. Switch off to ignore this rule without removing it.</span></label>
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
              <p>The rule for <strong>{{ appliesTo(d.rule) }}</strong> will stop applying to new bills (the next most specific rule applies instead). Bills already made, and commission already paid, keep what they earned. The change is kept in the rule history.</p>
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="removeRule(d.rule)">{{ busy() ? 'Removing…' : 'Remove rule' }}</button>
            </ng-container>
          </app-modal>
        }
        @case ('resolve') {
          <app-modal title="Which rule applies?" (closed)="close()">
            <div class="stack">
              <p class="muted small" style="margin: 0">Pick a person and a service to see which rule would be used for them on a new bill, and what else could have applied.</p>
              <div class="field">
                <label class="label" for="q-person">Person</label>
                <select id="q-person" class="select" [value]="askPerson()" (change)="askPerson.set($any($event.target).value); resolved.set(null)">
                  <option value="">Choose a person</option>
                  @for (p of activePeople(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                </select>
              </div>
              <div class="field">
                <label class="label" for="q-service">Service</label>
                <select id="q-service" class="select" [value]="askService()" (change)="askService.set($any($event.target).value); resolved.set(null)">
                  <option value="">A combo (no single service)</option>
                  @for (s of services(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
                </select>
              </div>
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              @if (resolved(); as r) {
                <div role="status">
                  @if (r.rule; as w) { <p style="margin: 0"><strong>{{ ruleText(w) }}</strong>: the {{ scopeName(w.scope) }} rule ({{ appliesTo(w) }}), priority {{ w.priority }}.</p> }
                  @else { <p style="margin: 0"><strong>No rule applies</strong>: this would earn no commission.</p> }
                  @if (r.candidates.length > 1 || (r.candidates.length === 1 && !r.rule)) {
                    <ul class="muted small" style="margin: 8px 0 0; padding-left: 18px">
                      @for (c of r.candidates; track c.id) { <li>{{ c.priority }} · {{ scopeName(c.scope) }}: {{ appliesTo(c) }}, {{ ruleText(c) }}{{ c.isActive ? '' : ' (switched off)' }}{{ r.rule && c.id === r.rule.id ? ' ← used' : '' }}</li> }
                    </ul>
                  }
                </div>
              }
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Close</button>
              <button type="button" class="btn btn-primary" [disabled]="!askPerson() || busy()" (click)="resolve()">{{ busy() ? 'Checking…' : 'Check' }}</button>
            </ng-container>
          </app-modal>
        }
      }
    }`,
  styles: [`
    .off td { color: var(--muted); }
    .detail > td { background: var(--surface-2, #faf8fb); padding: 12px 16px; }
    .inner { margin: 0; }
    .tip-who { white-space: nowrap; }
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
  protected readonly history = signal<CommissionRuleChange[] | null>(null);
  protected readonly showHistory = signal(false);
  protected readonly tips = signal<CommissionTips | null>(null);
  protected readonly tipsError = signal('');
  protected readonly showTipBills = signal(false);
  protected readonly scopes = SCOPES;
  protected readonly askPerson = signal('');
  protected readonly askService = signal('');
  protected readonly resolved = signal<CommissionRuleResolution | null>(null);
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
    scope: ['performer' as CommissionScope],
    performerId: [''],
    serviceId: [''],
    kind: ['percent' as CommissionKind],
    value: [10, [Validators.required, Validators.min(0.01)]],
    isActive: [true],
  });
  /** Which boxes the rule being added needs, from the kind of rule chosen. */
  protected needsPerson() { const s = this.ruleForm.controls.scope.value; return s === 'performer' || s === 'performer_service'; }
  protected needsService() { const s = this.ruleForm.controls.scope.value; return s === 'service' || s === 'performer_service'; }
  protected scopeHelp() { return SCOPES.find((x) => x.id === this.ruleForm.controls.scope.value)?.help ?? ''; }
  protected scopeName(s: CommissionScope) { return SCOPE_NAME[s]; }

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
    this.loadTips();
  }

  /** How the tips were shared in the same days as the report. It has its own message if it fails: the report still shows. */
  protected loadTips() {
    this.tips.set(null);
    this.tipsError.set('');
    const range = this.range();
    this.api.tips(range).subscribe({
      next: (t) => this.tips.set(t),
      error: (e) => { this.tipsError.set(parseError(e).message); this.tips.set({ range: { from: range.from, to: range.to }, totals: { tips: 0, shared: 0, unshared: 0 }, people: [], truncated: false, bills: [] }); },
    });
  }

  /** The days the screen is showing (the same for the report and the tips). */
  private range(): { from: string; to: string } {
    const now = new Date();
    const start = new Date(now);
    if (this.preset() === '7d') start.setDate(now.getDate() - 6);
    else if (this.preset() === '30d') start.setDate(now.getDate() - 29);
    else if (this.preset() === 'month') start.setDate(1);
    return { from: ymd(start), to: ymd(now) };
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

  /** The rule a line was worked out with, as it was that day: the amount, and which kind of rule it came from. */
  protected ruleOf(x: CommissionLine): string {
    if (!x.kind || x.rate === null) return 'No rule';
    const amount = x.kind === 'percent' ? `${x.rate}%` : `${this.money.transform(x.rate)} each`;
    const kind = x.rule === 'legacy' ? 'Earlier rule' : x.rule ? SCOPE_NAME[x.rule] : '';
    return kind ? `${amount} · ${kind}` : amount;
  }

  protected statusOf(x: CommissionLine): string {
    if (x.status === 'void') return x.paid ? 'Voided after payment' : 'Voided';
    if (x.commission <= 0) return 'No commission';
    return x.paid ? 'Paid out' : 'To pay';
  }

  protected ruleText(x: { kind: CommissionKind; value: number }): string {
    return x.kind === 'percent' ? `${x.value}% of what the service took in` : `${this.money.transform(x.value)} each time it is performed`;
  }

  /** Who a rule is for, in words. */
  protected appliesTo(x: { scope: CommissionScope; performerName: string | null; serviceName: string | null }): string {
    switch (x.scope) {
      case 'performer_service': return `${x.performerName ?? 'A person'} doing ${x.serviceName ?? 'a service'}`;
      case 'performer': return x.performerName ?? 'A person';
      case 'service': return x.serviceName ?? 'A service';
      default: return 'Everybody (default)';
    }
  }

  protected historyTarget(h: CommissionRuleChange): string { return this.appliesTo(h); }
  protected historyText(h: CommissionRuleChange): string {
    const now = this.ruleText(h);
    switch (h.action) {
      case 'created': return `Added: ${now}`;
      case 'updated': return h.previous ? `Changed from ${this.ruleText(h.previous)} to ${now}` : `Changed to ${now}`;
      case 'activated': return 'Switched on';
      case 'deactivated': return 'Switched off';
      default: return `Removed (it was ${now})`;
    }
  }

  protected toggleHistory() {
    const show = !this.showHistory();
    this.showHistory.set(show);
    if (show) this.loadHistory();
  }
  private loadHistory() { this.api.ruleHistory().subscribe({ next: (h) => this.history.set(h), error: () => this.history.set([]) }); }

  /** Switches a rule on or off without losing it. Applies to new bills only. */
  protected setActive(r: CommissionRule, isActive: boolean) {
    this.busy.set(true);
    this.api.updateRule(r.id, { isActive }).subscribe({
      next: () => { this.busy.set(false); this.toast.success(isActive ? 'Rule switched on. It applies to new bills.' : 'Rule switched off. New bills ignore it.'); this.loadRules(); if (this.showHistory()) this.loadHistory(); },
      error: (e) => { this.busy.set(false); this.toast.error(parseError(e).message); },
    });
  }

  protected resolve() {
    if (!this.askPerson()) return;
    this.busy.set(true);
    this.formError.set('');
    this.api.resolve(this.askPerson(), this.askService() || undefined).subscribe({
      next: (r) => { this.busy.set(false); this.resolved.set(r); },
      error: (e) => { this.busy.set(false); this.formError.set(parseError(e).message); },
    });
  }

  // ── dialogs ──
  protected err(name: 'performerId' | 'serviceId' | 'value') {
    return controlError(this.ruleForm.get(name), { required: 'Enter a number' });
  }

  protected open(d: Dialog) {
    this.formError.set('');
    if (d?.kind === 'rule') {
      if (d.rule) this.ruleForm.reset({ scope: d.rule.scope, performerId: d.rule.performerId ?? '', serviceId: d.rule.serviceId ?? '', kind: d.rule.kind, value: d.rule.value, isActive: d.rule.isActive });
      else this.ruleForm.reset({ scope: 'performer', performerId: '', serviceId: '', kind: 'percent', value: 10, isActive: true });
    }
    if (d?.kind === 'resolve') { this.askPerson.set(''); this.askService.set(''); this.resolved.set(null); }
    this.dialog.set(d);
  }
  protected close() { this.dialog.set(null); }

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
    if (!existing) {
      // Everything the kind of rule needs must be chosen: a person, a service, or both. The default needs neither.
      const missing = [
        ...(this.needsPerson() && !v.performerId ? [['performerId', 'Choose a person'] as const] : []),
        ...(this.needsService() && !v.serviceId ? [['serviceId', 'Choose a service'] as const] : []),
      ];
      if (missing.length) {
        for (const [name, message] of missing) { const c = this.ruleForm.controls[name]; c.setErrors({ server: message }); c.markAsTouched(); }
        return;
      }
    }
    const value = Number(v.value);
    const bad = !(value > 0) ? 'Enter a number above 0' : v.kind === 'percent' && value > 100 ? 'A percentage cannot be more than 100' : null;
    if (bad) { this.ruleForm.controls.value.setErrors({ server: bad }); this.ruleForm.controls.value.markAsTouched(); return; }
    this.busy.set(true);
    this.formError.set('');
    const call = existing
      ? this.api.updateRule(existing.id, { kind: v.kind, value, isActive: v.isActive })
      : this.api.createRule({
        scope: v.scope,
        ...(this.needsPerson() ? { performerId: v.performerId } : {}),
        ...(this.needsService() ? { serviceId: v.serviceId } : {}),
        kind: v.kind, value, isActive: v.isActive,
      });
    call.subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success('Rule saved. It applies to new bills.'); this.loadRules(); if (this.showHistory()) this.loadHistory(); },
      error: (e) => { this.busy.set(false); const info = parseError(e); if (!applyFieldErrors(this.ruleForm, info)) this.formError.set(info.message); },
    });
  }

  protected removeRule(r: CommissionRule) {
    this.run(this.api.removeRule(r.id), 'Rule removed', false, () => { this.loadRules(); if (this.showHistory()) this.loadHistory(); });
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
