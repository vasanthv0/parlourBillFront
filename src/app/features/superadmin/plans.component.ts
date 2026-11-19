import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { PlanInput, SubscriptionMeta, SubscriptionPlan, SubscriptionsApi } from '../../core/subscriptions';
import { ToastService } from '../../core/toast.service';
import { FeatureTogglesComponent } from '../../shared/feature-toggles.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

/**
 * Subscription plans: what ParlourBill is sold as. Only the platform admin reaches this page (and the server checks it again on every call).
 * A plan is never deleted, because parlours point at it and its history has to stay readable: it is switched off instead, which stops it being
 * given to a new parlour while everyone already on it keeps it.
 */
@Component({
  selector: 'app-plans',
  imports: [ReactiveFormsModule, IconComponent, ModalComponent, FeatureTogglesComponent, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Plans</h1>
          <p class="sub">What you sell: a price, the pages and buttons it includes, and how much of each thing a parlour may have. A plan only ever takes access away; it never turns on what you switched off for a parlour.</p>
        </div>
        <button type="button" class="btn btn-primary" [disabled]="!meta()" (click)="startNew()"><app-icon name="plus" /> New plan</button>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 260px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load plans</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (plans().length === 0) {
        <div class="panel empty">
          <h3>No plans yet</h3>
          <p>Create your first plan, for example Basic at ₹299 a month, then give it to a parlour from the parlour’s page.</p>
          <button class="btn btn-primary" (click)="startNew()">Create a plan</button>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Plan</th><th class="num">Monthly</th><th class="num">Yearly</th><th>Includes</th><th>Limits</th><th class="num">Parlours</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (p of plans(); track p.id) {
                <tr [class.dim]="!p.isActive">
                  <td>
                    <strong>{{ p.name }}</strong> <span class="muted small">{{ p.code }}</span>
                    @if (p.description) { <div class="muted small clamp">{{ p.description }}</div> }
                  </td>
                  <td class="num">{{ p.monthlyPrice | money }}</td>
                  <td class="num">@if (p.yearlyPrice === null) { <span class="muted">Not sold yearly</span> } @else { {{ p.yearlyPrice | money }} }</td>
                  <td>{{ includedCount(p) }} of {{ featureTotal() }}</td>
                  <td class="small">{{ limitsText(p) }}</td>
                  <td class="num">{{ p.activeSubscribers }}<span class="muted small"> / {{ p.subscriberCount }}</span></td>
                  <td><span class="badge" [class.badge-paid]="p.isActive" [class.badge-void]="!p.isActive">{{ p.isActive ? 'Active' : 'Inactive' }}</span></td>
                  <td class="cell-actions">
                    <button type="button" class="btn btn-secondary btn-sm" (click)="edit(p)"><app-icon name="pencil" [size]="16" /> Edit</button>
                    <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy() === p.id" (click)="toggleActive(p)">{{ p.isActive ? 'Deactivate' : 'Activate' }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="table-foot"><span>{{ plans().length }} plan{{ plans().length === 1 ? '' : 's' }}. “Parlours” shows active / all that are on a plan.</span></div>
        </div>
      }
    </div>

    @if (editing(); as e) {
      <app-modal [title]="e === 'new' ? 'New plan' : 'Edit ' + e.name" [wide]="true" (closed)="editing.set(null)">
        <form id="plan-form" [formGroup]="form" (submit)="$event.preventDefault(); save()" class="stack" novalidate>
          @if (e !== 'new' && e.subscriberCount > 0) {
            <div class="form-alert" role="note">{{ e.subscriberCount }} parlour{{ e.subscriberCount === 1 ? ' is' : 's are' }} on this plan. What it includes and its limits change for them straight away. A new price applies from their next renewal; what they pay now does not change.</div>
          }
          @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }

          <div class="form-grid">
            <div class="field" [class.invalid]="err('name')">
              <label class="label" for="pl-name">Plan name</label>
              <input id="pl-name" class="input" formControlName="name" autocomplete="off" />
              @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field" [class.invalid]="err('code')">
              <label class="label" for="pl-code">Code</label>
              <input id="pl-code" class="input" formControlName="code" autocomplete="off" spellcheck="false" />
              @if (err('code'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">{{ e === 'new' ? 'A short name, like basic. It cannot be changed later.' : 'The code cannot be changed.' }}</span> }
            </div>
            <div class="field span-2" [class.invalid]="err('description')">
              <label class="label" for="pl-desc">Description</label>
              <textarea id="pl-desc" class="textarea" rows="2" formControlName="description" placeholder="Shown to the parlour on its subscription page"></textarea>
              @if (err('description'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field" [class.invalid]="err('monthlyPrice')">
              <label class="label" for="pl-m">Price per month (₹)</label>
              <input id="pl-m" class="input" type="number" min="0" step="0.01" inputmode="decimal" formControlName="monthlyPrice" />
              @if (err('monthlyPrice'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field" [class.invalid]="err('yearlyPrice')">
              <label class="label" for="pl-y">Price per year (₹)</label>
              <input id="pl-y" class="input" type="number" min="0" step="0.01" inputmode="decimal" formControlName="yearlyPrice" placeholder="Leave empty if not sold yearly" />
              @if (err('yearlyPrice'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">{{ yearlyHint() }}</span> }
            </div>
          </div>

          <label class="check"><input type="checkbox" [checked]="isActive()" (change)="isActive.set($any($event.target).checked)" /> <span>Offer this plan to parlours. Turn off to stop giving it to new parlours (those already on it keep it).</span></label>

          <section>
            <h3 class="sec">What this plan includes</h3>
            <p class="muted small">On means included. Switching a page off also takes away the buttons inside it. Anything you leave on that you have switched off for a particular parlour stays off for them.</p>
            @if (meta(); as m) { <app-feature-toggles [defs]="m.features" [(values)]="draftFeatures" /> }
          </section>

          <section>
            <h3 class="sec">Usage limits</h3>
            <p class="muted small">Leave a box empty for no limit. Limits are checked by the server when something is added. Bills are never limited.</p>
            @if (meta(); as m) {
              <div class="form-grid">
                @for (l of m.limits; track l.key) {
                  <div class="field" [class.invalid]="limitError(l.key)">
                    <label class="label" [attr.for]="'lim-' + l.key">{{ l.label }}</label>
                    <input [id]="'lim-' + l.key" class="input" type="number" min="1" step="1" inputmode="numeric" placeholder="No limit" [value]="limitValue(l.key)" (input)="setLimit(l.key, $any($event.target).value)" />
                    @if (limitError(l.key); as m2) { <span class="field-error">{{ m2 }}</span> } @else { <span class="hint">{{ l.description }}</span> }
                  </div>
                }
              </div>
            }
          </section>
        </form>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="editing.set(null)">Cancel</button>
          <button type="submit" form="plan-form" class="btn btn-primary" [disabled]="busy() === 'save'">{{ busy() === 'save' ? 'Saving…' : e === 'new' ? 'Create plan' : 'Save plan' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`
    .dim td { opacity: 0.62; }
    .clamp { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sec { font-size: 15px; margin: 4px 0 2px; }
    .check { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; cursor: pointer; }
    .check input { margin-top: 3px; }
  `],
})
export class PlansComponent {
  private readonly api = inject(SubscriptionsApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly plans = signal<SubscriptionPlan[]>([]);
  protected readonly meta = signal<SubscriptionMeta | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal('');

  /** The plan being edited, 'new' for a new one, or null when the dialog is closed. */
  protected readonly editing = signal<SubscriptionPlan | 'new' | null>(null);
  protected readonly formError = signal('');
  protected readonly isActive = signal(true);
  protected readonly draftFeatures = signal<Record<string, boolean>>({});
  /** What is typed in each limit box: '' means no limit. */
  protected readonly draftLimits = signal<Record<string, string>>({});
  protected readonly limitErrors = signal<Record<string, string>>({});

  protected readonly featureTotal = computed(() => this.meta()?.features.length ?? 0);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9_-]{1,39}$/)]],
    description: ['', [Validators.maxLength(500)]],
    monthlyPrice: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(1000000)]),
    yearlyPrice: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(1000000)]),
  });

  constructor() { this.load(); }

  protected err(name: string) {
    return controlError(this.form.get(name) as AbstractControl | null, { required: 'Required', pattern: 'Use 2–40 lower-case letters, numbers, - or _' });
  }
  protected yearlyHint() {
    const m = this.form.controls.monthlyPrice.value;
    return m ? `Twelve months at ${m} a month is ${Math.round(m * 12 * 100) / 100}. A yearly price below that is a discount.` : 'Optional.';
  }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.meta().subscribe({ next: (m) => this.meta.set(m), error: () => undefined });
    this.api.plans().subscribe({
      next: (p) => { this.plans.set(p); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected includedCount(p: SubscriptionPlan) { return Object.values(p.features).filter((v) => v !== false).length; }
  protected limitsText(p: SubscriptionPlan) {
    const defs = this.meta()?.limits ?? [];
    const set = defs.filter((d) => p.limits[d.key] !== null && p.limits[d.key] !== undefined);
    return set.length ? set.map((d) => `${d.label}: ${p.limits[d.key]}`).join(' · ') : 'No limits';
  }

  // ── The dialog ────────────────────────────────────────────────

  protected startNew() {
    this.formError.set('');
    this.limitErrors.set({});
    this.form.reset({ name: '', code: '', description: '', monthlyPrice: null, yearlyPrice: null });
    this.form.controls.code.enable();
    this.isActive.set(true);
    this.draftFeatures.set(Object.fromEntries((this.meta()?.features ?? []).map((f) => [f.key, true])));
    this.draftLimits.set({});
    this.editing.set('new');
  }
  protected edit(p: SubscriptionPlan) {
    this.formError.set('');
    this.limitErrors.set({});
    this.form.reset({ name: p.name, code: p.code, description: p.description ?? '', monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice });
    this.form.controls.code.disable(); // the code is permanent
    this.isActive.set(p.isActive);
    this.draftFeatures.set({ ...p.features });
    this.draftLimits.set(Object.fromEntries(Object.entries(p.limits).map(([k, v]) => [k, v === null ? '' : String(v)])));
    this.editing.set(p);
  }

  protected limitValue(key: string) { return this.draftLimits()[key] ?? ''; }
  protected limitError(key: string) { return this.limitErrors()[key] ?? ''; }
  protected setLimit(key: string, value: string) { this.draftLimits.update((d) => ({ ...d, [key]: value })); }

  /** The limits as the API wants them: a whole number, or null for no limit. Returns null (and shows why) if a box holds something else. */
  private limitsBody(): Record<string, number | null> | null {
    const out: Record<string, number | null> = {};
    const errors: Record<string, string> = {};
    for (const d of this.meta()?.limits ?? []) {
      const raw = (this.draftLimits()[d.key] ?? '').trim();
      if (raw === '') { out[d.key] = null; continue; }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 1000000) errors[d.key] = 'Use a whole number of 1 or more, or leave it empty';
      else out[d.key] = n;
    }
    this.limitErrors.set(errors);
    return Object.keys(errors).length ? null : out;
  }

  protected save() {
    const e = this.editing();
    if (!e) return;
    this.formError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const limits = this.limitsBody();
    if (!limits) return;

    const v = this.form.getRawValue();
    const body: PlanInput = {
      name: v.name.trim(),
      description: v.description.trim() === '' ? null : v.description.trim(),
      monthlyPrice: v.monthlyPrice ?? 0,
      yearlyPrice: v.yearlyPrice === null || (v.yearlyPrice as unknown) === '' ? null : v.yearlyPrice,
      features: this.draftFeatures(),
      limits,
      isActive: this.isActive(),
    };
    this.busy.set('save');
    const call = e === 'new'
      ? this.api.createPlan({ ...body, code: v.code.trim().toLowerCase(), name: body.name!, monthlyPrice: body.monthlyPrice! })
      : this.api.updatePlan(e.id, body);
    call.subscribe({
      next: (saved) => {
        this.busy.set('');
        this.editing.set(null);
        this.toast.success(e === 'new' ? `${saved.name} created` : `${saved.name} saved`);
        this.load();
      },
      error: (err) => {
        this.busy.set('');
        const info = parseError(err);
        if (!applyFieldErrors(this.form, info)) this.formError.set(info.message);
      },
    });
  }

  protected toggleActive(p: SubscriptionPlan) {
    this.busy.set(p.id);
    this.api.updatePlan(p.id, { isActive: !p.isActive }).subscribe({
      next: (saved) => {
        this.busy.set('');
        this.toast.success(saved.isActive ? `${saved.name} is on offer again` : `${saved.name} is no longer offered to new parlours`);
        this.load();
      },
      error: (err) => { this.busy.set(''); this.toast.error(parseError(err).message); },
    });
  }
}
