import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { MOVEMENT_LABEL, STATE_LABEL, fmtChange, fmtQty, fmtWhen, stateBadge } from '../../core/inventory';
import { InventoryProduct, InventoryPurchase, MovementType, PageMeta, StockMovement, ValuationReport } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';

type Tab = 'stock' | 'low' | 'movements' | 'purchases' | 'valuation';

/** Five read-only reports. Dates are days on the parlour's calendar. */
@Component({
  selector: 'app-inventory-reports',
  imports: [FormsModule, MoneyPipe, IconComponent],
  template: `
    <h2>Reports</h2>
    <div class="seg" role="tablist" aria-label="Report" style="margin: 10px 0 14px">
      @for (t of tabs; track t.key) {
        <button type="button" role="tab" class="btn btn-sm" [class.btn-primary]="tab() === t.key" [class.btn-secondary]="tab() !== t.key" [attr.aria-selected]="tab() === t.key" (click)="open(t.key)">{{ t.label }}</button>
      }
    </div>

    @if (tab() === 'movements' || tab() === 'purchases') {
      <div class="filters">
        <label class="field-inline">From <input class="input" type="date" aria-label="From date" [ngModel]="from()" (ngModelChange)="from.set($event); reload()" /></label>
        <label class="field-inline">To <input class="input" type="date" aria-label="To date" [ngModel]="to()" (ngModelChange)="to.set($event); reload()" /></label>
        @if (tab() === 'movements') {
          <select class="select" aria-label="Movement type" [ngModel]="type()" (ngModelChange)="type.set($event); reload()">
            <option value="">All types</option><option value="stock_in">Stock in</option><option value="stock_out">Stock out</option><option value="adjustment">Adjustment</option><option value="purchase">Purchase</option>
          </select>
        }
      </div>
    }

    @if (loading()) {
      <div class="skeleton" style="height: 240px"></div>
    } @else if (error()) {
      <div class="panel empty"><h3>Could not load the report</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
    } @else {
      <p class="summary" aria-live="polite">{{ summary() }}</p>

      @if (tab() === 'stock' || tab() === 'low') {
        @if (products().length === 0) { <div class="panel empty"><h3>{{ tab() === 'low' ? 'Nothing is low or out of stock' : 'No products' }}</h3></div> } @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Product</th><th>Category</th><th class="num">In stock</th><th class="num">Minimum</th>@if (tab() === 'stock') { <th class="num">Purchase price</th><th class="num">Value</th> }<th>Status</th></tr></thead>
            <tbody>
              @for (p of products(); track p.id) {
                <tr><td><strong>{{ p.name }}</strong><div class="muted small">{{ p.sku }}</div></td><td>{{ p.category || '—' }}</td>
                  <td class="num">{{ qty(p.currentStock) }} <span class="muted small">{{ p.unit }}</span></td><td class="num muted">{{ qty(p.minStock) }}</td>
                  @if (tab() === 'stock') { <td class="num">{{ p.purchasePrice | money: true }}</td><td class="num">{{ (p.stockValue ?? 0) | money: true }}</td> }
                  <td><span class="badge" [class]="badge(p.state)">{{ stateLabel[p.state ?? 'ok'] }}</span></td></tr>
              }
            </tbody>
          </table></div>
        }
      }

      @if (tab() === 'movements') {
        @if (movements().length === 0) { <div class="panel empty"><h3>No stock movements in this range</h3></div> } @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th>When</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Before</th><th class="num">After</th><th>Reason / supplier</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>
              @for (m of movements(); track m.id) {
                <tr><td class="small">{{ when(m.createdAt) }}</td><td>{{ m.productName }}</td><td>{{ moveLabel[m.type] }}</td>
                  <td class="num" [class.good]="m.quantityChange > 0" [class.bad]="m.quantityChange < 0">{{ change(m.quantityChange) }}</td>
                  <td class="num muted">{{ qty(m.quantityBefore) }}</td><td class="num">{{ qty(m.quantityAfter) }}</td>
                  <td class="small">{{ m.reason || '' }} {{ m.supplierName || '' }}</td><td class="small">{{ m.reference || '' }}</td><td class="small">{{ m.createdBy || '' }}</td></tr>
              }
            </tbody>
          </table></div>
        }
      }

      @if (tab() === 'purchases') {
        @if (purchases().length === 0) { <div class="panel empty"><h3>No purchases in this range</h3></div> } @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Date</th><th>Supplier</th><th>Bill no.</th><th>Products</th><th class="num">Total</th></tr></thead>
            <tbody>
              @for (p of purchases(); track p.id) {
                <tr><td>{{ p.purchaseDate }}</td><td>{{ p.supplierName || '—' }}</td><td>{{ p.invoiceNumber || '—' }}</td>
                  <td class="small">@for (i of p.items ?? []; track i.productId) { <div>{{ i.productName }} × {{ qty(i.quantity) }}</div> }</td><td class="num">{{ p.totalAmount | money: true }}</td></tr>
              }
            </tbody>
          </table></div>
        }
      }

      @if (tab() === 'valuation' && valuation(); as v) {
        @if (v.data.length === 0) { <div class="panel empty"><h3>No stock to value</h3><p>Products with no stock are left out.</p></div> } @else {
          <h3>By category</h3>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Category</th><th class="num">Products</th><th class="num">Value at cost</th><th class="num">Value at selling price</th></tr></thead>
            <tbody>@for (c of v.byCategory; track c.category) { <tr><td>{{ c.category }}</td><td class="num">{{ c.products }}</td><td class="num">{{ c.costValue | money: true }}</td><td class="num">{{ c.retailValue | money: true }}</td></tr> }</tbody>
            <tfoot><tr><th>Total</th><th class="num">{{ v.summary.products }}</th><th class="num">{{ v.summary.costValue | money: true }}</th><th class="num">{{ v.summary.retailValue | money: true }}</th></tr></tfoot>
          </table></div>
          <h3 style="margin-top: 16px">By product</h3>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Product</th><th class="num">In stock</th><th class="num">Purchase price</th><th class="num">Value at cost</th><th class="num">Selling price</th><th class="num">Value at selling price</th></tr></thead>
            <tbody>@for (p of v.data; track p.id) { <tr><td>{{ p.name }}</td><td class="num">{{ qty(p.currentStock) }} {{ p.unit }}</td><td class="num">{{ p.purchasePrice | money: true }}</td><td class="num">{{ (p.stockValue ?? 0) | money: true }}</td><td class="num">{{ p.sellingPrice | money: true }}</td><td class="num">{{ (p.retailValue ?? 0) | money: true }}</td></tr> }</tbody>
          </table></div>
          <p class="hint">Value is quantity × the product's current purchase price. It is not a weighted average of past purchases.</p>
        }
      }

      @if (tab() !== 'valuation' && meta().pages > 1) {
        <div class="pager">
          <span>{{ meta().total }} rows</span>
          <div class="row">
            <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
            <span>Page {{ meta().page }} of {{ meta().pages }}</span>
            <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
          </div>
        </div>
      }
    }`,
  styles: [`
    .seg { display: flex; gap: 8px; flex-wrap: wrap; }
    .filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    .field-inline { display: flex; gap: 6px; align-items: center; }
    .summary { margin: 0 0 10px; color: var(--muted); }
    .pager { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
    .good { color: var(--sage); font-weight: 600; } .bad { color: var(--brick); }
  `],
})
export class InventoryReportsComponent {
  private readonly api = inject(InventoryApi);

  protected readonly tabs: { key: Tab; label: string }[] = [
    { key: 'stock', label: 'Current stock' }, { key: 'low', label: 'Low stock' }, { key: 'movements', label: 'Stock movements' },
    { key: 'purchases', label: 'Purchase history' }, { key: 'valuation', label: 'Stock valuation' },
  ];
  protected readonly tab = signal<Tab>('stock');
  protected readonly products = signal<InventoryProduct[]>([]);
  protected readonly movements = signal<StockMovement[]>([]);
  protected readonly purchases = signal<InventoryPurchase[]>([]);
  protected readonly valuation = signal<ValuationReport | null>(null);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 25, total: 0, pages: 1 });
  protected readonly summary = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly type = signal<MovementType | ''>('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly qty = fmtQty;
  protected readonly change = fmtChange;
  protected readonly when = fmtWhen;
  protected readonly badge = stateBadge;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly moveLabel = MOVEMENT_LABEL;

  constructor() { this.load(); }

  protected open(t: Tab) { this.tab.set(t); this.reload(); }
  protected reload() { this.meta.update((m) => ({ ...m, page: 1 })); this.load(); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    const page = this.meta().page;
    const limit = 25;
    const done = () => this.loading.set(false);
    const fail = (e: unknown) => { this.error.set(parseError(e).message); this.loading.set(false); };
    const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
    switch (this.tab()) {
      case 'stock':
        this.api.reportCurrentStock({ status: 'active', page, limit }).subscribe({ next: (r) => { this.products.set(r.items); this.meta.set(r.meta); this.summary.set(`${r.summary.products} products · stock value ${money(r.summary.stockValue)}`); done(); }, error: fail });
        break;
      case 'low':
        this.api.reportLowStock({ page, limit }).subscribe({ next: (r) => { this.products.set(r.items); this.meta.set(r.meta); this.summary.set(`${r.summary.lowStock} low · ${r.summary.outOfStock} out of stock`); done(); }, error: fail });
        break;
      case 'movements':
        this.api.reportMovements({ from: this.from(), to: this.to(), type: this.type(), page, limit }).subscribe({ next: (r) => { this.movements.set(r.items); this.meta.set(r.meta); this.summary.set(`${fmtQty(r.summary.quantityIn)} units in · ${fmtQty(r.summary.quantityOut)} units out`); done(); }, error: fail });
        break;
      case 'purchases':
        this.api.reportPurchases({ from: this.from(), to: this.to(), page, limit }).subscribe({ next: (r) => { this.purchases.set(r.items); this.meta.set(r.meta); this.summary.set(`${r.summary.purchases} purchases · ${money(r.summary.totalAmount)}`); done(); }, error: fail });
        break;
      case 'valuation':
        this.api.reportValuation().subscribe({ next: (r) => { this.valuation.set(r); this.summary.set(`${r.summary.products} products in stock · cost ${money(r.summary.costValue)} · at selling price ${money(r.summary.retailValue)}`); done(); }, error: fail });
        break;
    }
  }
}
