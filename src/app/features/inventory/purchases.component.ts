import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { fmtQty, orNull } from '../../core/inventory';
import { InventoryProduct, InventoryPurchase, InventorySupplier, PageMeta } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

/** Purchase history, and a form to record a new purchase: supplier, bill number, and the products with quantity and cost. Saving adds the stock. */
@Component({
  selector: 'app-inventory-purchases',
  imports: [ReactiveFormsModule, FormsModule, MoneyPipe, IconComponent, ModalComponent],
  template: `
    <div class="row spread" style="margin-bottom: 14px">
      <h2>Purchases</h2>
      <button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" /> New purchase</button>
    </div>

    <div class="filters">
      <label class="field-inline">From <input class="input" type="date" aria-label="From date" [ngModel]="from()" (ngModelChange)="setRange('from', $event)" /></label>
      <label class="field-inline">To <input class="input" type="date" aria-label="To date" [ngModel]="to()" (ngModelChange)="setRange('to', $event)" /></label>
      <select class="select" aria-label="Supplier" [ngModel]="supplierFilter()" (ngModelChange)="supplierFilter.set($event); reload()">
        <option value="">All suppliers</option>
        @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
      </select>
    </div>

    @if (loading()) {
      <div class="skeleton" style="height: 220px"></div>
    } @else if (error()) {
      <div class="panel empty"><h3>Could not load purchases</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
    } @else if (items().length === 0) {
      <div class="panel empty"><h3>No purchases</h3><p>Record what you buy from suppliers. The stock goes up and the purchase is kept here.</p><button class="btn btn-primary" (click)="openForm()">Record a purchase</button></div>
    } @else {
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Supplier</th><th>Bill no.</th><th>Products</th><th class="num">Total</th><th>Entered by</th></tr></thead>
        <tbody>
          @for (p of items(); track p.id) {
            <tr><td>{{ p.purchaseDate }}</td><td>{{ p.supplierName || '—' }}</td><td>{{ p.invoiceNumber || '—' }}</td>
              <td class="small">@for (i of p.items ?? []; track i.productId) { <div>{{ i.productName }} × {{ qty(i.quantity) }} &#64; {{ i.unitCost | money: true }}</div> }</td>
              <td class="num"><strong>{{ p.totalAmount | money: true }}</strong></td><td class="small">{{ p.createdBy || '' }}</td></tr>
          }
        </tbody>
      </table></div>
      <div class="pager">
        <span>{{ meta().total }} purchase{{ meta().total === 1 ? '' : 's' }} · {{ totalAmount() | money: true }} in total</span>
        <div class="row">
          <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
          <span>Page {{ meta().page }} of {{ meta().pages }}</span>
          <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
        </div>
      </div>
    }

    @if (formOpen()) {
      <app-modal title="New purchase" [wide]="true" (closed)="formOpen.set(false)">
        <form id="purchase-form" [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
          <div class="form-grid">
            <div class="field">
              <label class="label" for="pu-sup">Supplier</label>
              <select id="pu-sup" class="select" formControlName="supplierId">
                <option value="">Other / not saved</option>
                @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </div>
            @if (!form.controls.supplierId.value) {
              <div class="field"><label class="label" for="pu-supname">Supplier name <span class="muted small">(optional)</span></label><input id="pu-supname" class="input" formControlName="supplierName" autocomplete="off" /></div>
            }
            <div class="field"><label class="label" for="pu-inv">Supplier bill number <span class="muted small">(optional)</span></label><input id="pu-inv" class="input" formControlName="invoiceNumber" autocomplete="off" /></div>
            <div class="field" [class.invalid]="err('purchaseDate')"><label class="label" for="pu-date">Purchase date</label><input id="pu-date" class="input" type="date" formControlName="purchaseDate" />@if (err('purchaseDate'); as m) { <span class="field-error">{{ m }}</span> }</div>
          </div>

          <div class="field" [class.invalid]="linesError()">
            <span class="label">Products bought</span>
            <ul class="lines" formArrayName="items">
              @for (line of lines.controls; track line; let i = $index) {
                <li [formGroupName]="i">
                  <select class="select grow" [attr.aria-label]="'Product ' + (i + 1)" formControlName="productId">
                    <option value="">Choose a product…</option>
                    @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                  </select>
                  <input class="input qty" type="number" step="0.001" min="0" inputmode="decimal" [attr.aria-label]="'Quantity ' + (i + 1)" placeholder="Qty" formControlName="quantity" />
                  <input class="input cost" type="number" step="0.01" min="0" inputmode="decimal" [attr.aria-label]="'Cost per unit ' + (i + 1)" placeholder="Cost each" formControlName="unitCost" />
                  <span class="num lt">{{ lineTotal(i) | money: true }}</span>
                  <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="'Remove line ' + (i + 1)" [disabled]="lines.length === 1" (click)="removeLine(i)"><app-icon name="x" [size]="16" /></button>
                </li>
              }
            </ul>
            <button type="button" class="btn btn-secondary btn-sm" (click)="addLine()"><app-icon name="plus" [size]="16" /> Add another product</button>
            @if (linesError(); as m) { <span class="field-error">{{ m }}</span> }
          </div>

          <div class="row spread">
            <label class="check"><input type="checkbox" formControlName="updatePurchasePrice" /> Update each product's purchase price to this cost</label>
            <div>Total <strong class="num">{{ total() | money: true }}</strong></div>
          </div>
          <div class="field"><label class="label" for="pu-notes">Notes <span class="muted small">(optional)</span></label><input id="pu-notes" class="input" formControlName="notes" autocomplete="off" /></div>
        </form>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="formOpen.set(false)">Cancel</button>
          <button type="submit" form="purchase-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save purchase and add stock' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`
    .filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    .field-inline { display: flex; gap: 6px; align-items: center; }
    .pager { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
    .lines { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 8px; }
    .lines li { display: flex; gap: 8px; align-items: center; }
    .lines .qty { width: 96px; } .lines .cost { width: 110px; } .lines .lt { width: 96px; text-align: right; }
    .check { display: flex; gap: 8px; align-items: center; }
  `],
})
export class PurchasesComponent {
  private readonly api = inject(InventoryApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly items = signal<InventoryPurchase[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly totalAmount = signal(0);
  protected readonly suppliers = signal<InventorySupplier[]>([]);
  protected readonly products = signal<InventoryProduct[]>([]);
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly supplierFilter = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly linesError = signal('');
  protected readonly qty = fmtQty;

  protected readonly form = this.fb.group({
    supplierId: [''], supplierName: [''], invoiceNumber: [''], purchaseDate: ['', [Validators.required]], notes: [''], updatePurchasePrice: [true],
    items: this.fb.array([this.newLine()]),
  });
  protected get lines(): FormArray { return this.form.controls.items as unknown as FormArray; }
  private readonly tick = signal(0); // bumps on every edit so the totals recompute
  protected readonly total = computed(() => { this.tick(); return this.lines.controls.reduce((s, _c, i) => s + this.lineTotalRaw(i), 0); });

  constructor() {
    this.form.valueChanges.subscribe(() => this.tick.update((n) => n + 1));
    this.api.suppliers(true).subscribe({ next: (s) => this.suppliers.set(s), error: () => undefined });
    this.load();
  }

  private newLine() { return this.fb.group({ productId: ['', [Validators.required]], quantity: [null as number | null, [Validators.required, Validators.min(0.001)]], unitCost: [null as number | null, [Validators.required, Validators.min(0)]] }); }
  protected addLine() { this.lines.push(this.newLine()); }
  protected removeLine(i: number) { if (this.lines.length > 1) this.lines.removeAt(i); }
  private lineTotalRaw(i: number) { const v = this.lines.at(i).value as { quantity: number | null; unitCost: number | null }; return Math.round((Number(v.quantity) || 0) * (Number(v.unitCost) || 0) * 100) / 100; }
  protected lineTotal(i: number) { this.tick(); return this.lineTotalRaw(i); }
  protected err(name: string) { return controlError(this.form.get(name), { required: 'Required' }); }

  protected setRange(which: 'from' | 'to', v: string) { (which === 'from' ? this.from : this.to).set(v); this.reload(); }
  protected reload() { this.meta.update((m) => ({ ...m, page: 1 })); this.load(); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.purchases({ from: this.from(), to: this.to(), supplierId: this.supplierFilter(), page: this.meta().page, limit: 20 }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.totalAmount.set(r.summary.totalAmount); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected openForm() {
    this.formError.set('');
    this.linesError.set('');
    while (this.lines.length > 1) this.lines.removeAt(1);
    this.form.reset({ supplierId: '', supplierName: '', invoiceNumber: '', purchaseDate: new Date().toLocaleDateString('en-CA'), notes: '', updatePurchasePrice: true, items: [{ productId: '', quantity: null, unitCost: null }] });
    this.api.products({ status: 'active', limit: 100 }).subscribe({ next: (r) => this.products.set(r.items), error: (e) => this.formError.set(parseError(e).message) });
    this.formOpen.set(true);
  }

  protected save() {
    this.formError.set('');
    this.linesError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); this.linesError.set(this.lines.invalid ? 'Choose a product, a quantity and a cost on every line' : ''); return; }
    const v = this.form.getRawValue();
    const ids = v.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) { this.linesError.set('List each product once and use the quantity instead'); return; }
    this.busy.set(true);
    this.api.createPurchase({
      supplierId: v.supplierId || null, supplierName: v.supplierId ? null : orNull(v.supplierName), invoiceNumber: orNull(v.invoiceNumber), purchaseDate: v.purchaseDate, notes: orNull(v.notes),
      updatePurchasePrice: v.updatePurchasePrice, items: v.items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitCost: Number(i.unitCost) })),
    }).subscribe({
      next: () => { this.busy.set(false); this.formOpen.set(false); this.toast.success('Purchase recorded and stock added'); this.reload(); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.fields['items']) this.linesError.set(info.fields['items']);
        else if (!applyFieldErrors(this.form, info)) this.formError.set(info.message);
      },
    });
  }
}
