import { Component, inject, input, output, signal } from '@angular/core';
import { ReferrersApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { Referrer } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

/**
 * "Mark as paid" for a referrer, used by the Referrals list and the referrer's own page.
 * It records that you have paid them what they are owed (their referral amount on bills that stand and have not been paid out).
 * It does not move any money. The amount you see here travels with the request: if it is no longer exactly what is owed
 * (a bill was made or voided meanwhile, or someone else already paid it), the server pays NOTHING and the page is refreshed.
 */
@Component({
  selector: 'app-referral-pay',
  imports: [ModalComponent, MoneyPipe],
  template: `
    <app-modal [title]="'Mark ' + referrer().name + ' as paid'" (closed)="cancelled.emit()">
      <div class="stack">
        <p>Record that you have paid <strong>{{ referrer().name }}</strong> <strong>{{ owed() | money: true }}</strong>, their referral amount on bills that have not been paid out yet.</p>
        <p class="muted small">This only records the payment. It does not move any money, and it cannot be undone here. Voided bills are not included.</p>
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="pay()">{{ busy() ? 'Saving…' : 'Mark ' + (owed() | money: true) + ' as paid' }}</button>
      </ng-container>
    </app-modal>`,
})
export class ReferralPayComponent {
  private readonly api = inject(ReferrersApi);
  private readonly toast = inject(ToastService);
  private readonly money = new MoneyPipe();

  readonly referrer = input.required<Referrer>();
  /** The dialog is finished, whether it paid or not: the page should reload what it shows. */
  readonly done = output<void>();
  readonly cancelled = output<void>();
  protected readonly busy = signal(false);

  protected owed() { return this.referrer().owed ?? 0; }

  protected pay() {
    const r = this.referrer();
    this.busy.set(true);
    this.api.pay(r.id, this.owed()).subscribe({
      next: (x) => { this.busy.set(false); this.toast.success(`${this.money.transform(x.amount, true)} marked as paid to ${x.referrerName}`); this.done.emit(); },
      error: (e) => {
        // Whatever went wrong (the amount changed, or it was already paid), nothing was paid: say why and show the truth.
        this.busy.set(false);
        this.toast.error(parseError(e).message);
        this.done.emit();
      },
    });
  }
}
