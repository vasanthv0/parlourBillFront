import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { MOVEMENT_LABEL, fmtChange, fmtQty, fmtWhen, orNull } from '../../core/inventory';
import { InventoryProduct, InventorySupplier, StockMovement } from '../../core/models';
import { ToastService } from '../../core/toast.service';

/** Stock in (goods arrive) and stock out (used, damaged, expired…). Every save writes one movement; the balance is never typed in. */
@Component({
  selector: 'app-inventory-stock',
  imports: [ReactiveFormsModule, FormsModule],
  template: `
    <h2>Stock in / out</h2>
    <div class="seg" role="group" aria-label="Direction" style="margin: 10px 0 16px">
      <button type="button" class="btn btn-sm" [class.btn-primary]="mode() === 'in'" [class.btn-secondary]="mode() !== 'in'" [attr.aria-pressed]="mode() === 'in'" (click)="setMode('in')">Stock in</button>
      <button type="button" class="btn btn-sm" [class.btn-primary]="mode() === 'out'" [class.btn-secondary]="mode() !== 'out'" [attr.aria-pressed]="mode() === 'out'" (click)="setMode('out')">Stock out</button>
    </div>

    @if (loadError()) {
      <div class="panel empty"><h3>Could not load products</h3><p>{{ loadError() }}</p><button class="btn btn-secondary" (click)="loadProducts()">Try again</button></div>
    } @else if (!loadingProducts() && products().length === 0) {
      <div class="panel empty"><h3>No active products</h3><p>Add a product first, then record stock for it.</p></div>
    } @else {
      <form class="panel stack" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
        <div class="form-grid">
          <div class="field" [class.invalid]="err('productId')">
            <label class="label" for="sm-product">Product</label>
            <select id="sm-product" class="select" formControlName="productId">
              <option value="">Choose a product…</option>
              @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.sku ? ' (' + p.sku + ')' : '' }}</option> }
            </select>
            @if (selected(); as p) { <span class="hint">In stock now: <strong>{{ qty(p.currentStock) }} {{ p.unit }}</strong>@if (preview() !== null) { · after this: <strong>{{ qty(preview()!) }} {{ p.unit }}</strong> }</span> }
            @if (err('productId'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('quantity')">
            <label class="label" for="sm-qty">Quantity{{ selected() ? ' (' + selected()!.unit + ')' : '' }}</label>
            <input id="sm-qty" class="input" type="number" step="0.001" min="0" inputmode="decimal" formControlName="quantity" />
            @if (err('quantity'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          @if (mode() === 'in') {
            <div class="field" [class.invalid]="err('unitCost')">
              <label class="label" for="sm-cost">Cost per unit <span class="muted small">(optional)</span></label>
              <span class="input-prefix"><span class="prefix">₹</span><input id="sm-cost" class="input" type="number" step="0.01" min="0" inputmode="decimal" formControlName="unitCost" /></span>
              @if (err('unitCost'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field">
              <label class="label" for="sm-sup">Supplier <span class="muted small">(optional)</span></label>
              <select id="sm-sup" class="select" formControlName="supplierId">
                <option value="">No supplier</option>
                @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
          }
          <div class="field" [class.invalid]="err('reason')">
            <label class="label" for="sm-reason">{{ mode() === 'out' ? 'Reason' : 'Reason (optional)' }}</label>
            <input id="sm-reason" class="input" formControlName="reason" autocomplete="off" list="sm-reasons" [placeholder]="mode() === 'out' ? 'e.g. Used on clients' : 'e.g. Delivery'" />
            <datalist id="sm-reasons">@for (r of reasons(); track r) { <option [value]="r"></option> }</datalist>
            @if (err('reason'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field">
            <label class="label" for="sm-ref">Reference <span class="muted small">(optional)</span></label>
            <input id="sm-ref" class="input" formControlName="reference" autocomplete="off" placeholder="Delivery challan or bill number" />
          </div>
        </div>
        <div class="field">
          <label class="label" for="sm-notes">Notes <span class="muted small">(optional)</span></label>
          <input id="sm-notes" class="input" formControlName="notes" autocomplete="off" />
        </div>
        <div class="row" style="justify-content: flex-end">
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : mode() === 'in' ? 'Add to stock' : 'Take out of stock' }}</button>
        </div>
      </form>
    }

    <section class="panel" style="margin-top: 16px">
      <h3>Latest movements</h3>
      @if (recent().length === 0) { <p class="muted">Nothing recorded yet.</p> } @else {
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            @for (m of recent(); track m.id) {
              <tr><td class="small">{{ when(m.createdAt) }}</td><td>{{ m.productName }}</td><td>{{ label[m.type] }}</td>
                <td class="num" [class.good]="m.quantityChange > 0" [class.bad]="m.quantityChange < 0">{{ change(m.quantityChange) }}</td>
                <td class="num">{{ qty(m.quantityAfter) }}</td><td class="small">{{ m.reason || '' }}</td><td class="small">{{ m.createdBy || '' }}</td></tr>
            }
          </tbody>
        </table></div>
      }
    </section>`,
  styles: [`.seg { display: flex; gap: 8px; } .good { color: var(--sage); font-weight: 600; } .bad { color: var(--brick); }`],
})
export class StockMovementComponent {
  private readonly api = inject(InventoryApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly mode = signal<'in' | 'out'>('in');
  protected readonly products = signal<InventoryProduct[]>([]);
  protected readonly suppliers = signal<InventorySupplier[]>([]);
  protected readonly recent = signal<StockMovement[]>([]);
  protected readonly loadingProducts = signal(true);
  protected readonly loadError = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly label = MOVEMENT_LABEL;
  protected readonly qty = fmtQty;
  protected readonly change = fmtChange;
  protected readonly when = fmtWhen;

  protected readonly form = this.fb.group({
    productId: ['', [Validators.required]],
    quantity: [null as number | null, [Validators.required, Validators.min(0.001)]],
    unitCost: [null as number | null, [Validators.min(0)]],
    supplierId: [''],
    reason: [''],
    reference: [''],
    notes: [''],
  });
  private readonly productId = signal('');
  private readonly quantity = signal(0);
  protected readonly selected = computed(() => this.products().find((p) => p.id === this.productId()) ?? null);
  protected readonly preview = computed(() => {
    const p = this.selected();
    return p && this.quantity() > 0 ? p.currentStock + (this.mode() === 'in' ? 1 : -1) * this.quantity() : null;
  });
  protected readonly reasons = computed(() => (this.mode() === 'in' ? ['Delivery', 'Returned by customer', 'Transfer in'] : ['Used on clients', 'Damaged', 'Expired', 'Sold at the counter', 'Returned to supplier']));

  constructor() {
    this.form.controls.productId.valueChanges.subscribe((v) => this.productId.set(v));
    this.form.controls.quantity.valueChanges.subscribe((v) => this.quantity.set(Number(v) || 0));
    this.api.suppliers().subscribe({ next: (s) => this.suppliers.set(s), error: () => undefined });
    this.loadProducts();
    this.loadRecent();
  }

  protected setMode(m: 'in' | 'out') {
    this.mode.set(m);
    this.formError.set('');
    this.form.controls.reason.setValidators(m === 'out' ? [Validators.required, Validators.maxLength(120)] : [Validators.maxLength(120)]);
    this.form.controls.reason.updateValueAndValidity();
  }

  protected loadProducts() {
    this.loadingProducts.set(true);
    this.loadError.set('');
    this.api.products({ status: 'active', limit: 100 }).subscribe({
      next: (r) => { this.products.set(r.items); this.loadingProducts.set(false); },
      error: (e) => { this.loadError.set(parseError(e).message); this.loadingProducts.set(false); },
    });
  }
  private loadRecent() { this.api.movements({ limit: 10 }).subscribe({ next: (r) => this.recent.set(r.items), error: () => undefined }); }

  protected err(name: string) { return controlError(this.form.get(name), { required: name === 'productId' ? 'Choose a product' : 'Required' }); }

  protected save() {
    this.formError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.busy.set(true);
    const common = { productId: v.productId, quantity: Number(v.quantity), reference: orNull(v.reference), notes: orNull(v.notes) };
    const call = this.mode() === 'in'
      ? this.api.stockIn({ ...common, reason: orNull(v.reason), supplierId: v.supplierId || null, ...(v.unitCost === null || (v.unitCost as unknown) === '' ? {} : { unitCost: Number(v.unitCost) }) })
      : this.api.stockOut({ ...common, reason: v.reason.trim() });
    call.subscribe({
      next: (m) => {
        this.busy.set(false);
        this.toast.success(`${this.label[m.type]}: ${m.productName} is now ${fmtQty(m.quantityAfter)}`);
        this.form.reset({ productId: v.productId, quantity: null, unitCost: null, supplierId: '', reason: '', reference: '', notes: '' });
        this.loadProducts();
        this.loadRecent();
      },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (!applyFieldErrors(this.form, info)) this.formError.set(info.message); // e.g. "Not enough stock of X: 3 available, 5 needed."
        if (info.code === 'INSUFFICIENT_STOCK') this.loadProducts();
      },
    });
  }
}
