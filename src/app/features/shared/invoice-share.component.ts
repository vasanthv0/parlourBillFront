import { Component, computed, inject, input, signal } from '@angular/core';
import { InvoicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { canShareFile, fileOf, hasPhoneDigits, kindName, MANUAL_STEPS, prettyPhone, SHARED_NOTE, shareButtons, shareFile, ShareStage, STAGE_TEXT } from '../../core/invoice-share';
import { InvoiceShare, ShareKind } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

/** The bill, as far as sharing is concerned. Both the bill page and the A4 page can supply it. */
export interface Shareable { id: string; status: string; customerPhone: string | null }

interface Ready { result: InvoiceShare; file: File; stages: ShareStage[]; note: string; canShare: boolean }

/**
 * "Send PDF on WhatsApp" and "Send Image on WhatsApp" (Task 6). Two separate buttons, each shown only when ITS OWN switch is on (the server
 * checks the same switch, so hiding is only a courtesy). Clicking one asks the server to check the customer's saved number and make the file;
 * a dialog then offers the ways to hand it to WhatsApp.
 *
 * What this never does: say the invoice was sent or delivered. A browser cannot put a file into a WhatsApp chat, and this app has no
 * WhatsApp Business connection, so the person always presses Send in WhatsApp themselves. The dialog shows only what really happened:
 * Generated, then (if they use them) Opened in the share sheet / Downloaded / WhatsApp chat opened.
 */
@Component({
  selector: 'app-invoice-share',
  imports: [IconComponent, ModalComponent],
  template: `
    @if (kinds().length && invoice().status === 'paid') {
      <span class="share-group" role="group" aria-label="Send the invoice on WhatsApp">
        @for (k of kinds(); track k) {
          <button type="button" class="btn btn-secondary" [class.share-pdf]="k === 'pdf'" [class.share-image]="k === 'image'"
                  [disabled]="working() !== null" [attr.aria-busy]="working() === k" (click)="start(k)">
            <app-icon name="whatsapp" />
            {{ working() === k ? 'Making ' + name(k) + '…' : k === 'pdf' ? 'Send PDF on WhatsApp' : 'Send Image on WhatsApp' }}
          </button>
        }
      </span>
    }

    @if (ready(); as r) {
      <app-modal [title]="'Invoice ' + name(r.result.kind) + ' ready'" (closed)="ready.set(null)">
        <div class="stack share-dialog">
          <p class="file"><strong>{{ r.result.file.name }}</strong> <span class="muted">· {{ size(r.result) }}@if (r.result.file.pages > 1) { · {{ r.result.file.pages }} pages }</span></p>
          <p class="to">For <strong class="num">{{ phone(r.result) }}</strong></p>

          <ul class="stages" aria-label="What has happened so far">
            @for (s of r.stages; track s) { <li><app-icon name="check" [size]="14" /> {{ stageText(s) }}</li> }
          </ul>

          @if (r.canShare) {
            <p>Press <strong>Share…</strong>, choose WhatsApp and the customer, then press Send there.</p>
          } @else {
            <ol class="steps">@for (s of steps; track s) { <li>{{ s }}</li> }</ol>
          }
          @if (r.note) { <p class="note" role="status">{{ r.note }}</p> }
          <p class="muted small">{{ r.result.delivery.note }}</p>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="download(r)">Download {{ name(r.result.kind) }}</button>
          <button type="button" class="btn btn-secondary" (click)="openChat(r)"><app-icon name="whatsapp" [size]="16" /> Open WhatsApp chat</button>
          @if (r.canShare) { <button type="button" class="btn btn-primary" (click)="shareSheet(r)">Share…</button> }
        </ng-container>
      </app-modal>
    }`,
  styles: [`
    :host { display: contents; }
    .share-group { display: inline-flex; gap: 8px; flex-wrap: wrap; }
    .share-dialog p { margin: 0; }
    .stages { list-style: none; margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--sage-tint); color: var(--sage); display: grid; gap: 4px; font-weight: 600; li { display: flex; gap: 8px; align-items: center; } }
    .steps { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
    .note { padding: 10px 12px; border-radius: 8px; background: var(--amber-tint); color: var(--amber); }
  `],
})
export class InvoiceShareComponent {
  private readonly api = inject(InvoicesApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly invoice = input.required<Shareable>();

  /** The two switches decide the two buttons, independently. The server enforces each of them again. */
  protected readonly kinds = computed(() => shareButtons(this.auth.hasFeature('action.whatsapp.invoice_pdf'), this.auth.hasFeature('action.whatsapp.invoice_image')));
  /** Which file is being made right now. While one is, both buttons wait: no double clicks, and only one dialog at a time. */
  protected readonly working = signal<ShareKind | null>(null);
  protected readonly ready = signal<Ready | null>(null);
  protected readonly steps = MANUAL_STEPS;

  protected name(kind: ShareKind) { return kindName(kind); }
  protected stageText(s: ShareStage) { return STAGE_TEXT[s]; }
  protected phone(r: InvoiceShare) { return prettyPhone(r.recipient.phone); }
  protected size(r: InvoiceShare) { const kb = r.file.sizeBytes / 1024; return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`; }

  protected start(kind: ShareKind) {
    if (this.working()) return;
    const inv = this.invoice();
    // The server checks the number properly. This only saves a trip when there is plainly nothing to check.
    if (!hasPhoneDigits(inv.customerPhone)) {
      this.toast.error('This bill has no customer phone number to send it to. Add the number to the customer, then try again.');
      return;
    }
    this.working.set(kind);
    this.api.share(inv.id, kind).subscribe({
      next: (result) => {
        this.working.set(null);
        const file = fileOf(result);
        this.ready.set({ result, file, stages: ['generated'], note: '', canShare: canShareFile(file) });
      },
      error: (e) => {
        this.working.set(null);
        this.toast.error(parseError(e).message);
      },
    });
  }

  private mark(stage: ShareStage, note?: string) {
    this.ready.update((r) => (r ? { ...r, stages: r.stages.includes(stage) ? r.stages : [...r.stages, stage], note: note ?? r.note } : r));
  }

  /** Saves the file to the device. This is the manual route's first step, and it needs no WhatsApp at all. */
  protected download(r: Ready) {
    const url = URL.createObjectURL(r.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.file.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.mark('downloaded', 'Saved to this device. Open WhatsApp, attach it to the customer’s chat and press Send.');
  }

  /** Opens WhatsApp on the customer's chat with a short hello. It cannot attach the file: a link has no way to. */
  protected openChat(r: Ready) {
    const w = window.open(r.result.whatsappUrl, '_blank', 'noopener');
    if (!w) window.location.assign(r.result.whatsappUrl);
    this.mark('chat_opened', r.stages.includes('downloaded')
      ? 'WhatsApp is open on the customer’s chat. Attach the downloaded file and press Send.'
      : 'WhatsApp is open on the customer’s chat, but the file is not attached. Download it, attach it there, then press Send.');
  }

  protected async shareSheet(r: Ready) {
    const out = await shareFile(r.result, r.file);
    if (out.ok) this.mark('shared', SHARED_NOTE);
    else if (out.reason === 'cancelled') this.ready.update((x) => (x ? { ...x, note: 'Sharing was cancelled. Nothing was sent.' } : x));
    else this.ready.update((x) => (x ? { ...x, canShare: false, note: 'This device could not open the share sheet. Download the file and attach it in WhatsApp instead.' } : x));
  }
}
