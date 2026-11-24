import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InvoicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { A4Invoice } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { InvoiceShareComponent } from './invoice-share.component';

/** The one rule that makes the sheet A4 when it is printed. It is added just before printing and removed straight after (see print()). */
const A4_PAGE_RULE = '@page { size: A4 portrait; margin: 12mm 12mm 14mm; }';
const STYLE_ID = 'a4-page-style';

/**
 * The A4 tax invoice: a preview on screen and a print. It is a separate page from the 80mm receipt (which is untouched): own route, own
 * Print button, own paper size. It draws the invoice the server built from what the bill saved (GET /invoices/:id/a4); nothing here is
 * calculated, so an old bill prints the GST it was made with and never today's settings.
 *
 * Template note: Angular allows "; as m" only on the FIRST @if of a chain, so the loaded invoice is the first block and loading/error follow it.
 *
 * Why the paper size is added only while printing: `@page` cannot be limited to one component, and the 80mm receipt must keep printing on
 * whatever roll the thermal printer has. So the A4 rule is put into the document just before window.print() and taken out again afterwards.
 */
@Component({
  selector: 'app-invoice-a4',
  imports: [RouterLink, IconComponent, InvoiceShareComponent],
  template: `
    <div class="page a4-page">
      <div class="page-head no-print">
        <a class="btn btn-ghost" [routerLink]="[base, 'invoices', id]"><app-icon name="arrow-left" /> Back to bill</a>
        @if (model(); as m) {
          <div class="row">
            <app-invoice-share [invoice]="{ id: m.invoiceId, status: m.status, customerPhone: m.customer.phone }" />
            <button type="button" class="btn btn-primary" (click)="print()"><app-icon name="printer" /> Print A4</button>
          </div>
        }
      </div>

      @if (model(); as m) {
        <p class="a4-hint no-print">This is the A4 tax invoice. It is a separate print from the 80mm receipt, which is unchanged.</p>
        <div class="a4-scroll">
          <article class="a4-sheet" [class.is-void]="m.isVoid" aria-label="A4 tax invoice">
            @if (m.isVoid) { <div class="a4-void" aria-hidden="true">VOID</div> }

            <header class="a4-head">
              <div class="a4-seller">
                <h1>{{ m.seller.name }}</h1>
                @for (l of m.seller.addressLines; track $index) { <p>{{ l }}</p> }
                @if (m.seller.phone) { <p>Phone: {{ m.seller.phone }}</p> }
                @if (m.seller.gstin) { <p class="strong">GSTIN: {{ m.seller.gstin }}</p> }
                @else if (m.seller.gstinNote) { <p class="soft">GSTIN: {{ m.seller.gstinNote }}</p> }
              </div>
              <div class="a4-doc">
                <h2>{{ m.title }}</h2>
                <dl>
                  @for (x of m.meta; track x.label) { <div><dt>{{ x.label }}</dt><dd>{{ x.value }}</dd></div> }
                </dl>
              </div>
            </header>

            <section class="a4-billto">
              <h3>BILL TO</h3>
              <p class="name">{{ m.customer.name }}</p>
              <p [class.soft]="!m.customer.phone">Phone: {{ m.customer.phoneText }}</p>
            </section>

            <table class="a4-lines">
              <thead>
                <tr>
                  <th class="c-no">#</th><th class="c-desc">Description</th><th class="c-sac">SAC</th>
                  <th class="c-num">Qty</th><th class="c-num">Rate</th><th class="c-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                @for (l of m.lines; track l.no) {
                  <tr>
                    <td class="c-no soft">{{ l.no }}</td>
                    <td class="c-desc">{{ l.name }}@if (l.detail) { <span class="detail">{{ l.detail }}</span> }</td>
                    <td class="c-sac" [class.soft]="!l.sac">{{ l.sac ?? '—' }}</td>
                    <td class="c-num">{{ l.quantityText }}</td>
                    <td class="c-num">{{ l.unitPriceText }}</td>
                    <td class="c-num strong">{{ l.amountText }}</td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="a4-closing">
              @if (m.taxTable; as t) {
                <table class="a4-tax">
                  <thead><tr>@for (c of t.columns; track c) { <th>{{ c }}</th> }</tr></thead>
                  <tbody><tr>@for (v of t.row; track $index) { <td [class.strong]="$last">{{ v }}</td> }</tr></tbody>
                </table>
                @if (t.note) { <p class="a4-tax-note">{{ t.note }}</p> }
              }

              <div class="a4-cols">
                <section class="a4-pay">
                  <h3>{{ m.payment.heading }} <span class="chip" [class.void]="m.payment.status === 'VOID'">{{ m.payment.status }}</span></h3>
                  @for (r of m.payment.rows; track r.label) {
                    <p class="pay-row">@if (m.payment.split) { <span>{{ r.label }}</span><span>{{ r.value }}</span> } @else { Paid by {{ r.label }} }</p>
                  }
                  @if (m.payment.tip) { <p class="soft small">{{ m.payment.tip }}</p> }
                </section>

                <section class="a4-sums">
                  @for (r of m.summary; track r.key) {
                    <div class="sum" [class.discount]="r.kind === 'discount'" [class.grand]="r.kind === 'total'"><span>{{ r.label }}</span><span>{{ r.value }}</span></div>
                  }
                  @if (m.included; as inc) {
                    <div class="included">
                      <p class="soft strong">{{ inc.heading }}</p>
                      @for (r of inc.rows; track r.key) { <div class="sum"><span>{{ r.label }}</span><span>{{ r.value }}</span></div> }
                    </div>
                  }
                </section>
              </div>

              @if (m.isVoid && m.voidNote) { <p class="a4-note void-note">{{ m.voidNote }}</p> }
              @for (n of m.notes; track $index) { <p class="a4-note">{{ n }}</p> }
              <footer class="a4-foot">@for (f of m.footer; track $index) { <p>{{ f }}</p> }</footer>
            </div>
          </article>
        </div>
      } @else if (loading()) {
        <div class="skeleton no-print" style="height: 640px"></div>
      } @else if (error()) {
        <div class="panel empty no-print"><h3>Could not open this invoice</h3><p>{{ error() }}</p><a class="btn btn-secondary" [routerLink]="[base, 'invoices']">Back to bills</a></div>
      }
    </div>`,
  styles: [`
    .a4-page { max-width: 960px; }
    .a4-hint { margin: 0 0 12px; color: var(--muted); font-size: 13.5px; }
    .a4-scroll { overflow-x: auto; padding-bottom: 12px; }

    /* The sheet: 210mm wide, like the paper. On screen it has a margin of its own; in print the PAGE margin does that job. */
    .a4-sheet { position: relative; box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm; background: #fff; color: #241a27; font-size: 10.5pt; line-height: 1.35;
      box-shadow: 0 1px 3px rgba(36, 26, 39, 0.12), 0 8px 24px rgba(36, 26, 39, 0.10); }
    .a4-sheet p { margin: 0; }
    .strong { font-weight: 700; }
    .soft { color: #6e6275; }
    .small { font-size: 9pt; }

    .a4-head { display: flex; justify-content: space-between; gap: 16mm; padding-bottom: 5mm; border-bottom: 0.6mm solid #b0245c; }
    .a4-seller h1 { margin: 0 0 1.5mm; font-size: 17pt; line-height: 1.2; }
    .a4-seller p { color: #4a3f4f; font-size: 9.5pt; }
    .a4-doc { text-align: right; flex: none; }
    .a4-doc h2 { margin: 0 0 2.5mm; font-size: 21pt; letter-spacing: 0.01em; color: #b0245c; }
    .a4-doc dl { margin: 0; display: grid; gap: 1mm; }
    .a4-doc dl div { display: flex; gap: 6mm; justify-content: space-between; }
    .a4-doc dt { color: #6e6275; font-size: 9pt; }
    .a4-doc dd { margin: 0; font-weight: 700; }

    .a4-billto { margin: 5mm 0; }
    .a4-billto h3 { margin: 0 0 1.5mm; font-size: 8pt; letter-spacing: 0.08em; color: #6e6275; }
    .a4-billto .name { font-size: 11.5pt; font-weight: 700; }
    .a4-billto p:last-child { font-size: 9.5pt; color: #4a3f4f; }

    table { width: 100%; border-collapse: collapse; }
    .a4-lines thead th { background: #fbe9f1; color: #b0245c; font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; text-align: left; padding: 2.2mm 2mm; }
    .a4-lines td { padding: 2.4mm 2mm; border-bottom: 0.2mm solid #e5dfe9; vertical-align: top; }
    .c-no { width: 9mm; } .c-sac { width: 22mm; } .c-num { width: 24mm; text-align: right !important; }
    .c-desc .detail { display: block; margin-top: 0.8mm; color: #6e6275; font-size: 8.5pt; }

    .a4-closing { margin-top: 5mm; }
    .a4-tax th { background: #faf8fb; border: 0.2mm solid #e5dfe9; color: #6e6275; font-size: 8pt; letter-spacing: 0.04em; text-transform: uppercase; text-align: right; padding: 2mm 2.5mm; }
    .a4-tax td { border: 0.2mm solid #e5dfe9; text-align: right; padding: 2.2mm 2.5mm; }
    .a4-tax-note { margin-top: 1.5mm; color: #6e6275; font-size: 8.5pt; }

    .a4-cols { display: flex; justify-content: space-between; gap: 12mm; margin-top: 5mm; align-items: flex-start; }
    .a4-pay { flex: 1; }
    .a4-pay h3 { margin: 0 0 2mm; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6e6275; display: flex; justify-content: space-between; align-items: center; }
    .chip { background: #276b4d; color: #fff; padding: 0.6mm 2.4mm; font-size: 8pt; font-weight: 700; letter-spacing: 0.04em; }
    .chip.void { background: #b3261e; }
    .pay-row { display: flex; justify-content: space-between; margin-bottom: 1mm; color: #4a3f4f; }
    .a4-sums { width: 80mm; flex: none; }
    .sum { display: flex; justify-content: space-between; gap: 4mm; padding: 1.2mm 1mm; border-bottom: 0.15mm solid #e5dfe9; font-size: 9.5pt; color: #4a3f4f; }
    .sum.discount { color: #276b4d; }
    .sum.grand { margin-top: 1.5mm; padding: 2.6mm 3mm; background: #b0245c; color: #fff; font-size: 12pt; font-weight: 700; border: 0; text-transform: uppercase; }
    .included { margin-top: 3mm; font-size: 9pt; }
    .included .soft { margin-bottom: 1mm; }
    .a4-note { margin-top: 3mm; color: #6e6275; font-size: 8.5pt; }
    .void-note { color: #b3261e; }
    .a4-foot { margin-top: 6mm; padding-top: 3mm; border-top: 0.2mm solid #e5dfe9; text-align: center; color: #6e6275; font-size: 9pt; }

    .a4-void { position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-28deg); font-size: 110pt; font-weight: 800; color: rgba(179, 38, 30, 0.14); pointer-events: none; letter-spacing: 0.06em; }

    /* ── Print ── The page rules (@page size and margin) are added by print(); the global print stylesheet already hides the menu, top bar and toasts. */
    @media print {
      .a4-page { max-width: none; padding: 0; }
      .a4-scroll { overflow: visible; padding: 0; }
      .a4-sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .a4-lines thead { display: table-header-group; }          /* the column heads repeat on every page */
      .a4-lines tr, .a4-tax tr { break-inside: avoid; page-break-inside: avoid; }
      .a4-closing { break-inside: avoid; page-break-inside: avoid; }  /* tax summary, totals and payment stay together */
      .a4-head, .a4-billto { break-after: avoid; }
      .a4-void { position: fixed; }
    }
  `],
})
export class InvoiceA4Component implements OnDestroy {
  private readonly api = inject(InvoicesApi);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly base = this.auth.basePath();
  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly model = signal<A4Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private afterPrint: (() => void) | null = null;

  constructor() {
    this.api.a4(this.id).subscribe({
      next: (m) => { this.model.set(m); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  /** Prints the A4 invoice. The paper-size rule exists only while the print dialog is open, so the 80mm receipt is never affected by it. */
  protected print() {
    this.removePageRule();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = A4_PAGE_RULE;
    document.head.appendChild(style);
    this.afterPrint = () => this.removePageRule();
    window.addEventListener('afterprint', this.afterPrint, { once: true });
    window.print();
    // Nothing removes the rule here on purpose: some browsers return from print() before the preview has drawn, and removing it then would lose
    // the A4 size. It goes on `afterprint`, when this page is left (ngOnDestroy), or when print() is pressed again.
  }

  private removePageRule() {
    document.getElementById(STYLE_ID)?.remove();
    if (this.afterPrint) { window.removeEventListener('afterprint', this.afterPrint); this.afterPrint = null; }
  }

  ngOnDestroy() { this.removePageRule(); }
}
