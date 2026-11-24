import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** The Inventory area: a title, a row of section links, and whichever section is open. Admin only (the route and the API both check). */
@Component({
  selector: 'app-inventory-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Inventory</h1><p class="sub">Products and stock for your salon. Nothing is taken out of stock automatically when you bill a service.</p></div>
      </div>
      <nav class="subnav" aria-label="Inventory sections">
        @for (t of tabs; track t.path) { <a [routerLink]="t.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">{{ t.label }}</a> }
      </nav>
      <router-outlet />
    </div>`,
  styles: [`
    .subnav { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
    .subnav a { padding: 9px 14px; border-radius: 8px 8px 0 0; color: var(--muted); text-decoration: none; font-weight: 500; border-bottom: 2px solid transparent; }
    .subnav a:hover { color: var(--ink); }
    .subnav a.active { color: var(--ink); border-bottom-color: var(--accent, currentColor); }
  `],
})
export class InventoryLayoutComponent {
  protected readonly tabs = [
    { path: 'dashboard', label: 'Dashboard' },
    { path: 'products', label: 'Products' },
    { path: 'stock', label: 'Stock in / out' },
    { path: 'adjustments', label: 'Adjustment' },
    { path: 'purchases', label: 'Purchases' },
    { path: 'suppliers', label: 'Suppliers' },
    { path: 'reports', label: 'Reports' },
  ];
}
