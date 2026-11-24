import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventoryApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { MOVEMENT_LABEL, STATE_LABEL, fmtChange, fmtQty, fmtWhen, stateBadge } from '../../core/inventory';
import { InventoryDashboard } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { MoneyPipe } from '../../shared/money.pipe';

@Component({
  selector: 'app-inventory-dashboard',
  imports: [RouterLink, MoneyPipe],
  template: `
    <h2 class="sr-only">Inventory dashboard</h2>
    @if (loading()) {
      <div class="skeleton" style="height: 260px"></div>
    } @else if (error()) {
      <div class="panel empty"><h3>Could not load the inventory dashboard</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
    } @else {
     @if (d(); as d) {
      <div class="tiles">
        <div class="tile"><span class="muted">Products</span><strong>{{ d.totalProducts }}</strong></div>
        <div class="tile"><span class="muted">Stock value (at cost)</span><strong>{{ d.stockValue | money: true }}</strong></div>
        <div class="tile" [class.warn]="d.lowStockCount > 0"><span class="muted">Low stock</span><strong>{{ d.lowStockCount }}</strong></div>
        <div class="tile" [class.bad]="d.outOfStockCount > 0"><span class="muted">Out of stock</span><strong>{{ d.outOfStockCount }}</strong></div>
      </div>

      @if (d.totalProducts === 0) {
        <div class="panel empty"><h3>No products yet</h3><p>Add the products you use or sell, then record what you have in stock.</p><a class="btn btn-primary" routerLink="../products/new">Add the first product</a></div>
      }

      <div class="grid2">
        <section class="panel">
          <h3>Needs attention</h3>
          @if (d.needsAttention.length === 0) { <p class="muted">Nothing is low or out of stock.</p> } @else {
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Product</th><th class="num">In stock</th><th class="num">Minimum</th><th>Status</th></tr></thead>
              <tbody>
                @for (p of d.needsAttention; track p.id) {
                  <tr><td><strong>{{ p.name }}</strong></td><td class="num">{{ qty(p.currentStock) }} {{ p.unit }}</td><td class="num muted">{{ qty(p.minStock) }}</td><td><span class="badge" [class]="badge(p.state)">{{ label[p.state ?? 'ok'] }}</span></td></tr>
                }
              </tbody>
            </table></div>
          }
        </section>

        <section class="panel">
          <h3>Recent purchases</h3>
          @if (d.recentPurchases.length === 0) { <p class="muted">No purchases recorded yet.</p> } @else {
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Date</th><th>Supplier</th><th class="num">Total</th></tr></thead>
              <tbody>
                @for (p of d.recentPurchases; track p.id) {
                  <tr><td>{{ p.purchaseDate }}</td><td>{{ p.supplierName || '—' }}<div class="muted small">{{ p.invoiceNumber }}</div></td><td class="num">{{ p.totalAmount | money: true }}</td></tr>
                }
              </tbody>
            </table></div>
          }
        </section>
      </div>

      <section class="panel" style="margin-top: 16px">
        <h3>Recent stock movements</h3>
        @if (d.recentMovements.length === 0) { <p class="muted">No stock has moved yet.</p> } @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th>When</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Reason</th></tr></thead>
            <tbody>
              @for (m of d.recentMovements; track m.id) {
                <tr><td class="small">{{ when(m.createdAt) }}</td><td>{{ m.productName }}</td><td>{{ moveLabel[m.type] }}</td>
                  <td class="num" [class.good]="m.quantityChange > 0" [class.bad]="m.quantityChange < 0">{{ change(m.quantityChange) }}</td>
                  <td class="num">{{ qty(m.quantityAfter) }}</td><td class="small">{{ m.reason || m.supplierName || '' }}</td></tr>
              }
            </tbody>
          </table></div>
        }
      </section>

      <section class="panel" style="margin-top: 16px">
        <h3>Stock rule</h3>
        <label class="check">
          <input type="checkbox" [checked]="allowNegative()" [disabled]="savingRule()" (change)="setNegative($any($event.target).checked)" />
          <span>Allow stock to go below zero</span>
        </label>
        <p class="hint">Off by default: stock out and adjustments that would take a product below zero are refused. Turn it on only if you record usage before deliveries.</p>
      </section>
     }
    }`,
  styles: [`
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .tile { display: grid; gap: 4px; padding: 14px 16px; background: var(--surface, #fff); border: 1px solid var(--line); border-radius: 12px; }
    .tile strong { font-size: 1.6rem; }
    .tile.warn strong { color: var(--amber, #b7791f); } .tile.bad strong { color: var(--brick); }
    .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
    .good { color: var(--sage); font-weight: 600; } .bad { color: var(--brick); }
    .check { display: flex; gap: 10px; align-items: center; }
  `],
})
export class InventoryDashboardComponent {
  private readonly api = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  protected readonly d = signal<InventoryDashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly allowNegative = signal(false);
  protected readonly savingRule = signal(false);
  protected readonly label = STATE_LABEL;
  protected readonly moveLabel = MOVEMENT_LABEL;
  protected readonly qty = fmtQty;
  protected readonly change = fmtChange;
  protected readonly when = fmtWhen;
  protected readonly badge = stateBadge;

  constructor() { this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.dashboard().subscribe({
      next: (d) => { this.d.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
    this.api.settings().subscribe({ next: (s) => this.allowNegative.set(s.allowNegativeStock), error: () => undefined });
  }

  protected setNegative(on: boolean) {
    this.savingRule.set(true);
    this.api.updateSettings(on).subscribe({
      next: (s) => { this.allowNegative.set(s.allowNegativeStock); this.savingRule.set(false); this.toast.success(s.allowNegativeStock ? 'Stock may now go below zero' : 'Stock can no longer go below zero'); },
      error: (e) => { this.savingRule.set(false); this.allowNegative.set(!on); this.toast.error(parseError(e).message); },
    });
  }
}
