import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { InventoryApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { STATE_LABEL, fmtQty, stateBadge } from '../../core/inventory';
import { InventoryProduct, PageMeta } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

@Component({
  selector: 'app-inventory-products',
  imports: [FormsModule, RouterLink, MoneyPipe, IconComponent, ModalComponent],
  template: `
    <div class="row spread" style="margin-bottom: 14px">
      <h2>Products</h2>
      <a class="btn btn-primary" routerLink="new"><app-icon name="plus" /> Add product</a>
    </div>

    <div class="filters">
      <div class="search input-affix">
        <input class="input" type="search" placeholder="Search by name or SKU" aria-label="Search products" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
      </div>
      <select class="select" aria-label="Category" [ngModel]="category()" (ngModelChange)="setFilter('category', $event)">
        <option value="">All categories</option>
        @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
      </select>
      <select class="select" aria-label="Stock level" [ngModel]="stock()" (ngModelChange)="setFilter('stock', $event)">
        <option value="all">Any stock level</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
      </select>
      <select class="select" aria-label="Active or inactive" [ngModel]="status()" (ngModelChange)="setFilter('status', $event)">
        <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
      </select>
    </div>

    @if (loading()) {
      <div class="skeleton" style="height: 260px"></div>
    } @else if (error()) {
      <div class="panel empty"><h3>Could not load products</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
    } @else if (items().length === 0) {
      <div class="panel empty">
        @if (search() || category() || stock() !== 'all' || status() !== 'active') { <h3>No products match</h3><p>Change the search or the filters.</p> }
        @else { <h3>No products yet</h3><p>Add the products you use or sell, like shampoo, colour or gloves.</p><a class="btn btn-primary" routerLink="new">Add the first product</a> }
      </div>
    } @else {
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Product</th><th>Category</th><th class="num">In stock</th><th class="num">Minimum</th><th class="num">Purchase price</th><th class="num">Selling price</th><th class="num">Value</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (p of items(); track p.id) {
              <tr [class.off]="!p.isActive">
                <td><strong>{{ p.name }}</strong><div class="muted small">{{ p.sku || 'No SKU' }}</div></td>
                <td>{{ p.category || '—' }}</td>
                <td class="num">{{ qty(p.currentStock) }} <span class="muted small">{{ p.unit }}</span></td>
                <td class="num muted">{{ qty(p.minStock) }}</td>
                <td class="num">{{ p.purchasePrice | money: true }}</td>
                <td class="num">{{ p.sellingPrice | money: true }}</td>
                <td class="num">{{ (p.stockValue ?? 0) | money: true }}</td>
                <td>
                  @if (!p.isActive) { <span class="badge badge-warn">Inactive</span> }
                  @else { <span class="badge" [class]="badge(p.state)">{{ label[p.state ?? 'ok'] }}</span> }
                </td>
                <td class="cell-actions">
                  <a class="btn btn-ghost btn-sm" [routerLink]="[p.id, 'edit']"><app-icon name="pencil" [size]="16" /> Edit</a>
                  <button type="button" class="btn btn-ghost btn-sm danger" (click)="deleting.set(p)"><app-icon name="trash" [size]="16" /> Delete</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span>{{ meta().total }} product{{ meta().total === 1 ? '' : 's' }}</span>
        <div class="row">
          <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
          <span>Page {{ meta().page }} of {{ meta().pages }}</span>
          <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
        </div>
      </div>
    }

    @if (deleting(); as d) {
      <app-modal title="Delete this product?" (closed)="deleting.set(null)">
        <p>Delete <strong>{{ d.name }}</strong>? A product that has any stock history cannot be deleted. Make it inactive instead (Edit, then untick Active).</p>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="deleting.set(null)">Keep product</button>
          <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="remove(d)">{{ busy() ? 'Deleting…' : 'Delete product' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`
    .filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .filters .search { flex: 1 1 240px; }
    .off td { color: var(--muted); }
    .danger { color: var(--brick); }
    .pager { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
  `],
})
export class ProductsComponent {
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly typed$ = new Subject<string>();

  protected readonly items = signal<InventoryProduct[]>([]);
  protected readonly categories = signal<string[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly search = signal('');
  protected readonly category = signal('');
  protected readonly stock = signal<'all' | 'in' | 'low' | 'out'>('all');
  protected readonly status = signal<'active' | 'inactive' | 'all'>('active');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly deleting = signal<InventoryProduct | null>(null);
  protected readonly busy = signal(false);
  protected readonly label = STATE_LABEL;
  protected readonly qty = fmtQty;
  protected readonly badge = stateBadge;

  constructor() {
    this.typed$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef))).subscribe(() => { this.meta.update((m) => ({ ...m, page: 1 })); this.load(); });
    this.api.categories().subscribe({ next: (c) => this.categories.set(c), error: () => undefined });
    this.load();
  }

  protected onSearch(q: string) { this.search.set(q); this.typed$.next(q.trim()); }
  protected setFilter(kind: 'category' | 'stock' | 'status', value: string) {
    if (kind === 'category') this.category.set(value);
    else if (kind === 'stock') this.stock.set(value as 'all' | 'in' | 'low' | 'out');
    else this.status.set(value as 'active' | 'inactive' | 'all');
    this.meta.update((m) => ({ ...m, page: 1 }));
    this.load();
  }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.products({ search: this.search().trim(), category: this.category(), stock: this.stock(), status: this.status(), page: this.meta().page, limit: 20 }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected remove(p: InventoryProduct) {
    this.busy.set(true);
    this.api.deleteProduct(p.id).subscribe({
      next: () => { this.busy.set(false); this.deleting.set(null); this.toast.success(`${p.name} deleted`); this.load(); },
      error: (e) => { this.busy.set(false); this.deleting.set(null); this.toast.error(parseError(e).message); },
    });
  }
}
