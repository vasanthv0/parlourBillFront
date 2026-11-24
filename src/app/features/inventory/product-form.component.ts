import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InventoryApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { UNIT_SUGGESTIONS, fmtQty, orNull } from '../../core/inventory';
import { InventoryProduct } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** Add a product, or edit one (when the address has an id). Editing never changes the stock level: that goes through Stock in / out or Adjustment. */
@Component({
  selector: 'app-inventory-product-form',
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  template: `
    <div class="row spread" style="margin-bottom: 14px">
      <h2>{{ editing() ? 'Edit product' : 'Add product' }}</h2>
      <a class="btn btn-ghost" routerLink="/admin/inventory/products"><app-icon name="arrow-left" [size]="16" /> Back to products</a>
    </div>

    @if (loading()) {
      <div class="skeleton" style="height: 300px"></div>
    } @else if (loadError()) {
      <div class="panel empty"><h3>Could not load this product</h3><p>{{ loadError() }}</p><a class="btn btn-secondary" routerLink="/admin/inventory/products">Back to products</a></div>
    } @else {
      <form class="panel stack" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }

        <div class="form-grid">
          <div class="field" [class.invalid]="err('name')">
            <label class="label" for="pr-name">Product name</label>
            <input id="pr-name" class="input" formControlName="name" autocomplete="off" placeholder="e.g. Argan hair oil 100 ml" />
            @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('sku')">
            <label class="label" for="pr-sku">SKU / product code <span class="muted small">(optional)</span></label>
            <input id="pr-sku" class="input" formControlName="sku" autocomplete="off" />
            @if (err('sku'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('category')">
            <label class="label" for="pr-cat">Category <span class="muted small">(optional)</span></label>
            <input id="pr-cat" class="input" formControlName="category" autocomplete="off" list="pr-cats" placeholder="e.g. Hair care" />
            <datalist id="pr-cats">@for (c of categories(); track c) { <option [value]="c"></option> }</datalist>
            @if (err('category'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('unit')">
            <label class="label" for="pr-unit">Unit</label>
            <input id="pr-unit" class="input" formControlName="unit" autocomplete="off" list="pr-units" />
            <datalist id="pr-units">@for (u of units; track u) { <option [value]="u"></option> }</datalist>
            @if (err('unit'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('purchasePrice')">
            <label class="label" for="pr-pp">Purchase price (per unit)</label>
            <span class="input-prefix"><span class="prefix">₹</span><input id="pr-pp" class="input" type="number" step="0.01" min="0" inputmode="decimal" formControlName="purchasePrice" /></span>
            @if (err('purchasePrice'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('sellingPrice')">
            <label class="label" for="pr-sp">Selling price (per unit)</label>
            <span class="input-prefix"><span class="prefix">₹</span><input id="pr-sp" class="input" type="number" step="0.01" min="0" inputmode="decimal" formControlName="sellingPrice" /></span>
            @if (err('sellingPrice'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('minStock')">
            <label class="label" for="pr-min">Minimum stock</label>
            <input id="pr-min" class="input" type="number" step="0.001" min="0" inputmode="decimal" formControlName="minStock" />
            <span class="hint">You are warned when the stock is at or below this.</span>
            @if (err('minStock'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          @if (editing(); as p) {
            <div class="field">
              <span class="label">Current stock</span>
              <div class="static"><strong>{{ qty(p.currentStock) }} {{ p.unit }}</strong></div>
              <span class="hint">Change it with <a routerLink="/admin/inventory/stock">Stock in / out</a> or <a routerLink="/admin/inventory/adjustments">Adjustment</a>, so there is a record.</span>
            </div>
          } @else {
            <div class="field" [class.invalid]="err('openingStock')">
              <label class="label" for="pr-open">Opening stock <span class="muted small">(optional)</span></label>
              <input id="pr-open" class="input" type="number" step="0.001" min="0" inputmode="decimal" formControlName="openingStock" />
              <span class="hint">What is on the shelf today. It is saved as the first stock movement.</span>
              @if (err('openingStock'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
          }
        </div>

        <div class="field" [class.invalid]="err('description')">
          <label class="label" for="pr-desc">Description <span class="muted small">(optional)</span></label>
          <textarea id="pr-desc" class="input" rows="3" formControlName="description"></textarea>
          @if (err('description'); as m) { <span class="field-error">{{ m }}</span> }
        </div>

        <label class="check"><input type="checkbox" formControlName="isActive" /> <span>Active <span class="muted small">(inactive products are hidden from stock entry and reports, and keep their history)</span></span></label>

        <div class="row" style="justify-content: flex-end; gap: 10px">
          <a class="btn btn-secondary" routerLink="/admin/inventory/products">Cancel</a>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : editing() ? 'Save changes' : 'Add product' }}</button>
        </div>
      </form>
    }`,
  styles: [`.static { padding: 9px 0; } .check { display: flex; gap: 10px; align-items: center; }`],
})
export class ProductFormComponent {
  private readonly api = inject(InventoryApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected readonly units = UNIT_SUGGESTIONS;
  protected readonly qty = fmtQty;
  protected readonly editing = signal<InventoryProduct | null>(null);
  protected readonly categories = signal<string[]>([]);
  protected readonly loading = signal(!!this.id);
  protected readonly loadError = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    sku: ['', [Validators.maxLength(60)]],
    category: ['', [Validators.maxLength(60)]],
    unit: ['pcs', [Validators.required, Validators.maxLength(20)]],
    purchasePrice: [0, [Validators.required, Validators.min(0), Validators.max(10_000_000)]],
    sellingPrice: [0, [Validators.required, Validators.min(0), Validators.max(10_000_000)]],
    minStock: [0, [Validators.required, Validators.min(0)]],
    openingStock: [0, [Validators.min(0)]],
    description: ['', [Validators.maxLength(1000)]],
    isActive: [true],
  });

  constructor() {
    this.api.categories().subscribe({ next: (c) => this.categories.set(c), error: () => undefined });
    if (this.id) {
      this.api.product(this.id).subscribe({
        next: (p) => {
          this.editing.set(p);
          this.form.patchValue({ name: p.name, sku: p.sku ?? '', category: p.category ?? '', unit: p.unit, purchasePrice: p.purchasePrice, sellingPrice: p.sellingPrice, minStock: p.minStock, description: p.description ?? '', isActive: p.isActive });
          this.loading.set(false);
        },
        error: (e) => { this.loadError.set(parseError(e).message); this.loading.set(false); },
      });
    }
  }

  protected err(name: string) { return controlError(this.form.get(name), { required: 'Required' }); }

  protected save() {
    this.formError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = {
      name: v.name.trim(), sku: orNull(v.sku), category: orNull(v.category), unit: v.unit.trim(),
      purchasePrice: Number(v.purchasePrice), sellingPrice: Number(v.sellingPrice), minStock: Number(v.minStock),
      description: orNull(v.description), isActive: v.isActive,
    };
    this.busy.set(true);
    const editing = this.editing();
    (editing ? this.api.updateProduct(editing.id, body) : this.api.createProduct({ ...body, openingStock: Number(v.openingStock) || 0 })).subscribe({
      next: () => { this.busy.set(false); this.toast.success(editing ? 'Product updated' : 'Product added'); void this.router.navigateByUrl('/admin/inventory/products'); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.code === 'SKU_EXISTS') { this.form.controls.sku.setErrors({ server: info.message }); this.form.controls.sku.markAsTouched(); }
        else if (info.code === 'PRODUCT_EXISTS') { this.form.controls.name.setErrors({ server: info.message }); this.form.controls.name.markAsTouched(); }
        else if (!applyFieldErrors(this.form, info)) this.formError.set(info.message);
      },
    });
  }
}
