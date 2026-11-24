/**
 * Task 6, in the browser: the A4 invoice page (Feature 18) and the two WhatsApp buttons (Feature 22), opened the way the router opens them,
 * against the shapes the real API returns (see testing/harness.ts). A runtime error in a template or in injection fails here, not in a browser.
 *
 * NOTE: written with the feature but NOT run when it was delivered (Angular and jest could not be installed offline). Run `npm test` in this
 * folder once and read the result before trusting it.
 */
import { TestBed } from '@angular/core/testing';
import { InvoiceA4Component } from './features/shared/invoice-a4.component';
import { InvoiceDetailComponent } from './features/shared/invoice-detail.component';
import { ToastService } from './core/toast.service';
import { Page, installDomShims, open } from './testing/harness';

beforeAll(installDomShims);

const PDF = 'action.whatsapp.invoice_pdf';
const IMAGE = 'action.whatsapp.invoice_image';
const SEND_PDF = 'Send PDF on WhatsApp';
const SEND_IMAGE = 'Send Image on WhatsApp';
const STYLE_ID = 'a4-page-style';

const shareAnswer = (kind: 'pdf' | 'image') => ({
  data: {
    kind, status: 'generated',
    delivery: { confirmed: false, note: 'ParlourBill cannot see whether a WhatsApp message is sent, delivered or read. A person presses Send in WhatsApp.' },
    recipient: { phone: '919000000005' }, message: 'Hello Cara, here is your invoice DP-00001.', whatsappUrl: 'https://wa.me/919000000005?text=Hello',
    file: { name: kind === 'pdf' ? 'Invoice-DP-00001.pdf' : 'Invoice-DP-00001.png', mimeType: kind === 'pdf' ? 'application/pdf' : 'image/png', sizeBytes: 5, pages: 1, base64: btoa('%PDF-') },
  },
});
const apiError = (code: string, message: string) => ({ error: { code, message } });
const buttonLabelled = (page: Page, text: string) => [...page.host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text)) as HTMLButtonElement | undefined;

afterEach(() => {
  jest.restoreAllMocks();
  document.getElementById(STYLE_ID)?.remove();
  for (const k of ['share', 'canShare']) delete (navigator as unknown as Record<string, unknown>)[k];
  TestBed.resetTestingModule();
});

describe('the A4 invoice page (Feature 18)', () => {
  it('draws the invoice the server built: parlour, GSTIN, number, customer, SAC, tax summary and totals', async () => {
    const page = await open(InvoiceA4Component, { role: 'admin', invoiceKind: 'split' });
    const t = page.text();
    for (const must of ['TAX INVOICE', 'Demo Parlour', '12 Lake View Road', 'GSTIN: 33SNAPSHOT00S1Z5', 'Invoice no.', 'DP-00001', 'BILL TO', 'Cara Customer', 'Phone: 9000000005',
      'Glow Pack', 'Haircut + Facial', '999722', 'CGST @ 2.5%', 'SGST @ 2.5%', '₹20.25', 'Taxable value', '₹810.00', '₹850.50', 'Paid by UPI', 'Thank you for visiting.']) {
      expect(t).toContain(must);
    }
    expect(page.host.querySelectorAll('article.a4-sheet').length).toBe(1);
  });

  it('a combo shows a dash and a note, never an invented SAC', async () => {
    const page = await open(InvoiceA4Component, { role: 'admin', invoiceKind: 'split' });
    const rows = [...page.host.querySelectorAll('.a4-lines tbody tr')];
    expect(rows[0].textContent).toContain('Glow Pack');
    expect(rows[0].querySelector('.c-sac')?.textContent?.trim()).toBe('—');
    expect(page.text()).toContain('carries no single SAC code');
  });

  it('an OLD bill shows the GST it was saved with: one GST line, no CGST or SGST, and no GSTIN is made up', async () => {
    const page = await open(InvoiceA4Component, { role: 'admin' });          // the default bill is from before the split
    const t = page.text();
    expect(t).toContain('GST @ 5%');
    expect(t).toContain('GSTIN: Not recorded on this invoice');
    expect(t).toContain('made before GST was split');
    expect(t).not.toContain('CGST @');
    expect(t).not.toContain('SGST @');
    expect(t).not.toContain('33ABCDE1234F1Z5');                              // the parlour's current GSTIN is not borrowed
  });

  it('a customer with no saved phone reads "Not provided"', async () => {
    const page = await open(InvoiceA4Component, { role: 'admin', invoicePhone: null });
    expect(page.text()).toContain('Phone: Not provided');
  });

  it('has its own Print A4 button; the A4 paper size is added only for the print and removed after it', async () => {
    let ruleDuringPrint = '';
    const print = jest.spyOn(window, 'print').mockImplementation(() => { ruleDuringPrint = document.getElementById(STYLE_ID)?.textContent ?? ''; });
    const page = await open(InvoiceA4Component, { role: 'admin', invoiceKind: 'split' });
    expect(document.getElementById(STYLE_ID)).toBeNull();                    // nothing about A4 is in the document until someone prints
    await page.click(/Print A4/);
    expect(print).toHaveBeenCalledTimes(1);
    expect(ruleDuringPrint).toContain('size: A4 portrait');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById(STYLE_ID)).toBeNull();                    // gone again, so the 80mm receipt is never affected
  });

  it('leaving the page removes the A4 paper rule even if the browser never said the print was over', async () => {
    jest.spyOn(window, 'print').mockImplementation(() => undefined);
    const page = await open(InvoiceA4Component, { role: 'admin' });
    await page.click(/Print A4/);
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
    TestBed.resetTestingModule();                                            // the page is destroyed
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('hides everything that is not the invoice when printing: the bar of buttons carries no-print, the sheet does not', async () => {
    const page = await open(InvoiceA4Component, { role: 'admin' });
    expect(page.host.querySelector('.page-head')?.classList.contains('no-print')).toBe(true);
    expect(page.host.querySelector('.a4-hint')?.classList.contains('no-print')).toBe(true);
    expect(page.host.querySelector('.a4-sheet')?.closest('.no-print')).toBeNull();
  });

  it('the bill page keeps its own 80mm Print button, which prints without any A4 rule, and links to the A4 invoice', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    expect(page.text()).toContain('A4 invoice');
    const link = [...page.host.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes('A4 invoice')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/invoices\/i1\/a4$/);
    await page.click(/Print/);                                               // the first match is the 80mm button
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });
});

describe('the two WhatsApp buttons follow their own switches (Feature 22, section D)', () => {
  const cases: { off: string[]; pdf: boolean; image: boolean; name: string }[] = [
    { name: 'PDF on, image on: both buttons', off: [], pdf: true, image: true },
    { name: 'PDF on, image off: the PDF button only', off: [IMAGE], pdf: true, image: false },
    { name: 'PDF off, image on: the image button only', off: [PDF], pdf: false, image: true },
    { name: 'PDF off, image off: neither', off: [PDF, IMAGE], pdf: false, image: false },
  ];
  for (const c of cases) {
    it(`on the bill page, ${c.name}`, async () => {
      const page = await open(InvoiceDetailComponent, { role: 'admin', off: c.off });
      expect(page.text().includes(SEND_PDF)).toBe(c.pdf);
      expect(page.text().includes(SEND_IMAGE)).toBe(c.image);
    });
    it(`on the A4 page, ${c.name}`, async () => {
      const page = await open(InvoiceA4Component, { role: 'staff', off: c.off });
      expect(page.text().includes(SEND_PDF)).toBe(c.pdf);
      expect(page.text().includes(SEND_IMAGE)).toBe(c.image);
    });
  }

  it('the older text WhatsApp button is a third, separate switch: turning it off leaves both file buttons', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin', off: ['action.whatsapp.send'] });
    expect(page.text()).toContain(SEND_PDF);
    expect(page.text()).toContain(SEND_IMAGE);
    expect(page.text()).not.toContain('Opening…');
  });

  it('the old WhatsApp button still comes first, and still opens the link the server builds (unchanged)', async () => {
    const win = { location: { href: '' }, close: jest.fn(), opener: {} as unknown };
    jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(/WhatsApp/);
    page.expectOne('GET', '/whatsapp').flush({ data: { url: 'https://wa.me/919000000005?text=Hello', message: 'Hello', phone: '919000000005' } });
    await page.settle();
    expect(win.location.href).toBe('https://wa.me/919000000005?text=Hello');
    page.http.expectNone((r) => r.url.includes('/share/'));
  });
});

describe('sending the PDF or the image (Feature 22)', () => {
  it('Send PDF: asks the server for the PDF (and only the PDF), then offers ways to hand it to WhatsApp, saying "Generated"', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    const req = page.expectOne('POST', '/invoices/i1/share/pdf');
    req.flush(shareAnswer('pdf'));
    await page.settle();
    page.http.expectNone((r) => r.url.includes('/share/image'));
    const t = page.text();
    expect(t).toContain('Invoice PDF ready');
    expect(t).toContain('Invoice-DP-00001.pdf');
    expect(t).toContain('+91 90000 00005');                                   // the customer’s saved number, as people read it
    expect(t).toContain('Generated');
    expect(t).toContain('Open WhatsApp chat');
  });

  it('Send Image: asks for the image (and only the image)', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    await page.click(SEND_IMAGE);
    page.expectOne('POST', '/invoices/i1/share/image').flush(shareAnswer('image'));
    await page.settle();
    page.http.expectNone((r) => r.url.includes('/share/pdf'));
    expect(page.text()).toContain('Invoice image ready');
    expect(page.text()).toContain('Invoice-DP-00001.png');
  });

  it('shows a loading state, and a second click while it is working does nothing (no duplicate files)', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    expect(page.text()).toContain('Making PDF…');
    expect(buttonLabelled(page, 'Making PDF…')?.disabled).toBe(true);
    expect(buttonLabelled(page, SEND_IMAGE)?.disabled).toBe(true);           // one file at a time
    buttonLabelled(page, 'Making PDF…')?.click();
    buttonLabelled(page, SEND_IMAGE)?.click();
    page.expectOne('POST', '/share/');                                       // expectOne fails if a second request was sent
  });

  it('after the answer the buttons are ready again', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    page.expectOne('POST', '/share/pdf').flush(shareAnswer('pdf'));
    await page.settle();
    expect(buttonLabelled(page, SEND_PDF)?.disabled).toBe(false);
    expect(buttonLabelled(page, SEND_IMAGE)?.disabled).toBe(false);
  });

  it('NEVER claims the invoice was sent or delivered: only what really happened, and a plain statement that delivery is not confirmed', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    page.expectOne('POST', '/share/pdf').flush(shareAnswer('pdf'));
    await page.settle();
    const t = page.text();
    expect(t).toContain('cannot see whether a WhatsApp message is sent, delivered or read');
    expect(t).not.toMatch(/was delivered|has been delivered|has been sent|sent successfully|delivered successfully|message sent/i);
  });

  it('manual route: Download saves the file and says "Downloaded"; Open WhatsApp chat opens the customer’s chat and says the file is not attached', async () => {
    const create = jest.fn(() => 'blob:invoice');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: jest.fn() });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const open$ = jest.spyOn(window, 'open').mockReturnValue({} as Window);
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    page.expectOne('POST', '/share/pdf').flush(shareAnswer('pdf'));
    await page.settle();
    expect(page.text()).toContain('Download the file.');                     // no share sheet on this device: the manual steps
    expect(page.text()).not.toContain('Share…');

    await page.click(/Open WhatsApp chat/);
    expect(open$).toHaveBeenCalledWith('https://wa.me/919000000005?text=Hello', '_blank', 'noopener');
    expect(page.text()).toContain('WhatsApp chat opened');
    expect(page.text()).toContain('the file is not attached');

    await page.click(/Download PDF/);
    expect(create).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0] as unknown as [File])[0].name).toBe('Invoice-DP-00001.pdf');
    expect(click).toHaveBeenCalled();
    expect(page.text()).toContain('Downloaded');
  });

  it('share sheet route: where the device can share files, "Share…" hands the file to the share sheet', async () => {
    const share = jest.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_IMAGE);
    page.expectOne('POST', '/share/image').flush(shareAnswer('image'));
    await page.settle();
    expect(page.text()).toContain('Share…');
    expect(page.text()).not.toContain('Download the file.');
    await page.click(/Share…/);
    expect(share).toHaveBeenCalledTimes(1);
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.files?.[0].name).toBe('Invoice-DP-00001.png');
    expect(data.text).toContain('Hello Cara');
    expect(page.text()).toContain('Opened in the share sheet');
    expect(page.text()).toContain('ParlourBill cannot see whether it was sent or delivered');
  });

  it('share sheet route: closing the sheet is not an error and nothing is marked as shared', async () => {
    Object.defineProperty(navigator, 'share', { value: jest.fn(async () => { throw Object.assign(new Error('closed'), { name: 'AbortError' }); }), configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    page.expectOne('POST', '/share/pdf').flush(shareAnswer('pdf'));
    await page.settle();
    await page.click(/Share…/);
    expect(page.text()).toContain('Sharing was cancelled. Nothing was sent.');
    expect(page.text()).not.toContain('Opened in the share sheet');
  });

  it('share sheet route: if the device refuses, it falls back to the manual steps', async () => {
    Object.defineProperty(navigator, 'share', { value: jest.fn(async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); }), configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    page.expectOne('POST', '/share/pdf').flush(shareAnswer('pdf'));
    await page.settle();
    await page.click(/Share…/);
    expect(page.text()).toContain('could not open the share sheet');
    expect(page.text()).toContain('Download the file.');
  });
});

describe('missing and invalid phone numbers, and refusals from the server', () => {
  const toasts = () => TestBed.inject(ToastService).toasts().map((t) => t.message);

  it('a customer with no phone: a clear message, and nothing is requested', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'staff', invoicePhone: null });
    await page.click(SEND_PDF);
    page.http.expectNone((r) => r.url.includes('/share/'));
    expect(toasts().some((m) => /no customer phone number/.test(m))).toBe(true);
    expect(page.text()).not.toContain('ready');
  });

  it('the server’s refusal is shown as it was written (an invalid saved number), with no dialog and the button usable again', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(SEND_PDF);
    page.expectOne('POST', '/share/pdf').flush(apiError('INVALID_PHONE', 'The customer’s saved phone number is not a valid WhatsApp number. Correct it on the customer, then try again.'), { status: 400, statusText: 'Bad Request' });
    await page.settle();
    expect(toasts().some((m) => /not a valid WhatsApp number/.test(m))).toBe(true);
    expect(page.text()).not.toContain('Invoice PDF ready');
    expect(buttonLabelled(page, SEND_PDF)?.disabled).toBe(false);
  });

  it('a switch turned off on the server after the page loaded is explained, not hidden behind a generic error', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    await page.click(SEND_IMAGE);
    page.expectOne('POST', '/share/image').flush(apiError('FEATURE_DISABLED', 'This feature is not enabled for your parlour.'), { status: 403, statusText: 'Forbidden' });
    await page.settle();
    expect(toasts()).toContain('This feature is not enabled for your parlour.');
  });

  it('an invoice too long for one picture says to send the PDF instead', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    await page.click(SEND_IMAGE);
    page.expectOne('POST', '/share/image').flush(apiError('INVOICE_TOO_LONG_FOR_IMAGE', 'This invoice runs to 6 pages, which is too long for one picture. Send the PDF instead.'), { status: 422, statusText: 'Unprocessable' });
    await page.settle();
    expect(toasts().some((m) => /Send the PDF instead/.test(m))).toBe(true);
  });

  it('when the server cannot be reached, the person is told so', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    await page.click(SEND_PDF);
    page.expectOne('POST', '/share/pdf').error(new ProgressEvent('error'));
    await page.settle();
    expect(toasts().some((m) => /Cannot reach the server/.test(m))).toBe(true);
  });
});
