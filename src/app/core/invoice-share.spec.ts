import { InvoiceShare } from './models';
import { canShareFile, fileOf, hasPhoneDigits, kindName, MANUAL_STEPS, prettyPhone, SHARED_NOTE, shareButtons, shareFile, STAGE_TEXT } from './invoice-share';

const result = (kind: 'pdf' | 'image' = 'pdf'): InvoiceShare => ({
  kind,
  status: 'generated',
  delivery: { confirmed: false, note: 'ParlourBill cannot see whether a WhatsApp message is sent, delivered or read. A person presses Send in WhatsApp.' },
  recipient: { phone: '919876543210' },
  message: 'Hello Priya, here is your invoice DP-00042.',
  whatsappUrl: 'https://wa.me/919876543210?text=Hello',
  file: { name: kind === 'pdf' ? 'Invoice-DP-00042.pdf' : 'Invoice-DP-00042.png', mimeType: kind === 'pdf' ? 'application/pdf' : 'image/png', sizeBytes: 5, pages: 1, base64: btoa('%PDF-') },
});

describe('which WhatsApp buttons show (the two switches, independently)', () => {
  it('both on: both buttons, PDF first', () => expect(shareButtons(true, true)).toEqual(['pdf', 'image']));
  it('PDF on, image off: PDF only', () => expect(shareButtons(true, false)).toEqual(['pdf']));
  it('PDF off, image on: image only', () => expect(shareButtons(false, true)).toEqual(['image']));
  it('both off: none', () => expect(shareButtons(false, false)).toEqual([]));
});

describe('the file the server made', () => {
  it('becomes a real File with the right name, type and bytes', async () => {
    const f = fileOf(result());
    expect(f.name).toBe('Invoice-DP-00042.pdf');
    expect(f.type).toBe('application/pdf');
    expect(f.size).toBe(5);
    expect(await f.text()).toBe('%PDF-');
  });
  it('an image keeps its own type', () => expect(fileOf(result('image')).type).toBe('image/png'));
});

describe('the share sheet (Web Share API with files)', () => {
  const file = () => fileOf(result());
  it('is not available without navigator.share and navigator.canShare', () => {
    expect(canShareFile(file(), { nav: undefined })).toBe(false);
    expect(canShareFile(file(), { nav: {} as Navigator })).toBe(false);
    expect(canShareFile(file(), { nav: { share: async () => undefined } as unknown as Navigator })).toBe(false);
  });
  it('is available only when the device says it can share THIS file', () => {
    const yes = { share: async () => undefined, canShare: () => true } as unknown as Navigator;
    const no = { share: async () => undefined, canShare: () => false } as unknown as Navigator;
    const throws = { share: async () => undefined, canShare: () => { throw new Error('boom'); } } as unknown as Navigator;
    expect(canShareFile(file(), { nav: yes })).toBe(true);
    expect(canShareFile(file(), { nav: no })).toBe(false);
    expect(canShareFile(file(), { nav: throws })).toBe(false);
  });
  it('shares the file with the message, and reports success only when the share sheet resolved', async () => {
    let seen: ShareData | null = null;
    const nav = { canShare: () => true, share: async (d: ShareData) => { seen = d; } } as unknown as Navigator;
    const r = result();
    expect(await shareFile(r, fileOf(r), { nav })).toEqual({ ok: true });
    expect(seen!.files![0].name).toBe('Invoice-DP-00042.pdf');
    expect(seen!.text).toBe(r.message);
  });
  it('a person closing the sheet is "cancelled", not a failure', async () => {
    const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } } as unknown as Navigator;
    const r = result();
    expect(await shareFile(r, fileOf(r), { nav })).toEqual({ ok: false, reason: 'cancelled' });
  });
  it('any other error is "failed"; a device without file sharing is "unsupported"', async () => {
    const r = result();
    const failing = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } as unknown as Navigator;
    expect(await shareFile(r, fileOf(r), { nav: failing })).toEqual({ ok: false, reason: 'failed' });
    expect(await shareFile(r, fileOf(r), { nav: undefined })).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('honest wording: nothing ever claims delivery', () => {
  const everything = [...Object.values(STAGE_TEXT), SHARED_NOTE, ...MANUAL_STEPS, result().delivery.note].join(' ');
  it('uses generated / opened / downloaded, never sent, delivered or read as something that happened', () => {
    expect(STAGE_TEXT.generated).toBe('Generated');
    expect(Object.keys(STAGE_TEXT)).toEqual(['generated', 'shared', 'downloaded', 'chat_opened']);
    expect(Object.keys(STAGE_TEXT)).not.toContain('delivered');
    expect(everything).not.toMatch(/successfully|was delivered|has been sent|sent successfully/i);
    expect(SHARED_NOTE).toMatch(/cannot see whether it was sent or delivered/);
  });
  it('the server’s own note says delivery is not confirmed', () => {
    expect(result().delivery.confirmed).toBe(false);
  });
});

describe('small helpers', () => {
  it('prettyPhone', () => {
    expect(prettyPhone('919876543210')).toBe('+91 98765 43210');
    expect(prettyPhone('447911123456')).toBe('+447911123456');
    expect(prettyPhone('')).toBe('');
  });
  it('kindName', () => { expect(kindName('pdf')).toBe('PDF'); expect(kindName('image')).toBe('image'); });
  it('hasPhoneDigits: only a number with at least 10 digits is worth asking the server about', () => {
    expect(hasPhoneDigits('+91 98765-43210')).toBe(true);
    expect(hasPhoneDigits('12345')).toBe(false);
    expect(hasPhoneDigits(null)).toBe(false);
    expect(hasPhoneDigits('')).toBe(false);
  });
});
