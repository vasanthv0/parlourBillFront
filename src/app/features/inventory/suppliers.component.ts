import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { orNull } from '../../core/inventory';
import { InventorySupplier } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

@Component({
  selector: 'app-inventory-suppliers',
  imports: [ReactiveFormsModule, IconComponent, ModalComponent],
  template: `
    <div class="row spread" style="margin-bottom: 14px">
      <h2>Suppliers</h2>
      <div class="row" style="gap: 12px">
        <label class="check"><input type="checkbox" [checked]="showInactive()" (change)="toggleInactive($any($event.target).checked)" /> Show inactive</label>
        <button type="button" class="btn btn-primary" (click)="openForm(null)"><app-icon name="plus" /> Add supplier</button>
      </div>
    </div>

    @if (loading()) {
      <div class="skeleton" style="height: 220px"></div>
    } @else if (error()) {
      <div class="panel empty"><h3>Could not load suppliers</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
    } @else if (items().length === 0) {
      <div class="panel empty"><h3>No suppliers yet</h3><p>Save the people you buy from, so each purchase records who supplied it.</p><button class="btn btn-primary" (click)="openForm(null)">Add the first supplier</button></div>
    } @else {
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Supplier</th><th>Contact</th><th>GST no.</th><th class="num">Purchases</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          @for (s of items(); track s.id) {
            <tr [class.off]="!s.isActive">
              <td><strong>{{ s.name }}</strong><div class="muted small">{{ s.address }}</div></td>
              <td>{{ s.contactPerson }}<div class="muted small">{{ s.phone }} {{ s.email }}</div></td>
              <td>{{ s.gstNumber || '—' }}</td>
              <td class="num">{{ s.purchases ?? 0 }}</td>
              <td>@if (s.isActive) { <span class="badge badge-paid">Active</span> } @else { <span class="badge badge-warn">Inactive</span> }</td>
              <td class="cell-actions">
                <button type="button" class="btn btn-ghost btn-sm" (click)="openForm(s)"><app-icon name="pencil" [size]="16" /> Edit</button>
                <button type="button" class="btn btn-ghost btn-sm danger" (click)="deleting.set(s)"><app-icon name="trash" [size]="16" /> Delete</button>
              </td>
            </tr>
          }
        </tbody>
      </table></div>
    }

    @if (formOpen()) {
      <app-modal [title]="editing() ? 'Edit supplier' : 'Add supplier'" [wide]="true" (closed)="formOpen.set(false)">
        <form id="supplier-form" [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
          <div class="form-grid">
            <div class="field" [class.invalid]="err('name')"><label class="label" for="su-name">Supplier name</label><input id="su-name" class="input" formControlName="name" autocomplete="off" />@if (err('name'); as m) { <span class="field-error">{{ m }}</span> }</div>
            <div class="field"><label class="label" for="su-contact">Contact person</label><input id="su-contact" class="input" formControlName="contactPerson" autocomplete="off" /></div>
            <div class="field"><label class="label" for="su-phone">Phone</label><input id="su-phone" class="input" type="tel" formControlName="phone" autocomplete="off" /></div>
            <div class="field" [class.invalid]="err('email')"><label class="label" for="su-email">Email</label><input id="su-email" class="input" type="email" formControlName="email" autocomplete="off" />@if (err('email'); as m) { <span class="field-error">{{ m }}</span> }</div>
            <div class="field"><label class="label" for="su-gst">GST number</label><input id="su-gst" class="input" formControlName="gstNumber" autocomplete="off" /></div>
            <div class="field"><label class="label" for="su-addr">Address</label><input id="su-addr" class="input" formControlName="address" autocomplete="off" /></div>
          </div>
          <div class="field"><label class="label" for="su-notes">Notes</label><textarea id="su-notes" class="input" rows="2" formControlName="notes"></textarea></div>
          @if (editing()) { <label class="check"><input type="checkbox" formControlName="isActive" /> Active</label> }
        </form>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="formOpen.set(false)">Cancel</button>
          <button type="submit" form="supplier-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save supplier' }}</button>
        </ng-container>
      </app-modal>
    }

    @if (deleting(); as d) {
      <app-modal title="Delete this supplier?" (closed)="deleting.set(null)">
        <p>Delete <strong>{{ d.name }}</strong>? A supplier that is on past purchases cannot be deleted. Make it inactive instead.</p>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="deleting.set(null)">Keep supplier</button>
          <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="remove(d)">{{ busy() ? 'Deleting…' : 'Delete supplier' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`.off td { color: var(--muted); } .danger { color: var(--brick); } .check { display: flex; gap: 8px; align-items: center; }`],
})
export class SuppliersComponent {
  private readonly api = inject(InventoryApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly items = signal<InventorySupplier[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly showInactive = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<InventorySupplier | null>(null);
  protected readonly deleting = signal<InventorySupplier | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    contactPerson: [''], phone: [''], email: ['', [Validators.email]], address: [''], gstNumber: [''], notes: [''], isActive: [true],
  });

  constructor() { this.load(); }

  protected err(name: string) { return controlError(this.form.get(name), { required: 'Required' }); }
  protected toggleInactive(on: boolean) { this.showInactive.set(on); this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.suppliers(this.showInactive()).subscribe({
      next: (l) => { this.items.set(l); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected openForm(s: InventorySupplier | null) {
    this.editing.set(s);
    this.formError.set('');
    this.form.reset({ name: s?.name ?? '', contactPerson: s?.contactPerson ?? '', phone: s?.phone ?? '', email: s?.email ?? '', address: s?.address ?? '', gstNumber: s?.gstNumber ?? '', notes: s?.notes ?? '', isActive: s?.isActive ?? true });
    this.formOpen.set(true);
  }

  protected save() {
    this.formError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = { name: v.name.trim(), contactPerson: orNull(v.contactPerson), phone: orNull(v.phone), email: orNull(v.email), address: orNull(v.address), gstNumber: orNull(v.gstNumber), notes: orNull(v.notes) };
    this.busy.set(true);
    const editing = this.editing();
    (editing ? this.api.updateSupplier(editing.id, { ...body, isActive: v.isActive }) : this.api.createSupplier(body)).subscribe({
      next: () => { this.busy.set(false); this.formOpen.set(false); this.toast.success(editing ? 'Supplier updated' : 'Supplier added'); this.load(); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.code === 'SUPPLIER_EXISTS') { this.form.controls.name.setErrors({ server: info.message }); this.form.controls.name.markAsTouched(); }
        else if (!applyFieldErrors(this.form, info)) this.formError.set(info.message);
      },
    });
  }

  protected remove(s: InventorySupplier) {
    this.busy.set(true);
    this.api.deleteSupplier(s.id).subscribe({
      next: () => { this.busy.set(false); this.deleting.set(null); this.toast.success(`${s.name} deleted`); this.load(); },
      error: (e) => { this.busy.set(false); this.deleting.set(null); this.toast.error(parseError(e).message); },
    });
  }
}
