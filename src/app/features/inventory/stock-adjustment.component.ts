import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { fmtChange, fmtQty, fmtWhen, orNull } from '../../core/inventory';
import { InventoryProduct, StockMovement } from '../../core/models';
import { ToastService } from '../../core/toast.service';

/** Corrects the stock after a count or a breakage. Needs a reason, and is recorded as one adjustment movement. */
@Component({
  selector: 'app-inventory-adjustment',
  imports: [ReactiveFormsModule],
  template: `
    <h2>Stock adjustment</h2>
    <p class="muted" style="margin: 4px 0 14px">Use this after counting the shelf, or to fix a mistake. The old number is kept in the history, never overwritten.</p>

    @if (loadError()) {
      <div class="panel empty"><h3>Could not load products</h3><p>{{ loadError() }}</p><button class="btn btn-secondary" (click)="loadProducts()">Try again</button></div>
    } @else {
      <form class="panel stack" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
        <div class="form-grid">
          <div class="field" [class.invalid]="err('productId')">
            <label class="label" for="ad-product">Product</label>
            <select id="ad-product" class="select" formControlName="productId">
              <option value="">Choose a product…</option>
              @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.sku ? ' (' + p.sku + ')' : '' }}</option> }
            </select>
            @if (selected(); as p) { <span class="hint">Recorded stock: <strong>{{ qty(p.currentStock) }} {{ p.unit }}</strong></span> }
            @if (err('productId'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field">
            <span class="label" id="ad-mode">How do you want to adjust?</span>
            <div class="row" role="radiogroup" aria-labelledby="ad-mode" style="gap: 16px">
              <label class="check"><input type="radio" value="count" formControlName="mode" /> I counted the stock</label>
              <label class="check"><input type="radio" value="change" formControlName="mode" /> Add or remove an amount</label>
            </div>
          </div>
          <div class="field" [class.invalid]="err('amount')">
            <label class="label" for="ad-amount">{{ form.controls.mode.value === 'count' ? 'Counted quantity' : 'Change (+ adds, − removes)' }}</label>
            <input id="ad-amount" class="input" type="number" step="0.001" inputmode="decimal" formControlName="amount" />
            @if (diff() !== null) { <span class="hint">That is a change of <strong>{{ change(diff()!) }}</strong>, leaving <strong>{{ qty(after()!) }} {{ selected()?.unit }}</strong>.</span> }
            @if (err('amount'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('reason')">
            <label class="label" for="ad-reason">Reason</label>
            <input id="ad-reason" class="input" formControlName="reason" autocomplete="off" list="ad-reasons" placeholder="e.g. Stock take" />
            <datalist id="ad-reasons"><option value="Stock take"></option><option value="Damaged"></option><option value="Lost"></option><option value="Data entry mistake"></option><option value="Found extra stock"></option></datalist>
            @if (err('reason'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
        </div>
        <div class="field">
          <label class="label" for="ad-notes">Notes <span class="muted small">(optional)</span></label>
          <input id="ad-notes" class="input" formControlName="notes" autocomplete="off" />
        </div>
        <div class="row" style="justify-content: flex-end">
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save adjustment' }}</button>
        </div>
      </form>
    }

    <section class="panel" style="margin-top: 16px">
      <h3>Recent adjustments</h3>
      @if (recent().length === 0) { <p class="muted">No adjustments yet.</p> } @else {
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Product</th><th class="num">Before</th><th class="num">Change</th><th class="num">After</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            @for (m of recent(); track m.id) {
              <tr><td class="small">{{ when(m.createdAt) }}</td><td>{{ m.productName }}</td><td class="num">{{ qty(m.quantityBefore) }}</td>
                <td class="num" [class.good]="m.quantityChange > 0" [class.bad]="m.quantityChange < 0">{{ change(m.quantityChange) }}</td>
                <td class="num">{{ qty(m.quantityAfter) }}</td><td class="small">{{ m.reason }}</td><td class="small">{{ m.createdBy || '' }}</td></tr>
            }
          </tbody>
        </table></div>
      }
    </section>`,
  styles: [`.check { display: flex; gap: 8px; align-items: center; } .good { color: var(--sage); font-weight: 600; } .bad { color: var(--brick); }`],
})
export class StockAdjustmentComponent {
  private readonly api = inject(InventoryApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly products = signal<InventoryProduct[]>([]);
  protected readonly recent = signal<StockMovement[]>([]);
  protected readonly loadError = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly qty = fmtQty;
  protected readonly change = fmtChange;
  protected readonly when = fmtWhen;

  protected readonly form = this.fb.group({
    productId: ['', [Validators.required]],
    mode: ['count' as 'count' | 'change'],
    amount: [null as number | null, [Validators.required]],
    reason: ['', [Validators.required, Validators.maxLength(120)]],
    notes: [''],
  });
  private readonly productId = signal('');
  private readonly amount = signal<number | null>(null);
  private readonly mode = signal<'count' | 'change'>('count');
  protected readonly selected = computed(() => this.products().find((p) => p.id === this.productId()) ?? null);
  /** The change this would make, worked out for the person to read. The server works it out again from the live stock. */
  protected readonly diff = computed(() => {
    const p = this.selected();
    const a = this.amount();
    if (!p || a === null || Number.isNaN(a)) return null;
    return Math.round(((this.mode() === 'count' ? a - p.currentStock : a)) * 1000) / 1000;
  });
  protected readonly after = computed(() => { const p = this.selected(); const d = this.diff(); return p && d !== null ? Math.round((p.currentStock + d) * 1000) / 1000 : null; });

  constructor() {
    this.form.controls.productId.valueChanges.subscribe((v) => this.productId.set(v));
    this.form.controls.amount.valueChanges.subscribe((v) => this.amount.set(v === null || (v as unknown) === '' ? null : Number(v)));
    this.form.controls.mode.valueChanges.subscribe((v) => this.mode.set(v));
    this.loadProducts();
    this.loadRecent();
  }

  protected loadProducts() {
    this.loadError.set('');
    // An inactive product can still be counted, so list them all.
    this.api.products({ status: 'all', limit: 100 }).subscribe({ next: (r) => this.products.set(r.items), error: (e) => this.loadError.set(parseError(e).message) });
  }
  private loadRecent() { this.api.movements({ type: 'adjustment', limit: 10 }).subscribe({ next: (r) => this.recent.set(r.items), error: () => undefined }); }

  protected err(name: string) { return controlError(this.form.get(name), { required: name === 'productId' ? 'Choose a product' : name === 'amount' ? 'Enter a number' : 'Required' }); }

  protected save() {
    this.formError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.diff() === 0) { this.formError.set('That is the same as the stock already recorded, so there is nothing to adjust.'); return; }
    const v = this.form.getRawValue();
    this.busy.set(true);
    const body = { productId: v.productId, reason: v.reason.trim(), notes: orNull(v.notes), ...(v.mode === 'count' ? { newQuantity: Number(v.amount) } : { change: Number(v.amount) }) };
    this.api.adjust(body).subscribe({
      next: (m) => {
        this.busy.set(false);
        this.toast.success(`${m.productName} adjusted to ${fmtQty(m.quantityAfter)}`);
        this.form.reset({ productId: v.productId, mode: v.mode, amount: null, reason: '', notes: '' });
        this.loadProducts();
        this.loadRecent();
      },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (!applyFieldErrors(this.form, info)) this.formError.set(info.message);
        if (info.code === 'INSUFFICIENT_STOCK' || info.code === 'NO_CHANGE') this.loadProducts();
      },
    });
  }
}
