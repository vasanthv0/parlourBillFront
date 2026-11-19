import { Component, input, model } from '@angular/core';
import { METHOD_LABEL, PaymentDraft, SubscriptionMeta } from '../../core/subscriptions';

/**
 * The "money that came with it" part of a subscription dialog. A PARLOUR paying YOU for ParlourBill, entered by hand: nothing is collected
 * online and nothing is marked received unless the platform admin says so here. Not the payment on a customer's bill.
 * It holds only what was typed; the dialog that uses it checks it (paymentFromDraft) and sends it with the change, in one step.
 */
@Component({
  selector: 'app-payment-fields',
  template: `
    @if (optional()) {
      <label class="check">
        <input type="checkbox" [checked]="draft().include" (change)="patch({ include: $any($event.target).checked })" />
        <span>{{ prompt() }}</span>
      </label>
    }
    @if (draft().include || !optional()) {
      <div class="form-grid pay">
        <div class="field" [class.invalid]="errors()['amount']">
          <label class="label" [attr.for]="id + '-amount'">Amount (₹)</label>
          <input [id]="id + '-amount'" class="input" inputmode="decimal" autocomplete="off" [value]="draft().amount" (input)="patch({ amount: $any($event.target).value })" />
          @if (errors()['amount']; as m) { <span class="field-error">{{ m }}</span> }
        </div>
        <div class="field" [class.invalid]="errors()['method']">
          <label class="label" [attr.for]="id + '-method'">Paid by</label>
          <select [id]="id + '-method'" class="select" (change)="patch({ method: $any($event.target).value })">
            @for (m of meta().paymentMethods; track m) { <option [value]="m" [selected]="draft().method === m">{{ methods[m] }}</option> }
          </select>
          @if (errors()['method']; as m) { <span class="field-error">{{ m }}</span> }
        </div>
        <div class="field">
          <label class="label" [attr.for]="id + '-status'">Status</label>
          <select [id]="id + '-status'" class="select" (change)="patch({ status: $any($event.target).value })">
            <option value="paid" [selected]="draft().status === 'paid'">Received</option>
            <option value="pending" [selected]="draft().status === 'pending'">Expected, not received yet</option>
          </select>
        </div>
        <div class="field" [class.invalid]="errors()['paymentDate']">
          <label class="label" [attr.for]="id + '-date'">{{ draft().status === 'paid' ? 'Date received' : 'Expected on' }}</label>
          <input [id]="id + '-date'" class="input" type="date" [value]="draft().date" (input)="patch({ date: $any($event.target).value })" />
          @if (errors()['paymentDate']; as m) { <span class="field-error">{{ m }}</span> }
        </div>
        <div class="field span-2" [class.invalid]="errors()['reference']">
          <label class="label" [attr.for]="id + '-ref'">Transaction reference{{ referenceNeeded() ? '' : ' (optional)' }}</label>
          <input [id]="id + '-ref'" class="input" autocomplete="off" spellcheck="false" [value]="draft().reference" (input)="patch({ reference: $any($event.target).value })" />
          @if (errors()['reference']; as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">UPI id, bank reference, cheque number or card slip number. The same reference cannot be recorded twice for one method.</span> }
        </div>
        <div class="field span-2" [class.invalid]="errors()['notes']">
          <label class="label" [attr.for]="id + '-notes'">Note (optional, only you see it)</label>
          <input [id]="id + '-notes'" class="input" autocomplete="off" maxlength="500" [value]="draft().notes" (input)="patch({ notes: $any($event.target).value })" />
          @if (errors()['notes']; as m) { <span class="field-error">{{ m }}</span> }
        </div>
      </div>
    }`,
  styles: [`
    .check { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; cursor: pointer; }
    .check input { margin-top: 3px; }
    .pay { margin-top: 12px; }
  `],
})
export class PaymentFieldsComponent {
  readonly draft = model.required<PaymentDraft>();
  readonly meta = input.required<SubscriptionMeta>();
  /** Field messages from checking or from the server: amount, method, paymentDate, reference, notes. */
  readonly errors = input<Record<string, string>>({});
  /** True: a checkbox decides whether a payment is recorded at all. False: the fields are always shown. */
  readonly optional = input(true);
  readonly prompt = input('Record a payment now');
  /** Makes the field ids unique when two sets are ever on one page. */
  readonly id = `pf${Math.random().toString(36).slice(2, 8)}`;
  protected readonly methods = METHOD_LABEL;

  protected patch(change: Partial<PaymentDraft>) { this.draft.update((d) => ({ ...d, ...change })); }
  protected referenceNeeded() { return this.draft().status === 'paid' && this.meta().referenceRequiredMethods.includes(this.draft().method); }
}
