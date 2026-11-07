import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { AppointmentsApi, PerformersApi, ServicesApi } from '../../core/api';
import { columnsFor, longDate, shiftDate } from '../../core/appointments';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { Appointment, AppointmentDay, Performer, QueueEntry, Service } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { AppointmentCardComponent, CardAction } from './appointment-card.component';
import { AppointmentFormComponent, FormMode } from './appointment-form.component';

type Dialog =
  | { kind: 'cancel'; appt: Appointment }
  | { kind: 'start'; appt: Appointment; message: string }
  | { kind: 'phone'; appt: Appointment; message: string }
  | null;

/**
 * The parlour's calendar and walk-in queue, shared by admin and staff. The calendar shows one day with a column for each person;
 * the queue shows everyone waiting, longest first. A visit is billed from here in one tap: the billing screen opens with
 * the customer, services and person already filled in. A visit has no price of its own: the server works the bill out on the day.
 */
@Component({
  selector: 'app-appointments',
  imports: [FormsModule, IconComponent, ModalComponent, AppointmentCardComponent, AppointmentFormComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Appointments</h1>
          <p class="sub">Each person's day, and everyone who is waiting.</p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-secondary" (click)="openForm('walkin')"><app-icon name="plus" /> Add walk-in</button>
          <button type="button" class="btn btn-primary" (click)="openForm('book')"><app-icon name="plus" /> Book appointment</button>
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 260px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load the calendar</h3><p>{{ error() }}</p><button type="button" class="btn btn-secondary" (click)="loadAll()">Try again</button></div>
      } @else {
        <div class="segmented tabs" role="group" aria-label="View">
          <button type="button" [attr.aria-pressed]="tab() === 'calendar'" (click)="tab.set('calendar')">Day calendar</button>
          <button type="button" [attr.aria-pressed]="tab() === 'queue'" (click)="tab.set('queue')">Walk-in queue <span class="count">{{ queue().length }}</span></button>
        </div>

        @if (tab() === 'calendar') {
          @if (day(); as d) {
            <div class="datebar">
              <button type="button" class="btn btn-secondary btn-icon" aria-label="Previous day" (click)="go(shift(d.date, -1))"><app-icon name="chevron-left" /></button>
              <input class="input date" type="date" aria-label="Day" [ngModel]="d.date" (ngModelChange)="go($event)" />
              <button type="button" class="btn btn-secondary btn-icon" aria-label="Next day" (click)="go(shift(d.date, 1))"><app-icon name="chevron-right" /></button>
              <button type="button" class="btn btn-ghost btn-sm" [disabled]="d.date === d.today" (click)="go(d.today)">Today</button>
              <strong class="datelabel">{{ longDate(d.date) }}{{ d.date === d.today ? ' · Today' : '' }}</strong>
            </div>

            @if (d.earlierOpen.count > 0) {
              <div class="notice" role="status">
                <app-icon name="alert" [size]="16" />
                <span>{{ d.earlierOpen.count }} {{ d.earlierOpen.count === 1 ? 'visit' : 'visits' }} from earlier days {{ d.earlierOpen.count === 1 ? 'is' : 'are' }} still open (billed or closed by nobody).</span>
                <button type="button" class="btn btn-ghost btn-sm" (click)="go(d.earlierOpen.oldest ?? d.date)">Show the oldest day</button>
              </div>
            }

            <div class="columns" [style.--cols]="columns().length">
              @for (col of columns(); track col.id ?? 'nobody') {
                <section class="column" [attr.aria-label]="col.name">
                  <h2 class="col-head">{{ col.name }} <span class="count">{{ col.items.length }}</span></h2>
                  @if (!col.items.length) { <p class="hint">Nothing booked.</p> }
                  @for (a of col.items; track a.id) {
                    <app-appointment-card [a]="a" [timezone]="d.timezone" [nowMs]="nowMs()" [showPerson]="col.id === null" (act)="onAct($event)" />
                  }
                </section>
              }
            </div>
          }
        } @else {
          @if (!queue().length) {
            <div class="panel empty">
              <h3>Nobody is waiting</h3>
              <p>When someone walks in, add them here. They join the line in the order they arrive, and move up as others start.</p>
              <button type="button" class="btn btn-primary" (click)="openForm('walkin')"><app-icon name="plus" /> Add walk-in</button>
            </div>
          } @else {
            <ol class="queue" aria-label="Walk-in queue">
              @for (q of queue(); track q.id) {
                <li><app-appointment-card [a]="q" [timezone]="timezone()" [nowMs]="nowMs()" [position]="q.position" (act)="onAct($event)" /></li>
              }
            </ol>
          }
        }
      }
    </div>

    @if (form(); as f) {
      <app-appointment-form [mode]="f.mode" [appointment]="f.appt" [day]="dayDate()" [services]="services()" [performers]="performers()" (saved)="onSaved($event)" (closed)="form.set(null)" />
    }

    @if (dialog(); as d) {
      @switch (d.kind) {
        @case ('cancel') {
          <app-modal [title]="'Cancel ' + d.appt.customerName + '?'" (closed)="close()">
            <div class="stack">
              @if (dialogError()) { <div class="form-alert" role="alert">{{ dialogError() }}</div> }
              <p>The visit stays on the calendar as cancelled, so there is a record of it.</p>
              <div class="field">
                <label class="label" for="cancel-reason">Reason (optional)</label>
                <textarea id="cancel-reason" class="textarea" rows="2" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
              </div>
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Keep it</button>
              <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="confirmCancel(d.appt)">{{ busy() ? 'Cancelling…' : 'Cancel the visit' }}</button>
            </ng-container>
          </app-modal>
        }
        @case ('start') {
          <app-modal [title]="'Start ' + d.appt.customerName" (closed)="close()">
            <div class="stack">
              @if (d.message) { <div class="form-alert" role="alert">{{ d.message }} Start anyway only if that is what you want.</div> }
              @if (people().length) {
                <div class="field">
                  <label class="label" for="start-person">Who will do it</label>
                  <select id="start-person" class="select" [ngModel]="startPerson()" (ngModelChange)="startPerson.set($event)">
                    <option value="">Nobody chosen yet</option>
                    @for (p of people(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                  </select>
                </div>
              }
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Back</button>
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="runStart(d.appt, startPerson(), !!d.message)">{{ busy() ? 'Starting…' : d.message ? 'Start anyway' : 'Start' }}</button>
            </ng-container>
          </app-modal>
        }
        @case ('phone') {
          <app-modal title="Customer's WhatsApp number" (closed)="close()">
            <div class="stack">
              <div class="form-alert" role="alert">{{ d.message }}</div>
              <div class="field">
                <label class="label" for="remind-phone">WhatsApp number</label>
                <input id="remind-phone" class="input" type="tel" inputmode="tel" autocomplete="off" [ngModel]="phoneText()" (ngModelChange)="phoneText.set($event)" />
              </div>
            </div>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="sendWithNumber(d.appt)"><app-icon name="whatsapp" [size]="16" /> {{ busy() ? 'Opening…' : 'Open WhatsApp' }}</button>
            </ng-container>
          </app-modal>
        }
      }
    }`,
  styles: [`
    .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .tabs { margin-bottom: 16px; }
    .count { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--sunken); font-size: 12px; font-weight: 700; color: var(--ink-2); }
    .datebar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .datebar .date { width: auto; min-width: 160px; }
    .datelabel { margin-left: 4px; }
    .notice { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 12px; border-radius: var(--r-control); background: var(--amber-tint); color: var(--amber); font-size: 14px; }
    .columns { display: grid; grid-template-columns: repeat(var(--cols, 1), minmax(260px, 1fr)); gap: 14px; align-items: start; overflow-x: auto; padding-bottom: 8px; }
    .column { display: grid; gap: 10px; align-content: start; min-width: 0; }
    .col-head { display: flex; align-items: center; gap: 8px; margin: 0; padding-bottom: 6px; border-bottom: 2px solid var(--line-strong); font-size: 15px; }
    .queue { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; max-width: 640px; }
    @media (max-width: 700px) { .columns { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class AppointmentsComponent {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(AppointmentsApi);
  private readonly servicesApi = inject(ServicesApi);
  private readonly performersApi = inject(PerformersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly shift = shiftDate;
  protected readonly longDate = longDate;

  protected readonly tab = signal<'calendar' | 'queue'>('calendar');
  protected readonly day = signal<AppointmentDay | null>(null);
  protected readonly queue = signal<QueueEntry[]>([]);
  protected readonly services = signal<Service[]>([]);
  protected readonly performers = signal<Performer[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly form = signal<{ mode: FormMode; appt: Appointment | null } | null>(null);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal('');
  protected readonly reason = signal('');
  protected readonly startPerson = signal('');
  protected readonly phoneText = signal('');
  /** The current moment, refreshed whenever the page loads, so "no-show" and "remind" follow the time. */
  protected readonly nowMs = signal(Date.now());
  /** The day on screen ('' means the parlour's today, which the server works out). */
  private requested = '';

  /** The people with a column: only while the Performers page is on, and only the active ones. */
  protected readonly people = computed(() => (this.auth.hasFeature('page.performers') ? this.performers().filter((p) => p.isActive) : []));
  protected readonly columns = computed(() => columnsFor(this.day()?.appointments ?? [], this.people()));
  protected readonly timezone = computed(() => this.day()?.timezone ?? 'Asia/Kolkata');
  protected readonly dayDate = computed(() => this.day()?.date ?? '');

  constructor() { this.loadAll(); }

  protected loadAll() {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      day: this.api.day(this.requested || undefined),
      queue: this.api.queue(),
      services: this.servicesApi.list(),
      // The people are optional: if the page is switched off or the list fails to load, the calendar is one plain list.
      performers: this.auth.hasFeature('page.performers') ? this.performersApi.list().pipe(catchError(() => of([] as Performer[]))) : of([] as Performer[]),
    }).subscribe({
      next: (r) => {
        this.requested = r.day.date;
        this.day.set(r.day);
        this.queue.set(r.queue.queue);
        this.services.set(r.services);
        this.performers.set(r.performers);
        this.nowMs.set(Date.now());
        this.loading.set(false);
      },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  /** Reloads the day on screen and the queue (after anything changed). */
  protected refresh() {
    forkJoin({ day: this.api.day(this.requested || undefined), queue: this.api.queue() }).subscribe({
      next: (r) => { this.requested = r.day.date; this.day.set(r.day); this.queue.set(r.queue.queue); this.nowMs.set(Date.now()); },
      error: (e) => this.toast.error(parseError(e).message),
    });
  }

  protected go(date: string) {
    if (!date) return; // a cleared date box
    this.requested = date;
    this.refresh();
  }

  protected openForm(mode: FormMode, appt: Appointment | null = null) { this.form.set({ mode, appt }); }
  protected close() { this.dialog.set(null); this.dialogError.set(''); }

  protected onSaved(a: Appointment) {
    this.form.set(null);
    if (a.kind === 'walk_in') {
      this.toast.success(`${a.customerName} added to the queue`);
      this.tab.set('queue');
      this.refresh();
      return;
    }
    this.toast.success(`${a.customerName} booked for ${a.time}`);
    this.tab.set('calendar');
    // A booking for another day takes the calendar to that day, so it is seen where it was put.
    if (a.date !== this.requested) this.go(a.date); else this.refresh();
  }

  protected onAct(e: CardAction) {
    const a = e.appointment;
    switch (e.kind) {
      case 'bill':
        // The billing screen opens with this visit's customer, services and person filled in; making the bill closes the visit.
        void this.router.navigate([this.auth.basePath(), 'new-bill'], { queryParams: { appointmentId: a.id } });
        break;
      case 'start': this.start(a); break;
      case 'remind': this.remind(a); break;
      case 'edit': this.openForm('edit', a); break;
      case 'cancel': this.reason.set(''); this.dialogError.set(''); this.dialog.set({ kind: 'cancel', appt: a }); break;
      case 'noShow': this.noShow(a); break;
    }
  }

  // ── Start ───────────────────────────────────────────────────
  private start(a: Appointment) {
    // One tap when it is clear who does it; otherwise ask, so a walk-in is not started with nobody by accident.
    if (a.performerId || !this.people().length) { this.runStart(a, a.performerId ?? '', false); return; }
    this.startPerson.set('');
    this.dialog.set({ kind: 'start', appt: a, message: '' });
  }

  protected runStart(a: Appointment, performerId: string, allowOverlap: boolean) {
    this.busy.set(true);
    this.api.start(a.id, { ...(performerId ? { performerId } : {}), ...(allowOverlap ? { allowOverlap: true } : {}) }).subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success(`${a.customerName} started`); this.refresh(); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.code === 'SLOT_TAKEN') {
          // The person is busy then. Say who with, and let the person decide: the server never overrides this on its own.
          this.startPerson.set(performerId);
          this.dialog.set({ kind: 'start', appt: a, message: info.message });
          return;
        }
        this.close();
        this.toast.error(info.message);
        this.refresh();
      },
    });
  }

  // ── Cancel and no-show ──────────────────────────────────────
  protected confirmCancel(a: Appointment) {
    this.busy.set(true);
    this.dialogError.set('');
    this.api.cancel(a.id, this.reason().trim() || undefined).subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success(`${a.customerName}'s visit was cancelled`); this.refresh(); },
      error: (e) => {
        this.busy.set(false);
        this.dialogError.set(parseError(e).message);
        this.refresh(); // it may have been billed or cancelled by someone else meanwhile
      },
    });
  }

  private noShow(a: Appointment) {
    this.api.noShow(a.id).subscribe({
      next: () => { this.toast.success(`${a.customerName} marked as a no-show`); this.refresh(); },
      error: (e) => { this.toast.error(parseError(e).message); this.refresh(); },
    });
  }

  // ── Reminder: a WhatsApp link the person taps (nothing is sent automatically) ──
  private remind(a: Appointment, phone?: string) {
    // The window is opened right now, inside the tap, so pop-up blockers allow it; the link is filled in once the server replies.
    const w = window.open('', '_blank');
    this.busy.set(true);
    this.api.reminder(a.id, phone).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.close();
        if (w) { w.opener = null; w.location.href = r.url; } else { window.location.assign(r.url); }
        // Opening it is what gets recorded: the person still has to press Send in WhatsApp.
        this.api.reminded(a.id).subscribe({ next: () => this.refresh(), error: () => this.refresh() });
      },
      error: (e) => {
        this.busy.set(false);
        w?.close();
        const info = parseError(e);
        if (info.code === 'PHONE_REQUIRED' || info.code === 'INVALID_PHONE') {
          this.phoneText.set(phone ?? '');
          this.dialog.set({ kind: 'phone', appt: a, message: info.message });
        } else {
          this.toast.error(info.message);
          this.refresh();
        }
      },
    });
  }

  protected sendWithNumber(a: Appointment) {
    const phone = this.phoneText().trim();
    if (!phone) { this.dialog.set({ kind: 'phone', appt: a, message: 'Enter the customer’s WhatsApp number' }); return; }
    this.remind(a, phone);
  }
}
