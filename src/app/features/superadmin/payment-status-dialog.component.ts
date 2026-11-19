import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { parseError } from '../../core/errors';
import { METHOD_LABEL, SubscriptionMeta, SubscriptionPayment, SubscriptionsApi, todayIso } from '../../core/subscriptions';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

/**
 * Moves a subscription payment on: a pending one to paid (it was received) or failed (it never came), a paid one to refunded (it was given
 * back). The platform admin is the only one who can say so: nothing is ever marked paid automatically and no gateway is involved.
 * The amount of a payment can never be changed, and failed and refunded are final.
 */
@Component({
  selector: 'app-payment-status-dialog',
  imports: [FormsModule, ModalComponent, MoneyPipe],
  template: `
    <app-modal [title]="title()" (closed)="cancelled.emit()">
      <form id="payment-status-form" (submit)="$event.preventDefault(); save()" class="stack" novalidate>
        <p>
          {{ payment().amount | money: true }} by {{ methods[payment().method] }}
          @if (payment().parlourName) { for <strong>{{ payment().parlourName }}</strong> }
          ({{ payment().planName }}, {{ payment().billingCycle }}).
        </p>
        @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }

        @if (target() === 'paid') {
          <div class="form-grid">
            <div class="field" [class.invalid]="fields()['paymentDate']">
              <label class="label" for="ps-date">Date received</label>
              <input id="ps-date" class="input" type="date" [max]="today" [ngModel]="date()" (ngModelChange)="date.set($event)" name="date" />
              @if (fields()['paymentDate']; as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field" [class.invalid]="fields()['reference']">
              <label class="label" for="ps-ref">Transaction reference{{ needsReference() ? '' : ' (optional)' }}</label>
              <input id="ps-ref" class="input" autocomplete="off" [ngModel]="reference()" (ngModelChange)="reference.set($event)" name="reference" />
              @if (fields()['reference']; as m) { <span class="field-error">{{ m }}</span> } @else if (needsReference()) { <span class="hint">UPI id, bank reference, cheque number or card slip number.</span> }
            </div>
          </div>
        } @else if (target() === 'refunded') {
          <p class="muted small">Use this when the money was given back. It stops counting as received. This cannot be undone.</p>
        } @else {
          <p class="muted small">Use this when the payment did not come through. This cannot be undone; record a new payment if it is tried again.</p>
        }

        <div class="field">
          <label class="label" for="ps-note">Note (optional)</label>
          <input id="ps-note" class="input" autocomplete="off" maxlength="500" [ngModel]="note()" (ngModelChange)="note.set($event)" name="note" />
        </div>
      </form>
      <ng-container modal-foot>
        <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Cancel</button>
        <button type="submit" form="payment-status-form" class="btn" [class.btn-primary]="target() === 'paid'" [class.btn-danger]="target() !== 'paid'" [disabled]="busy()">{{ busy() ? 'Saving…' : confirmLabel() }}</button>
      </ng-container>
    </app-modal>`,
})
export class PaymentStatusDialogComponent {
  private readonly api = inject(SubscriptionsApi);
  private readonly toast = inject(ToastService);

  readonly payment = input.required<SubscriptionPayment>();
  readonly target = input.required<'paid' | 'failed' | 'refunded'>();
  readonly meta = input.required<SubscriptionMeta>();
  readonly saved = output<SubscriptionPayment>();
  readonly cancelled = output<void>();

  protected readonly methods = METHOD_LABEL;
  protected readonly today = todayIso();
  protected readonly date = signal(todayIso());
  protected readonly reference = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly fields = signal<Record<string, string>>({});

  protected title() { return this.target() === 'paid' ? 'Mark as received' : this.target() === 'failed' ? 'Mark as failed' : 'Mark as refunded'; }
  protected confirmLabel() { return this.target() === 'paid' ? 'Mark as received' : this.target() === 'failed' ? 'Mark as failed' : 'Mark as refunded'; }
  /** UPI, bank, cheque and card payments cannot be marked received without a reference, unless one is already on the payment. */
  protected needsReference() { return this.meta().referenceRequiredMethods.includes(this.payment().method) && !this.payment().reference; }

  protected save() {
    this.error.set('');
    this.fields.set({});
    const p = this.payment();
    const target = this.target();
    const body: { status: 'paid' | 'failed' | 'refunded'; reference?: string; paymentDate?: string; notes?: string } = { status: target };
    if (target === 'paid') {
      if (this.date()) body.paymentDate = this.date();
      const ref = this.reference().trim();
      if (ref) body.reference = ref;
      if (this.needsReference() && !ref) { this.fields.set({ reference: 'Enter the transaction reference, so the payment can be traced' }); return; }
    }
    const note = this.note().trim();
    if (note) body.notes = note;

    this.busy.set(true);
    this.api.updatePayment(p.id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.toast.success(target === 'paid' ? 'Payment marked as received' : target === 'failed' ? 'Payment marked as failed' : 'Payment marked as refunded');
        this.saved.emit(updated);
      },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (Object.keys(info.fields).length) this.fields.set(info.fields);
        else this.error.set(info.message);
      },
    });
  }
}
