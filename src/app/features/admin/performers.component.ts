import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { PerformersApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { Performer } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

type Dialog = { kind: 'add' } | { kind: 'rename'; person: Performer } | { kind: 'delete'; person: Performer } | null;
const nameRules = [Validators.required, Validators.minLength(2), Validators.maxLength(80)];

/**
 * The people who perform services. They are just names the admin keeps: they do not sign in and have no password.
 * (Staff accounts, who bill and sign in, are on the Team page.) On the billing screen each line can name who performed it.
 */
@Component({
  selector: 'app-performers',
  imports: [ReactiveFormsModule, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Performers</h1>
          <p class="sub">The people who perform services. These are just names, they do not sign in. Choose who did each service when you make a bill, and see their sales on the dashboard.</p>
        </div>
        @if (canAdd()) { <button type="button" class="btn btn-primary" (click)="open({ kind: 'add' })"><app-icon name="plus" /> Add performer</button> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 200px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load the list</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (!people().length) {
        <div class="panel empty">
          <h3>No performers yet</h3>
          <p>Add the people who do the work, such as stylists and therapists, so each service on a bill can be credited to them.</p>
          @if (canAdd()) { <button type="button" class="btn btn-primary" (click)="open({ kind: 'add' })"><app-icon name="plus" /> Add performer</button> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th class="num">Used on</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (p of people(); track p.id) {
                <tr [class.off]="!p.isActive">
                  <td><strong>{{ p.name }}</strong></td>
                  <td class="num muted">{{ p.lines }} {{ p.lines === 1 ? 'bill line' : 'bill lines' }}</td>
                  <td><span class="badge" [class.badge-paid]="p.isActive" [class.badge-void]="!p.isActive">{{ p.isActive ? 'Active' : 'Deactivated' }}</span></td>
                  <td class="cell-actions">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'rename', person: p })"><app-icon name="pencil" [size]="16" /> Rename</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="setActive(p, !p.isActive)">{{ p.isActive ? 'Deactivate' : 'Reactivate' }}</button>
                    @if (p.canDelete) { <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'delete', person: p })"><app-icon name="trash" [size]="16" /> Delete</button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin-top: 12px">
          Someone who is on past bills can be deactivated but not deleted, so those bills keep their record. A deactivated person no longer shows on the billing screen.
          Renaming changes the name on reports from now on. Bills already made keep the name they were made with.
        </p>
      }
    </div>

    @if (dialog(); as d) {
      @switch (d.kind) {
        @case ('add') {
          <app-modal title="Add performer" (closed)="close()">
            <form id="performer-form" [formGroup]="form" (ngSubmit)="add()" class="stack" novalidate>
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              <div class="field" [class.invalid]="err('name')">
                <label class="label" for="p-name">Name</label>
                <input id="p-name" class="input" formControlName="name" autocomplete="off" />
                @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
              </div>
            </form>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="submit" form="performer-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Adding…' : 'Add performer' }}</button>
            </ng-container>
          </app-modal>
        }
        @case ('rename') {
          <app-modal [title]="'Rename ' + d.person.name" (closed)="close()">
            <form id="performer-form" [formGroup]="form" (ngSubmit)="rename(d.person)" class="stack" novalidate>
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              <div class="field" [class.invalid]="err('name')">
                <label class="label" for="p-name">Name</label>
                <input id="p-name" class="input" formControlName="name" autocomplete="off" />
                @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
              </div>
            </form>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="submit" form="performer-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save name' }}</button>
            </ng-container>
          </app-modal>
        }
        @case ('delete') {
          <app-modal [title]="'Delete ' + d.person.name + '?'" (closed)="close()">
            <div class="stack">
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              <p>{{ d.person.name }} is not on any bill, so they can be deleted. Their commission rule, if they have one, goes with them. This cannot be undone.</p>
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="remove(d.person)">{{ busy() ? 'Deleting…' : 'Delete' }}</button>
            </ng-container>
          </app-modal>
        }
      }
    }`,
  styles: [`.off td { color: var(--muted); }`],
})
export class PerformersComponent {
  private readonly api = inject(PerformersApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly canAdd = () => this.auth.hasFeature('action.performers.add');

  protected readonly people = signal<Performer[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly dialog = signal<Dialog>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.group({ name: ['', nameRules] });

  constructor() { this.load(); }

  protected err(name: string) {
    return controlError(this.form.get(name), { required: 'Enter a name' });
  }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    // The admin sees everyone, deactivated people too, with how often each has been used.
    this.api.list(true).subscribe({
      next: (l) => { this.people.set(l); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected open(d: Dialog) {
    this.formError.set('');
    if (d?.kind === 'add') this.form.reset({ name: '' });
    if (d?.kind === 'rename') this.form.reset({ name: d.person.name });
    this.dialog.set(d);
  }
  protected close() { this.dialog.set(null); }

  private run(obs: Observable<unknown>, done: string, withForm = true) {
    this.busy.set(true);
    this.formError.set('');
    obs.subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success(done); this.load(); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (!withForm || !applyFieldErrors(this.form, info)) this.formError.set(info.message);
      },
    });
  }

  protected add() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const name = this.form.getRawValue().name.trim();
    this.run(this.api.create(name), `${name} added`);
  }

  protected rename(p: Performer) {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const name = this.form.getRawValue().name.trim();
    this.run(this.api.update(p.id, { name }), `Renamed to ${name}`);
  }

  protected remove(p: Performer) { this.run(this.api.remove(p.id), `${p.name} deleted`, false); }

  protected setActive(p: Performer, isActive: boolean) {
    this.api.update(p.id, { isActive }).subscribe({
      next: () => { this.toast.success(isActive ? `${p.name} reactivated` : `${p.name} deactivated`); this.load(); },
      error: (e) => this.toast.error(parseError(e).message),
    });
  }
}
