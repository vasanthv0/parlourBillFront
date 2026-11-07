import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STATUS_LABEL, canMarkNoShow, canRemind, clock, isOpen, longDate, minutesLabel, servicesText, waitingFor } from '../../core/appointments';
import { AuthService } from '../../core/auth.service';
import { Appointment } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';

export type CardActionKind = 'start' | 'bill' | 'remind' | 'edit' | 'cancel' | 'noShow';
export interface CardAction { kind: CardActionKind; appointment: Appointment }

/**
 * One visit, on the day calendar or in the walk-in queue, with the things a person can do to it. Which buttons show follows the
 * visit's status and the platform admin's switches (the server refuses the rest again). It changes nothing itself: it only says what was tapped.
 */
@Component({
  selector: 'app-appointment-card',
  imports: [DatePipe, RouterLink, IconComponent],
  template: `
    <article class="card" [class.closed]="!open()" [attr.data-status]="a().status">
      <header class="top">
        @if (position() !== null) { <span class="place num" aria-label="Place in the queue">{{ position() }}</span> }
        <span class="when num">{{ whenText() }}</span>
        <span class="badge" [class.badge-paid]="a().status === 'completed'" [class.badge-warn]="a().status === 'waiting'" [class.badge-admin]="a().status === 'in_service'"
              [class.badge-void]="a().status === 'cancelled' || a().status === 'no_show'">{{ statusLabel() }}</span>
      </header>

      <h3 class="who">{{ a().customerName }}</h3>
      @if (a().customerPhone) { <p class="phone muted num">{{ a().customerPhone }}</p> }
      @if (servicesLine()) { <p class="what">{{ servicesLine() }}</p> }
      @if (a().performerName && showPerson()) { <p class="with muted">With {{ a().performerName }}</p> }
      @if (a().notes) { <p class="note">{{ a().notes }}</p> }
      @if (a().cancelReason) { <p class="muted">Reason: {{ a().cancelReason }}</p> }
      @if (a().reminderSentAt) { <p class="hint">Reminder opened {{ a().reminderSentAt | date: 'd MMM, h:mm a' }}</p> }

      @if (a().status === 'completed') {
        <p class="billed">
          @if (a().invoiceId && a().canOpenInvoice) { <a [routerLink]="[auth.basePath(), 'invoices', a().invoiceId]"><app-icon name="receipt" [size]="16" /> View bill {{ a().invoiceNumber }}</a> }
          @else if (a().invoiceNumber) { <span><app-icon name="receipt" [size]="16" /> Billed as {{ a().invoiceNumber }}</span> }
          @else { <span>Billed</span> }
        </p>
      }

      @if (open()) {
        <div class="actions">
          @if (canBill()) { <button type="button" class="btn btn-primary btn-sm" (click)="emit('bill')"><app-icon name="receipt" [size]="16" /> Bill this visit</button> }
          @if (canStart()) { <button type="button" class="btn btn-secondary btn-sm" (click)="emit('start')">Start</button> }
          @if (remindable()) { <button type="button" class="btn btn-ghost btn-sm" (click)="emit('remind')"><app-icon name="whatsapp" [size]="16" /> Remind</button> }
          <button type="button" class="btn btn-ghost btn-sm" (click)="emit('edit')"><app-icon name="pencil" [size]="16" /> Change</button>
          @if (noShowable()) { <button type="button" class="btn btn-ghost btn-sm" (click)="emit('noShow')">No-show</button> }
          <button type="button" class="btn btn-ghost btn-sm" (click)="emit('cancel')">Cancel</button>
        </div>
      }
    </article>`,
  styles: [`
    .card { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--lacquer); border-radius: var(--r-panel); padding: 12px 14px; display: grid; gap: 4px; }
    .card[data-status='waiting'] { border-left-color: var(--amber); }
    .card[data-status='in_service'] { border-left-color: var(--plum); }
    .card.closed { border-left-color: var(--line-strong); background: var(--sunken); }
    .card[data-status='completed'] { border-left-color: var(--sage); }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .place { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 999px; background: var(--plum); color: #fff; font-weight: 700; font-size: 13px; }
    .when { font-weight: 700; flex: 1; }
    .who { font-size: 16px; margin: 2px 0 0; }
    .phone, .with, .hint { margin: 0; font-size: 13px; }
    .what { margin: 0; }
    .note { margin: 4px 0 0; padding: 6px 8px; background: var(--amber-tint); border-radius: 6px; font-size: 13.5px; }
    .billed { margin: 4px 0 0; a, span { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; } }
    .actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  `],
})
export class AppointmentCardComponent {
  protected readonly auth = inject(AuthService);

  readonly a = input.required<Appointment>();
  /** The parlour's time zone, so clock times are the ones on its own wall. */
  readonly timezone = input.required<string>();
  /** The current moment (the page refreshes it), so "no-show" and "remind" follow the time. */
  readonly nowMs = input.required<number>();
  /** Place in the walk-in queue (1 = next). Null on the day calendar. */
  readonly position = input<number | null>(null);
  /** Whether to name the person: the calendar's columns already say it, the queue does not. */
  readonly showPerson = input(true);
  readonly act = output<CardAction>();

  protected readonly open = computed(() => isOpen(this.a().status));
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.a().status]);
  protected readonly servicesLine = computed(() => servicesText(this.a()));
  protected readonly canBill = computed(() => this.open() && this.auth.hasFeature('action.appointments.bill'));
  protected readonly canStart = computed(() => this.a().status === 'booked' || this.a().status === 'waiting');
  protected readonly remindable = computed(() => canRemind(this.a(), this.nowMs()) && this.auth.hasFeature('action.appointments.remind'));
  protected readonly noShowable = computed(() => canMarkNoShow(this.a(), this.nowMs()));

  /** A booking shows its slot; a walk-in shows how long they have waited, or when the work began. */
  protected readonly whenText = computed(() => {
    const a = this.a();
    const tz = this.timezone();
    if (a.kind === 'booked' && a.status !== 'in_service') return `${clock(a.startsAt, tz)} – ${clock(a.endsAt, tz)}`;
    if (a.status === 'waiting') return `Waiting ${waitingFor(a.startsAt, this.nowMs())}${a.date < this.todayOf() ? ' · ' + longDate(a.date) : ''}`;
    if (a.status === 'in_service') return `Started ${clock(a.startsAt, tz)} · ${minutesLabel(a.durationMin)}`;
    return `${clock(a.startsAt, tz)} · ${minutesLabel(a.durationMin)}`;
  });

  /** The parlour's own today, worked out from the clock and its time zone. */
  private todayOf(): string {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: this.timezone() }).format(new Date(this.nowMs()));
  }

  protected emit(kind: CardActionKind) { this.act.emit({ kind, appointment: this.a() }); }
}
