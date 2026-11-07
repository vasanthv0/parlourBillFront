import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppointmentChanges, AppointmentsApi, NewAppointment } from '../../core/api';
import { Draft, minutesLabel, plannedMinutes, problems } from '../../core/appointments';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { Appointment, Customer, Performer, Service } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { CustomerPickerComponent } from './customer-picker.component';

export type FormMode = 'book' | 'walkin' | 'edit';
const MAX_PER_SERVICE = 10;

/**
 * Book a visit, add a walk-in, or change one that is still open. The server decides everything that matters (the time on the
 * parlour's own clock, whether the person is free, the length); this form only collects it and says what went wrong, field by field.
 * A visit has no price: the bill works that out on the day.
 */
@Component({
  selector: 'app-appointment-form',
  imports: [FormsModule, IconComponent, ModalComponent, CustomerPickerComponent],
  template: `
    <app-modal [title]="title()" [wide]="true" (closed)="closed.emit()">
      <div class="stack">
        @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
        @if (clash()) {
          <div class="form-alert" role="alert">{{ clash() }} You can still save it if that is what you want.</div>
        }

        <section class="stack-sm" aria-label="Customer">
          <span class="label">Customer</span>
          @if (customer(); as c) {
            <div class="chosen">
              <span><strong>{{ c.name }}</strong> <span class="muted num">{{ c.phone }}</span></span>
              <button type="button" class="btn btn-ghost btn-sm" (click)="forgetCustomer()">Use a different name</button>
            </div>
          } @else {
            @if (hasCustomers()) { <app-customer-picker (picked)="pick($event)" /> }
            <div class="form-grid">
              <div class="field" [class.invalid]="err('customerName')">
                <label class="label" for="ap-name">{{ mode() === 'walkin' ? 'Name (optional)' : 'Name' }}</label>
                <input id="ap-name" class="input" autocomplete="off" [ngModel]="name()" (ngModelChange)="name.set($event)" />
                @if (err('customerName'); as m) { <span class="field-error">{{ m }}</span> }
              </div>
              <div class="field" [class.invalid]="err('customerPhone')">
                <label class="label" for="ap-phone">Phone{{ mode() === 'walkin' ? ' (optional)' : '' }}</label>
                <input id="ap-phone" class="input" type="tel" inputmode="tel" autocomplete="off" [ngModel]="phone()" (ngModelChange)="phone.set($event)" />
                @if (err('customerPhone'); as m) { <span class="field-error">{{ m }}</span> }
              </div>
            </div>
          }
        </section>

        @if (hasTime()) {
          <div class="form-grid">
            <div class="field" [class.invalid]="err('date')">
              <label class="label" for="ap-date">Date</label>
              <input id="ap-date" class="input" type="date" [ngModel]="date()" (ngModelChange)="date.set($event)" />
              @if (err('date'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field" [class.invalid]="err('time')">
              <label class="label" for="ap-time">Time</label>
              <input id="ap-time" class="input" type="time" [ngModel]="time()" (ngModelChange)="time.set($event)" />
              @if (err('time'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
          </div>
        }

        @if (hasPeople()) {
          <div class="field">
            <label class="label" for="ap-person">Who will do it</label>
            <select id="ap-person" class="select" [ngModel]="performerId()" (ngModelChange)="performerId.set($event)">
              <option value="">Nobody chosen yet</option>
              @for (p of people(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
          </div>
        }

        <section class="stack-sm" aria-label="Services" [class.invalid]="err('items')">
          <span class="label">Services</span>
          <ul class="svc-list">
            @for (s of services(); track s.id) {
              <li class="svc" [class.on]="qtyOf(s.id) > 0">
                <span class="svc-name"><strong>{{ s.name }}</strong> <span class="muted">· {{ minutes(s.durationMin) }}</span></span>
                <span class="stepper">
                  <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="'One fewer ' + s.name" [disabled]="qtyOf(s.id) === 0" (click)="change(s.id, -1)"><app-icon name="minus" [size]="16" /></button>
                  <span class="qty num" aria-live="polite">{{ qtyOf(s.id) }}</span>
                  <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="'One more ' + s.name" [disabled]="qtyOf(s.id) >= maxQty" (click)="change(s.id, 1)"><app-icon name="plus" [size]="16" /></button>
                </span>
              </li>
            }
          </ul>
          @if (err('items'); as m) { <span class="field-error">{{ m }}</span> }
        </section>

        <div class="form-grid">
          <div class="field" [class.invalid]="err('durationMin')">
            <label class="label" for="ap-minutes">Length (minutes)</label>
            <input id="ap-minutes" class="input num" inputmode="numeric" autocomplete="off" [placeholder]="'' + planned()" [ngModel]="minutesText()" (ngModelChange)="setMinutes($event)" />
            @if (err('durationMin'); as m) { <span class="field-error">{{ m }}</span> }
            @else { <span class="hint">Leave blank to use the services' own time: {{ minutes(planned()) }}.</span> }
          </div>
          <div class="field span-2" [class.invalid]="err('notes')">
            <label class="label" for="ap-notes">Notes (optional)</label>
            <textarea id="ap-notes" class="textarea" rows="2" [ngModel]="notes()" (ngModelChange)="notes.set($event)"></textarea>
            @if (err('notes'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
        </div>
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-secondary" (click)="closed.emit()">Cancel</button>
        @if (clash()) {
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save(true)">{{ busy() ? 'Saving…' : 'Save anyway' }}</button>
        } @else {
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="save(false)">{{ busy() ? 'Saving…' : saveLabel() }}</button>
        }
      </ng-container>
    </app-modal>`,
  styles: [`
    .chosen { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--r-control); background: var(--sunken); }
    .svc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; max-height: 240px; overflow: auto; }
    .svc { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px 4px 12px; border: 1px solid var(--line); border-radius: var(--r-control); }
    .svc.on { border-color: var(--lacquer); background: var(--lacquer-tint); }
    .stepper { display: inline-flex; align-items: center; gap: 2px; }
    .qty { min-width: 22px; text-align: center; font-weight: 700; }
  `],
})
export class AppointmentFormComponent implements OnInit {
  private readonly api = inject(AppointmentsApi);
  private readonly auth = inject(AuthService);

  readonly mode = input.required<FormMode>();
  /** The visit being changed (edit mode only). */
  readonly appointment = input<Appointment | null>(null);
  /** The day the calendar is showing: a new booking starts on it. */
  readonly day = input<string>('');
  readonly services = input.required<Service[]>();
  readonly performers = input<Performer[]>([]);
  readonly saved = output<Appointment>();
  readonly closed = output<void>();

  protected readonly maxQty = MAX_PER_SERVICE;
  protected readonly minutes = minutesLabel;

  // What is typed. Edit mode starts from the visit as it is.
  protected readonly customer = signal<{ id: string; name: string; phone: string } | null>(null);
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly performerId = signal('');
  protected readonly qty = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly minutesText = signal('');
  protected readonly notes = signal('');

  // What has been touched, so an edit sends only what changed (and never loses a service that has since left the menu).
  private itemsTouched = false;
  private minutesTouched = false;
  private customerChanged = false;

  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly clash = signal('');
  private readonly serverErrors = signal<Record<string, string>>({});
  private readonly submitted = signal(false);

  protected readonly title = computed(() => (this.mode() === 'book' ? 'Book an appointment' : this.mode() === 'walkin' ? 'Add a walk-in' : 'Change appointment'));
  protected readonly saveLabel = computed(() => (this.mode() === 'book' ? 'Book appointment' : this.mode() === 'walkin' ? 'Add to the queue' : 'Save changes'));
  /** Date and time are for a booking that has not started: a walk-in has no booked time, and a visit already under way cannot be moved. */
  protected readonly hasTime = computed(() => this.mode() === 'book' || (this.mode() === 'edit' && this.appointment()?.kind === 'booked' && this.appointment()?.status === 'booked'));
  protected readonly hasCustomers = computed(() => this.auth.hasFeature('page.customers'));
  protected readonly people = computed(() => this.performers().filter((p) => p.isActive));
  protected readonly hasPeople = computed(() => this.auth.hasFeature('page.performers') && this.people().length > 0);

  protected readonly chosen = computed(() => this.services().flatMap((s) => { const q = this.qty().get(s.id) ?? 0; return q > 0 ? [{ durationMin: s.durationMin, quantity: q, serviceId: s.id }] : []; }));
  protected readonly planned = computed(() => plannedMinutes(this.chosen()));

  protected readonly draft = computed<Draft>(() => ({
    kind: this.mode() === 'walkin' ? 'walk_in' : (this.appointment()?.kind ?? 'booked'),
    hasCustomer: !!this.customer(),
    name: this.name(), phone: this.phone(),
    date: this.hasTime() ? this.date() : 'n/a', time: this.hasTime() ? this.time() : 'n/a',
    // An edit that never touched the services keeps the ones the visit already has.
    serviceCount: this.mode() === 'edit' && !this.itemsTouched ? Math.max(1, this.chosen().length) : this.chosen().length,
    minutes: this.minutesText(), notes: this.notes(),
  }));
  private readonly clientErrors = computed(() => problems(this.draft()));

  /** Starts the form from the visit being changed, or from the day on screen. Runs once, after the inputs are set. */
  ngOnInit() {
    const a = this.appointment();
    if (this.mode() === 'edit' && a) {
      if (a.customerId) this.customer.set({ id: a.customerId, name: a.customerName, phone: a.customerPhone ?? '' });
      else { this.name.set(a.customerName === 'Walk-in' ? '' : a.customerName); this.phone.set(a.customerPhone ?? ''); }
      this.date.set(a.date);
      this.time.set(a.time);
      this.performerId.set(a.performerId ?? '');
      this.qty.set(new Map(a.services.flatMap((l): [string, number][] => (l.serviceId ? [[l.serviceId, Math.min(MAX_PER_SERVICE, l.quantity)]] : []))));
      this.minutesText.set(String(a.durationMin));
      this.notes.set(a.notes ?? '');
    } else {
      this.date.set(this.day());
    }
  }

  protected err(field: string): string | null {
    const server = this.serverErrors()[field];
    if (server) return server;
    return this.submitted() ? (this.clientErrors()[field] ?? null) : null;
  }

  protected qtyOf(id: string) { return this.qty().get(id) ?? 0; }
  protected change(id: string, delta: number) {
    this.itemsTouched = true;
    this.clearFeedback();
    this.qty.update((m) => {
      const next = new Map(m);
      const q = Math.min(MAX_PER_SERVICE, (next.get(id) ?? 0) + delta);
      if (q <= 0) next.delete(id); else next.set(id, q);
      return next;
    });
  }
  protected setMinutes(text: string) { this.minutesTouched = true; this.minutesText.set(text); this.clearFeedback(); }

  protected pick(c: Customer) { this.customer.set({ id: c.id, name: c.name, phone: c.phone }); this.customerChanged = true; this.clearFeedback(); }
  protected forgetCustomer() { this.customer.set(null); this.name.set(''); this.phone.set(''); this.customerChanged = true; this.clearFeedback(); }

  /** Anything the server said about the last try is out of date as soon as something changes. */
  private clearFeedback() { this.clash.set(''); this.formError.set(''); this.serverErrors.set({}); }

  protected save(allowOverlap: boolean) {
    this.submitted.set(true);
    this.formError.set('');
    this.serverErrors.set({});
    if (Object.keys(this.clientErrors()).length) return;

    if (this.mode() === 'edit') {
      const changes = this.changes(allowOverlap);
      if (!changes) { this.closed.emit(); return; } // nothing to save
      this.send(this.api.update(this.appointment()!.id, changes));
    } else {
      this.send(this.api.create(this.newBody(allowOverlap)));
    }
  }

  private items(): { serviceId: string; quantity: number }[] {
    return this.chosen().map((c) => ({ serviceId: c.serviceId, quantity: c.quantity }));
  }

  private newBody(allowOverlap: boolean): NewAppointment {
    const booking = this.mode() === 'book';
    const c = this.customer();
    const name = this.name().trim();
    const phone = this.phone().trim();
    const minutes = this.minutesText().trim();
    const notes = this.notes().trim();
    return {
      kind: booking ? 'booked' : 'walk_in',
      ...(booking ? { date: this.date(), time: this.time() } : {}),
      ...(c ? { customerId: c.id } : { ...(name ? { customerName: name } : {}), ...(phone ? { customerPhone: phone } : {}) }),
      ...(this.performerId() ? { performerId: this.performerId() } : {}),
      items: this.items(),
      ...(minutes ? { durationMin: Number(minutes) } : {}),
      ...(notes ? { notes } : {}),
      ...(allowOverlap ? { allowOverlap: true } : {}),
    };
  }

  /** Only what is different from the visit as it was. Null when nothing is. */
  private changes(allowOverlap: boolean): AppointmentChanges | null {
    const a = this.appointment()!;
    const out: AppointmentChanges = {};
    const c = this.customer();
    if (c) {
      if (this.customerChanged && c.id !== a.customerId) out.customerId = c.id;
    } else {
      const name = this.name().trim();
      if (a.customerId || this.customerChanged || name !== (a.customerName === 'Walk-in' ? '' : a.customerName) || this.phone().trim() !== (a.customerPhone ?? '')) {
        if (a.customerId) out.customerId = null;
        if (name) out.customerName = name;
        out.customerPhone = this.phone().trim() || null;
      }
    }
    if (this.performerId() !== (a.performerId ?? '')) out.performerId = this.performerId() || null;
    if (this.hasTime() && (this.date() !== a.date || this.time() !== a.time)) { out.date = this.date(); out.time = this.time(); }
    if (this.itemsTouched) out.items = this.items();
    const minutes = this.minutesText().trim();
    if (this.minutesTouched && minutes && Number(minutes) !== a.durationMin) out.durationMin = Number(minutes);
    if (this.notes().trim() !== (a.notes ?? '')) out.notes = this.notes().trim();
    if (!Object.keys(out).length) return null;
    return allowOverlap ? { ...out, allowOverlap: true } : out;
  }

  private send(request: ReturnType<AppointmentsApi['create']>) {
    this.busy.set(true);
    request.subscribe({
      next: (saved) => { this.busy.set(false); this.saved.emit(saved); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        // The person already has someone then: say who, and let the person decide (the server never overrides this on its own).
        if (info.code === 'SLOT_TAKEN') { this.clash.set(info.message); return; }
        if (Object.keys(info.fields).length) this.serverErrors.set(info.fields);
        else this.formError.set(info.message);
      },
    });
  }
}
