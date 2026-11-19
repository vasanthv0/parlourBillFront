import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PerformerAttendanceApi } from '../../core/api';
import { formatTime, formatWorked } from '../../core/attendance-format';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { PerformerAttendanceLine, PerformerAttendanceRecord, PerformerAttendanceReport, PerformerAttendanceToday, PerformerRecordStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';

type Kind = 'in' | 'out';
type Notice = { kind: 'success' | 'error'; text: string };

/** The server's answers that mean "what you are looking at is out of date": reload the list so each row shows what is true now. */
const STALE = ['ALREADY_CHECKED_IN', 'ATTENDANCE_COMPLETE', 'ALREADY_CHECKED_OUT', 'NOT_CHECKED_IN', 'PERFORMER_INACTIVE', 'PERFORMER_NOT_FOUND'];

/** Whole days added to a YYYY-MM-DD date, with no time zone involved. */
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const STATUS_OPTIONS: { value: '' | PerformerRecordStatus; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'missed_checkout', label: 'Missed check-out' },
];

/**
 * Attendance by Staff. Performers do not sign in, so a signed-in staff member or admin records their check-in and
 * check-out here. This is separate from the Attendance page (a person's own GPS attendance) and does not use GPS.
 * Only the performer is sent to the server: who is recording, the parlour, the date and the time are all the server's.
 */
@Component({
  selector: 'app-attendance-by-staff',
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Attendance by Staff</h1>
          <p class="sub">Record check-in and check-out for performers, who do not sign in. This is separate from your own attendance.</p>
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 320px"></div>
      } @else if (loadError()) {
        <div class="panel empty"><h3>Could not load performers</h3><p>{{ loadError() }}</p><button type="button" class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (today()) {
        @let t = today()!;

        <!-- Today -->
        <section class="panel" aria-labelledby="abs-today">
          <div class="panel-head">
            <h2 id="abs-today">Today</h2>
            <span class="muted small">{{ dayLabel(t.workDate) }}</span>
          </div>

          @if (notice(); as n) {
            <div class="panel-body notice-wrap">
              <div [class]="n.kind === 'error' ? 'form-alert' : 'hint ok'" [attr.role]="n.kind === 'error' ? 'alert' : 'status'">{{ n.text }}</div>
            </div>
          }

          @if (!t.performers.length) {
            <div class="empty"><h3>No performers to record</h3><p>Performers appear here when your admin has added them on the Performers page and they are active.</p></div>
          } @else {
            <ul class="people" aria-label="Performers">
              <li class="people-head" aria-hidden="true">
                <span>Performer</span><span>Status</span><span>Checked in</span><span>Checked out</span><span>Recorded by</span><span></span>
              </li>
              @for (p of t.performers; track p.performerId) {
                <li class="person" [attr.data-state]="p.status">
                  <div class="who"><strong>{{ p.name }}</strong><span class="muted small">{{ t.workDate }}</span></div>
                  <div class="state"><span class="badge" [class.badge-paid]="p.status === 'checked_in'">{{ statusText(p) }}</span></div>
                  <div><span class="cell-label muted small">Checked in</span>{{ p.record ? time(p.record.checkInAt) : '—' }}</div>
                  <div><span class="cell-label muted small">Checked out</span>{{ p.record?.checkOutAt ? time(p.record!.checkOutAt!) : '—' }}</div>
                  <div class="by small">
                    @if (p.record; as r) {
                      <span><span class="muted">In:</span> {{ r.markedBy.name }}</span>
                      @if (r.checkOutMarkedBy; as o) { <span><span class="muted">Out:</span> {{ o.name }}</span> }
                    } @else { <span class="muted">—</span> }
                  </div>
                  <div class="act">
                    @switch (p.status) {
                      @case ('not_checked_in') {
                        <button type="button" class="btn btn-primary btn-sm" [disabled]="!!busy()" [attr.aria-label]="'Check in ' + p.name" (click)="act(p, 'in')">
                          {{ busy() === key(p, 'in') ? 'Checking in…' : 'Check in' }}
                        </button>
                      }
                      @case ('checked_in') {
                        <button type="button" class="btn btn-secondary btn-sm" [disabled]="!!busy()" [attr.aria-label]="'Check out ' + p.name" (click)="act(p, 'out')">
                          {{ busy() === key(p, 'out') ? 'Checking out…' : 'Check out' }}
                        </button>
                      }
                      @default { <span class="done muted"><app-icon name="check" [size]="16" /> Completed</span> }
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <!-- History -->
        <section class="panel" aria-labelledby="abs-history">
          <div class="panel-head">
            <h2 id="abs-history">History</h2>
            <span class="muted small">{{ isAdmin() ? 'Every record in your parlour' : 'The records you recorded' }}</span>
          </div>
          <div class="panel-body filters">
            <div class="field">
              <label class="label" for="abs-from">From</label>
              <input id="abs-from" #fromEl type="date" class="input" [value]="from()" [max]="to()" (change)="setFrom(fromEl.value)" />
            </div>
            <div class="field">
              <label class="label" for="abs-to">To</label>
              <input id="abs-to" #toEl type="date" class="input" [value]="to()" [min]="from()" [max]="t.workDate" (change)="setTo(toEl.value)" />
            </div>
            <div class="field">
              <label class="label" for="abs-person">Performer</label>
              <select id="abs-person" class="select" [ngModel]="performerId()" (ngModelChange)="setPerformer($event)">
                <option value="">Everyone</option>
                @for (o of performerOptions(); track o.id) { <option [value]="o.id">{{ o.name }}</option> }
              </select>
            </div>
            <div class="field">
              <label class="label" for="abs-status">Status</label>
              <select id="abs-status" class="select" [ngModel]="status()" (ngModelChange)="setStatus($event)">
                @for (o of statusOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
              </select>
            </div>
          </div>

          @if (isAdmin() && report()?.people?.length) {
            @let r = report()!;
            <div class="table-wrap summary">
              <table class="table">
                <caption class="sr-only">Totals for these dates</caption>
                <thead><tr><th>Performer</th><th class="num">Days</th><th class="num">Completed</th><th class="num">Missed check-out</th><th class="num">Time worked</th></tr></thead>
                <tbody>
                  @for (x of r.people; track x.performerId) {
                    <tr>
                      <td><strong>{{ x.name }}</strong>@if (!x.isActive) { <span class="muted small"> · inactive</span> }</td>
                      <td class="num">{{ x.days }}</td>
                      <td class="num">{{ x.complete }}</td>
                      <td class="num">@if (x.missedCheckout) { <span class="badge badge-warn">{{ x.missedCheckout }}</span> } @else { 0 }</td>
                      <td class="num">{{ minutes(x.minutesWorked) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          @if (rowsError()) {
            <div class="panel-body"><div class="form-alert" role="alert">{{ rowsError() }}</div></div>
          } @else if (rowsLoading()) {
            <div class="panel-body"><div class="skeleton" style="height: 120px"></div></div>
          } @else if (!rows().length) {
            <div class="empty"><h3>No attendance in these dates</h3><p>Records appear here once someone is checked in. Try a wider date range or another performer.</p></div>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Date</th><th>Performer</th><th>Checked in</th><th>Checked out</th><th>Time worked</th><th>Status</th><th>Recorded by</th></tr></thead>
                <tbody>
                  @for (r of rows(); track r.id) {
                    <tr>
                      <td>{{ shortDay(r.workDate) }}</td>
                      <td><strong>{{ r.performerName }}</strong></td>
                      <td>{{ time(r.checkInAt) }}</td>
                      <td>@if (r.checkOutAt) { {{ time(r.checkOutAt) }} } @else { <span class="muted">—</span> }</td>
                      <td class="num">{{ worked(r) || '—' }}</td>
                      <td>
                        @switch (r.status) {
                          @case ('checked_out') { <span class="badge">Checked out</span> }
                          @case ('missed_checkout') { <span class="badge badge-warn">Missed check-out</span> }
                          @default { <span class="badge badge-paid">Checked in</span> }
                        }
                      </td>
                      <td class="small">
                        <div><span class="muted">In:</span> {{ r.markedBy.name }}</div>
                        @if (r.checkOutMarkedBy; as o) { <div><span class="muted">Out:</span> {{ o.name }}</div> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (total() > rows().length) { <p class="hint more">Showing the newest {{ rows().length }} of {{ total() }}. Narrow the dates to see the rest.</p> }
          }
        </section>
      }
    </div>`,
  styles: [`
    .panel { margin-bottom: 24px; }
    .notice-wrap { padding-bottom: 0; }
    .hint.ok { color: var(--sage); font-weight: 600; margin: 0; }

    .people { list-style: none; margin: 0; padding: 0; }
    .people-head, .person {
      display: grid; align-items: center; gap: 12px; padding: 12px 20px;
      grid-template-columns: minmax(130px, 1.3fr) minmax(150px, 1.3fr) minmax(86px, 0.8fr) minmax(86px, 0.8fr) minmax(120px, 1.1fr) 128px;
    }
    .people-head { color: var(--muted); font-size: 13px; font-weight: 600; border-bottom: 1px solid var(--line); }
    .person { border-bottom: 1px solid var(--line); }
    .person:last-child { border-bottom: 0; }
    .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .by { display: flex; flex-direction: column; gap: 2px; }
    .cell-label { display: none; }
    .act { display: flex; justify-content: flex-end; }
    .done { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }

    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
    .summary { border-top: 1px solid var(--line); }
    .more { padding: 12px 20px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    @media (max-width: 760px) {
      .people-head { display: none; }
      .person { grid-template-columns: 1fr auto; row-gap: 10px; padding: 14px 16px; }
      .person .state { justify-self: end; }
      .person > div:nth-child(3), .person > div:nth-child(4) { grid-column: auto; }
      .cell-label { display: block; }
      .person .by { grid-column: 1 / -1; }
      .person .act { grid-column: 1 / -1; justify-content: stretch; }
      .person .act .btn { width: 100%; justify-content: center; min-height: 48px; }
      .person .done { width: 100%; justify-content: center; min-height: 40px; }
    }
  `],
})
export class AttendanceByStaffComponent {
  private readonly api = inject(PerformerAttendanceApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly today = signal<PerformerAttendanceToday | null>(null);
  /** "performerId:in" or "performerId:out" while a request is on its way, otherwise null. While set, every button is disabled. */
  protected readonly busy = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  // History filters (from and to are the parlour's own calendar days).
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly performerId = signal('');
  protected readonly status = signal<'' | PerformerRecordStatus>('');
  protected readonly rows = signal<PerformerAttendanceRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly rowsLoading = signal(false);
  protected readonly rowsError = signal('');
  protected readonly report = signal<PerformerAttendanceReport | null>(null);

  /** Only the newest history lookup may update the screen. */
  private lookup = 0;

  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');

  /** Everyone worth filtering by: today's active performers, plus (for an admin) inactive people who have records in these dates. */
  protected readonly performerOptions = computed(() => {
    const out = new Map<string, string>();
    for (const p of this.today()?.performers ?? []) out.set(p.performerId, p.name);
    for (const p of this.report()?.people ?? []) out.set(p.performerId, p.name);
    return [...out].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() { this.load(); }

  protected load() {
    this.loading.set(true);
    this.loadError.set('');
    this.api.today().subscribe({
      next: (t) => {
        this.today.set(t);
        this.to.set(t.workDate);
        this.from.set(addDays(t.workDate, -6));
        this.loading.set(false);
        this.loadHistory();
      },
      error: (e) => { this.loadError.set(parseError(e).message); this.loading.set(false); },
    });
  }

  /** A quiet refresh of today's list (used when the server says someone else got there first). */
  private refreshToday() {
    this.api.today().subscribe({ next: (t) => this.today.set(t), error: () => undefined });
  }

  protected key(p: PerformerAttendanceLine, kind: Kind) { return `${p.performerId}:${kind}`; }

  /** Check a performer in or out. A second tap while the first is still on its way does nothing, so a double click cannot send two requests. */
  protected act(p: PerformerAttendanceLine, kind: Kind) {
    if (this.busy()) return;
    this.busy.set(this.key(p, kind));
    this.notice.set(null);
    const call = kind === 'in' ? this.api.checkIn(p.performerId) : this.api.checkOut(p.performerId);
    call.subscribe({
      next: (r) => {
        this.busy.set(null);
        this.today.update((cur) => cur && { ...cur, workDate: r.workDate, performers: cur.performers.map((x) => (x.performerId === r.performer.performerId ? r.performer : x)) });
        const at = kind === 'in' ? r.performer.record?.checkInAt : r.performer.record?.checkOutAt;
        const text = `${p.name} ${kind === 'in' ? 'checked in' : 'checked out'}${at ? ` at ${this.time(at)}` : ''}.`;
        this.notice.set({ kind: 'success', text });
        this.toast.success(text);
        this.loadHistory();
      },
      error: (e) => {
        this.busy.set(null);
        const info = parseError(e);
        this.notice.set({ kind: 'error', text: info.message });
        if (STALE.includes(info.code ?? '')) this.refreshToday();
      },
    });
  }

  // ── History ──
  protected setFrom(value: string) {
    if (!value) return; // cleared with the date picker's own button: keep what is showing
    this.from.set(value);
    if (this.to() && value > this.to()) this.to.set(value);
    this.loadHistory();
  }
  protected setTo(value: string) {
    if (!value) return;
    this.to.set(value);
    if (this.from() && value < this.from()) this.from.set(value);
    this.loadHistory();
  }
  protected setPerformer(id: string | null) { this.performerId.set(id ?? ''); this.loadHistory(); }
  protected setStatus(s: '' | PerformerRecordStatus | null) { this.status.set(s ?? ''); this.loadHistory(); }

  private loadHistory() {
    const mine = ++this.lookup;
    const range = { from: this.from(), to: this.to(), performerId: this.performerId() || undefined };
    this.rowsLoading.set(true);
    this.rowsError.set('');
    this.api.history({ ...range, status: this.status(), limit: 100 }).subscribe({
      next: (page) => {
        if (mine !== this.lookup) return;
        this.rows.set(page.items);
        this.total.set(page.meta.total);
        this.rowsLoading.set(false);
      },
      error: (e) => { if (mine !== this.lookup) return; this.rowsError.set(parseError(e).message); this.rowsLoading.set(false); },
    });
    if (this.isAdmin()) {
      this.api.report(range).subscribe({ next: (r) => { if (mine === this.lookup) this.report.set(r); }, error: () => { if (mine === this.lookup) this.report.set(null); } });
    }
  }

  // ── Display helpers ──
  protected statusText(p: PerformerAttendanceLine): string {
    if (p.status === 'checked_in' && p.record) return `Checked in – ${this.time(p.record.checkInAt)}`;
    if (p.status === 'checked_out' && p.record?.checkOutAt) return `Checked out – ${this.time(p.record.checkOutAt)}`;
    return 'Not checked in';
  }
  /** A time of day in the parlour's own time zone, whatever zone this device is set to. */
  protected time(iso: string): string { return formatTime(iso, this.today()?.timezone); }
  protected worked(r: PerformerAttendanceRecord): string { return formatWorked(r.checkInAt, r.checkOutAt); }
  protected minutes(total: number): string { return total ? `${Math.floor(total / 60)}h ${total % 60}m` : '—'; }
  protected dayLabel(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  protected shortDay(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  }
}
