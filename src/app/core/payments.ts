/**
 * Split payments on the billing screen, in whole paise. This mirrors billback/src/modules/invoices/payments.js: the
 * amounts must add up to the bill total exactly. The server is the one that decides (it checks again when the bill is
 * saved, against a total it works out itself); this only lets the screen show what is left to pay before Save is pressed.
 *
 * Typed amounts are read as text, never as floating point: "10.10" is 1010 paise, not 1009.9999999999999.
 * A tip is separate: it is not part of the bill total and never takes part in the sum.
 */
import type { PaymentMethod } from './models';

export const PAY_METHODS: readonly PaymentMethod[] = ['cash', 'upi', 'card'];

/** The largest amount the server accepts for one payment, in paise (₹1,00,00,000). */
const MAX_PAISE = 10_000_000 * 100;

/**
 * What was typed in an amount box, as whole paise. A blank box is 0.
 * Returns null for anything that is not an amount: negative, letters, more than 2 decimals, or too large.
 */
export function parseAmount(raw: string): number | null {
  const text = String(raw ?? '').trim().replace(/^₹\s*/, '').replace(/,/g, '');
  if (text === '') return 0;
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!m || (m[1] === '' && !m[2])) return null; // "", ".", "abc", "1.234", "-5"
  const paise = Number(m[1] || '0') * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise <= MAX_PAISE ? paise : null;
}

/** Paise as the text for an amount box: 30000 → "300", 30050 → "300.50", 30010 → "300.10". */
export function formatAmount(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}

export type SplitInput = Record<PaymentMethod, string>;
export const emptySplit = (): SplitInput => ({ cash: '', upi: '', card: '' });

export interface SplitStatus {
  /** The methods that have an amount, in the order cash, UPI, card. */
  parts: { method: PaymentMethod; paise: number }[];
  /** Boxes holding something that is not an amount. */
  invalid: PaymentMethod[];
  paid: number;
  /** Still to be paid (positive), or paid too much (negative). */
  remaining: number;
  /** Everything typed is an amount, at least one method is used, and they add up to the total exactly. */
  ok: boolean;
}

/** Where a split payment stands against the bill total. */
export function splitStatus(input: SplitInput, totalPaise: number): SplitStatus {
  const parts: SplitStatus['parts'] = [];
  const invalid: PaymentMethod[] = [];
  for (const method of PAY_METHODS) {
    const paise = parseAmount(input[method]);
    if (paise === null) invalid.push(method);
    else if (paise > 0) parts.push({ method, paise });
  }
  const paid = parts.reduce((sum, p) => sum + p.paise, 0);
  const remaining = totalPaise - paid;
  return { parts, invalid, paid, remaining, ok: invalid.length === 0 && parts.length > 0 && remaining === 0 };
}

/**
 * The payments to send to the server: amounts in rupees, only the methods that were used.
 * (A method left blank or at 0 is left out: the server wants real amounts.)
 */
export const paymentsBody = (parts: SplitStatus['parts']): { method: PaymentMethod; amount: number }[] =>
  parts.map((p) => ({ method: p.method, amount: p.paise / 100 }));

/** What a method's box should hold so that the whole bill is paid: whatever is still to pay, on top of what is already in it. */
export function restFor(input: SplitInput, method: PaymentMethod, totalPaise: number): string {
  const others = PAY_METHODS.filter((m) => m !== method).reduce((sum, m) => sum + (parseAmount(input[m]) ?? 0), 0);
  return formatAmount(Math.max(0, totalPaise - others));
}
