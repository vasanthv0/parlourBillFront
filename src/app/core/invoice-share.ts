/**
 * What happens in the browser after the server has made the invoice file (PDF or image) for WhatsApp. Pure helpers, no Angular, so they
 * can be tested on their own.
 *
 * The honest rule: a web page cannot put a file into a WhatsApp chat by itself, and a wa.me link cannot attach one. So there are only
 * two ways to hand the file over, and both end with a PERSON pressing Send in WhatsApp:
 *   1. the device's share sheet (Web Share API with files): the person picks WhatsApp and the chat;
 *   2. the fallback: the file is saved to the device and WhatsApp's chat with the customer is opened, and the person attaches it.
 * Nothing here knows whether the message was sent, delivered or read, and nothing may say so. Every message below says what actually
 * happened ("shared", "downloaded", "opened") and nothing more.
 */
import { InvoiceShare, ShareKind } from './models';

/** The stages a share goes through. `delivered` is deliberately not a stage: this app cannot observe it. */
export type ShareStage = 'generated' | 'shared' | 'downloaded' | 'chat_opened';

export interface ShareEnv {
  nav?: Pick<Navigator, 'share' | 'canShare'>;
}

/** Turns the base64 the server sent into a File the browser can share or save. */
export function fileOf(result: InvoiceShare): File {
  const bin = atob(result.file.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], result.file.name, { type: result.file.mimeType });
}

/** Can this device hand a file to another app through its share sheet? (Phones and tablets mostly; most desktop browsers cannot.) */
export function canShareFile(file: File, env: ShareEnv = { nav: typeof navigator === 'undefined' ? undefined : navigator }): boolean {
  const nav = env.nav as (Navigator & { canShare?: (d: ShareData) => boolean }) | undefined;
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try { return nav.canShare({ files: [file] }); } catch { return false; }
}

export type ShareAttempt = { ok: true } | { ok: false; reason: 'cancelled' | 'unsupported' | 'failed' };

/** Opens the share sheet with the file. A person closing it is "cancelled", not an error. */
export async function shareFile(result: InvoiceShare, file: File, env: ShareEnv = { nav: typeof navigator === 'undefined' ? undefined : navigator }): Promise<ShareAttempt> {
  if (!canShareFile(file, env)) return { ok: false, reason: 'unsupported' };
  try {
    await env.nav!.share!({ files: [file], title: file.name, text: result.message });
    return { ok: true };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return { ok: false, reason: name === 'AbortError' ? 'cancelled' : 'failed' };
  }
}

/** The label for each stage, in the person's words. None of them claims delivery. */
export const STAGE_TEXT: Record<ShareStage, string> = {
  generated: 'Generated',
  shared: 'Opened in the share sheet',
  downloaded: 'Downloaded',
  chat_opened: 'WhatsApp chat opened',
};

export const kindName = (kind: ShareKind): string => (kind === 'pdf' ? 'PDF' : 'image');

/** Said after a share sheet closed normally: what happened, and that a person still has to send it. */
export const SHARED_NOTE = 'The share sheet was opened. Choose WhatsApp and the customer, then press Send there. ParlourBill cannot see whether it was sent or delivered.';
/** Said when the device cannot share files: the manual steps. */
export const MANUAL_STEPS = ['Download the file.', 'Open the WhatsApp chat with the customer.', 'Attach the downloaded file and press Send.'];

/** The customer's number as people read it: 919876543210 → +91 98765 43210. Other lengths are shown with a + and left alone. */
export function prettyPhone(digits: string): string {
  const d = String(digits ?? '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : d ? `+${d}` : '';
}

/** Which of the two buttons to show, from the two switches. Both off shows neither. */
export function shareButtons(pdfOn: boolean, imageOn: boolean): ShareKind[] {
  return [...(pdfOn ? (['pdf'] as const) : []), ...(imageOn ? (['image'] as const) : [])];
}

/** Does this saved number have anything WhatsApp could use? A cheap check before asking the server (which checks again, properly). */
export const hasPhoneDigits = (phone: string | null | undefined): boolean => String(phone ?? '').replace(/\D/g, '').length >= 10;
