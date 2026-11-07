/**
 * GST on a bill, in whole paise. This is the same arithmetic as billback/src/modules/invoices/gst.js, line for line,
 * so the total on the billing screen is the total the server saves. The server is the one that decides: it works the
 * bill out again when it is saved. If you change a rule here, change it there too (both have the same worked examples).
 *
 *   payable = subtotal − referral discount − discount
 *   GST on top      : tax = payable × rate ÷ 100          total = payable + tax
 *   GST in the price: tax = payable × rate ÷ (100 + rate)  total = payable
 *   taxable value = total − tax;  CGST + SGST = tax, with an odd paisa on CGST.
 *
 * Every division rounds to the nearest paisa, halves up, using integers only.
 */
export type GstPriceMode = 'exclusive' | 'inclusive';

export interface BillAmounts {
  priceMode: GstPriceMode;
  subtotal: number;
  referral: number;
  discount: number;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  total: number;
}

/** 5 → 500, 2.5 → 250, 12.5 → 1250: a percentage in hundredths of a percent. */
const toBasisPoints = (percent: number): number => {
  const bp = Math.round(Number(percent) * 100);
  if (!Number.isInteger(bp) || bp < 0 || bp > 10_000) throw new RangeError(`A percentage must be from 0 to 100 (got ${percent})`);
  return bp;
};

/** n ÷ d to the nearest whole number, halves up. For whole n ≥ 0 and d > 0. */
const roundDiv = (n: number, d: number): number => {
  const twice = 2 * n + d;
  if (!Number.isSafeInteger(twice)) throw new RangeError('That amount is too large to calculate exactly');
  return Math.floor(twice / (2 * d));
};

/** `percent` of an amount in paise, to the nearest paisa. Used for the referral discount. */
export const percentOf = (paise: number, percent: number): number => roundDiv(paise * toBasisPoints(percent), 10_000);

/** Splits the tax into CGST and SGST. An odd paisa goes to CGST. */
export const splitTax = (tax: number): { cgst: number; sgst: number } => {
  const sgst = Math.floor(tax / 2);
  return { cgst: tax - sgst, sgst };
};

/** Each of CGST and SGST is half the rate (5% → 2.5% + 2.5%). */
export const halfRate = (taxPercent: number): number => Number(taxPercent) / 2;

export function computeBill(input: { subtotal: number; referral?: number; discount?: number; taxPercent: number; priceMode: GstPriceMode }): BillAmounts {
  const { subtotal, referral = 0, discount = 0, taxPercent, priceMode } = input;
  for (const [what, n] of [['The subtotal', subtotal], ['The referral discount', referral], ['The discount', discount]] as const) {
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a whole number of paise, zero or more (got ${n})`);
  }
  if (referral + discount > subtotal) throw new RangeError('The discounts cannot be more than the subtotal');

  const payable = subtotal - referral - discount;
  const bp = toBasisPoints(taxPercent);
  const inclusive = priceMode === 'inclusive';
  const tax = inclusive ? roundDiv(payable * bp, 10_000 + bp) : roundDiv(payable * bp, 10_000);
  const total = inclusive ? payable : payable + tax;
  return { priceMode, subtotal, referral, discount, taxable: total - tax, tax, ...splitTax(tax), total };
}

/** A bill made with the CGST/SGST split. Bills from before the split have none saved, and show one tax line. */
export const hasSplit = (inv: { cgst: number | null; sgst: number | null }): boolean => inv.cgst !== null && inv.sgst !== null;
