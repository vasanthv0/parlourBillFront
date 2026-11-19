import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { PlatformApi } from '../../core/api';
import { entityLabel, rangeToIso, toneOf, valueLines } from '../../core/activity-log';
import { parseError } from '../../core/errors';
import { ActivityLogFilters, PageMeta, PlatformActivityLog } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';

/**
 * What the platform admins changed, newest first. Read-only: there is nothing here that edits or deletes an entry, and the
 * API has no route that could. Every value is shown as text (never as HTML), so a parlour named with markup stays a name.
 * Only reachable by the platform admin (the /superadmin routes are behind roleGuard('super_admin'), and the API checks again).
 */
@Component({
  selector: 'app-activity-logs',
  imports: [FormsModule, DatePipe, IconComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Activity logs</h1>
          <p class="sub">What the platform admins changed, and when. Entries are written by the server and cannot be edited or deleted.</p>
        </div>
      </div>

      <div class="toolbar filters">
        <div class="field grow">
          <label class="label" for="al-search">Search</label>
          <div class="input-affix">
            <input id="al-search" class="input" type="search" placeholder="Parlour, admin or what was done" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
            <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
          </div>
        </div>
        <div class="field">
          <label class="label" for="al-from">From</label>
          <input id="al-from" class="input" type="date" [ngModel]="from()" [max]="to() || ''" (ngModelChange)="setDate('from', $event)" />
        </div>
        <div class="field">
          <label class="label" for="al-to">To</label>
          <input id="al-to" class="input" type="date" [ngModel]="to()" [min]="from() || ''" (ngModelChange)="setDate('to', $event)" />
        </div>
        <div class="field">
          <label class="label" for="al-admin">Admin</label>
          <select id="al-admin" class="select" [ngModel]="actorId()" (ngModelChange)="pick('actorId', $event)">
            <option value="">All admins</option>
            @for (a of filters().admins; track a.id) { <option [value]="a.id">{{ a.name }}</option> }
          </select>
        </div>
        <div class="field">
          <label class="label" for="al-parlour">Parlour</label>
          <select id="al-parlour" class="select" [ngModel]="parlourId()" (ngModelChange)="pick('parlourId', $event)">
            <option value="">All parlours</option>
            @for (p of filters().parlours; track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
        </div>
        <div class="field">
          <label class="label" for="al-action">Action</label>
          <select id="al-action" class="select" [ngModel]="action()" (ngModelChange)="pick('action', $event)">
            <option value="">All actions</option>
            @for (a of filters().actions; track a.value) { <option [value]="a.value">{{ a.label }}</option> }
          </select>
        </div>
        @if (filtered()) { <button type="button" class="btn btn-secondary" (click)="clear()">Clear filters</button> }
      </div>
      @if (rangeError()) { <p class="field-error" role="alert" style="margin: -4px 0 12px">{{ rangeError() }}</p> }

      @if (loading() && !items().length) {
        <div class="skeleton" style="height: 320px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load the activity log</h3><p>{{ error() }}</p><button type="button" class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          @if (filtered()) { <h3>Nothing matches these filters</h3><p>Try a wider date range, or clear the filters.</p><button type="button" class="btn btn-secondary" (click)="clear()">Clear filters</button> }
          @else { <h3>No activity yet</h3><p>When a platform admin creates, edits, suspends or deletes a parlour, or switches a page on or off, it is recorded here.</p> }
        </div>
      } @else {
        <div class="table-wrap" [class.busy]="loading()">
          <table class="table">
            <thead>
              <tr><th>Date and time</th><th>Admin</th><th>Action</th><th>Parlour</th><th>Entity</th><th>Description</th><th><span class="sr-only">Details</span></th></tr>
            </thead>
            <tbody>
              @for (l of items(); track l.id) {
                <tr>
                  <td class="nowrap">{{ l.createdAt | date: 'd MMM y' }}<div class="muted small">{{ l.createdAt | date: 'h:mm:ss a' }}</div></td>
                  <td>{{ l.actor.name }}</td>
                  <td>
                    <span class="badge" [class.badge-paid]="tone(l) === 'good'" [class.badge-void]="tone(l) === 'bad'" [class.badge-warn]="tone(l) === 'warn'">{{ l.actionLabel }}</span>
                  </td>
                  <td>@if (l.parlour) { {{ l.parlour.name }} } @else { <span class="muted">Platform</span> }</td>
                  <td class="muted small" [title]="l.entity.id ?? ''">{{ entity(l) }}</td>
                  <td>{{ l.description }}</td>
                  <td class="cell-actions">
                    <button type="button" class="btn btn-secondary btn-sm" [attr.aria-expanded]="openId() === l.id" [attr.aria-controls]="'al-detail-' + l.id" (click)="toggle(l.id)">
                      {{ openId() === l.id ? 'Hide' : 'Details' }}
                    </button>
                  </td>
                </tr>
                @if (openId() === l.id) {
                  <tr class="detail-row">
                    <td colspan="7" [id]="'al-detail-' + l.id">
                      <div class="detail">
                        <div>
                          <h4>Before</h4>
                          @for (line of lines(l.previousValues); track line.key) { <div class="kv"><span class="k">{{ line.key }}</span><span class="v">{{ line.text }}</span></div> }
                          @empty { <p class="muted small">{{ l.previousValues ? 'No fields' : 'Nothing: this did not exist before' }}</p> }
                        </div>
                        <div>
                          <h4>After</h4>
                          @for (line of lines(l.newValues); track line.key) { <div class="kv"><span class="k">{{ line.key }}</span><span class="v">{{ line.text }}</span></div> }
                          @empty { <p class="muted small">{{ l.newValues ? 'No fields' : 'Nothing: this no longer exists' }}</p> }
                        </div>
                        <div>
                          <h4>Where from</h4>
                          <div class="kv"><span class="k">Request ID</span><span class="v mono">{{ l.requestId ?? 'Not recorded' }}</span></div>
                          <div class="kv"><span class="k">IP address</span><span class="v mono">{{ l.ip ?? 'Not recorded' }}</span></div>
                          <div class="kv"><span class="k">Entry ID</span><span class="v mono">{{ l.id }}</span></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
          <div class="table-foot">
            <span>{{ meta().total }} entr{{ meta().total === 1 ? 'y' : 'ies' }}</span>
            <span class="row">
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
              <span>Page {{ meta().page }} of {{ meta().pages }}</span>
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
            </span>
          </div>
        </div>
      }
    </div>`,
  styles: [`
    .filters { align-items: flex-end; }
    .filters .field { min-width: 150px; }
    .filters .field.grow { min-width: 220px; }
    .busy { opacity: 0.6; transition: opacity 0.15s; }
    .detail-row > td { background: var(--sunken); }
    .detail { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; padding: 4px 0; }
    .detail h4 { margin: 0 0 8px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .kv { display: flex; gap: 10px; padding: 3px 0; font-size: 13.5px; }
    .kv .k { flex: 0 0 96px; color: var(--muted); }
    .kv .v { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; }
  `],
})
export class ActivityLogsComponent {
  private readonly api = inject(PlatformApi);
  private readonly typed$ = new Subject<string>();
  private ticket = 0; // an answer that arrives after a newer question was asked is ignored

  protected readonly items = signal<PlatformActivityLog[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly filters = signal<ActivityLogFilters>({ actions: [], admins: [], parlours: [] });
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly rangeError = signal('');
  protected readonly openId = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly actorId = signal('');
  protected readonly parlourId = signal('');
  protected readonly action = signal('');
  protected readonly filtered = computed(() => !!(this.search().trim() || this.from() || this.to() || this.actorId() || this.parlourId() || this.action()));

  protected readonly tone = (l: PlatformActivityLog) => toneOf(l.action);
  protected readonly entity = (l: PlatformActivityLog) => entityLabel(l.entity.type, l.entity.id);
  protected readonly lines = valueLines;

  constructor() {
    // A link such as /superadmin/activity-logs?parlourId=… opens the page already filtered.
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    this.parlourId.set(query.get('parlourId') ?? '');
    this.actorId.set(query.get('actorId') ?? '');
    this.action.set(query.get('action') ?? '');

    this.typed$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.go(1));
    this.api.activityLogFilters().subscribe({ next: (f) => this.filters.set(f), error: () => undefined });
    this.load();
  }

  protected onSearch(q: string) { this.search.set(q); this.typed$.next(q.trim()); }
  protected setDate(which: 'from' | 'to', value: string) { (which === 'from' ? this.from : this.to).set(value ?? ''); this.go(1); }
  protected pick(which: 'actorId' | 'parlourId' | 'action', value: string) { this[which].set(value ?? ''); this.go(1); }
  protected toggle(id: string) { this.openId.update((current) => (current === id ? null : id)); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }
  protected clear() {
    for (const s of [this.search, this.from, this.to, this.actorId, this.parlourId, this.action]) s.set('');
    this.go(1);
  }

  protected load() {
    const range = rangeToIso(this.from(), this.to());
    this.rangeError.set(range.error ?? '');
    if (range.error) return; // do not ask the server a question that cannot be answered

    const ticket = ++this.ticket;
    this.loading.set(true);
    this.error.set('');
    this.openId.set(null);
    this.api
      .activityLogs({
        page: this.meta().page,
        limit: 20,
        search: this.search().trim(),
        from: range.from,
        to: range.to,
        actorId: this.actorId(),
        parlourId: this.parlourId(),
        action: this.action(),
      })
      .subscribe({
        next: (r) => { if (ticket !== this.ticket) return; this.items.set(r.items); this.meta.set(r.meta); this.loading.set(false); },
        error: (e) => { if (ticket !== this.ticket) return; this.items.set([]); this.error.set(parseError(e).message); this.loading.set(false); },
      });
  }
}
