import { GstPriceMode, computeBill, halfRate, hasSplit, percentOf, splitTax } from './gst';

// The same worked examples as billback/tests/gst.unit.test.js. All amounts are whole paise (₹1 = 100).
// [what it is, subtotal, rate %, mode, referral, discount, expected [taxable, tax, cgst, sgst, total]]
const VECTORS: [string, number, number, GstPriceMode, number, number, number[]][] = [
  ['₹1,000 − ₹100 referral − ₹50 off, 5% on top: tax ₹42.50, total ₹892.50', 100000, 5, 'exclusive', 10000, 5000, [85000, 4250, 2125, 2125, 89250]],
  ['no discounts, 18% on ₹499: tax is exactly ₹89.82', 49900, 18, 'exclusive', 0, 0, [49900, 8982, 4491, 4491, 58882]],
  ['18% on ₹499.99: ₹89.9982 rounds up to ₹90.00', 49999, 18, 'exclusive', 0, 0, [49999, 9000, 4500, 4500, 58999]],
  ['2.5% on ₹10.10: 25.25 paise rounds down to 25; the odd paisa is on CGST', 1010, 2.5, 'exclusive', 0, 0, [1010, 25, 13, 12, 1035]],
  ['2.5% on ₹10.20: exactly 25.5 paise rounds UP to 26', 1020, 2.5, 'exclusive', 0, 0, [1020, 26, 13, 13, 1046]],
  ['5% on 50 paise: exactly 2.5 paise rounds up to 3, split 2 + 1', 50, 5, 'exclusive', 0, 0, [50, 3, 2, 1, 53]],
  ['5% on 10 paise: exactly half a paisa rounds up to 1, all of it on CGST', 10, 5, 'exclusive', 0, 0, [10, 1, 1, 0, 11]],
  ['5% on 4 paise: 0.2 paise rounds to nothing', 4, 5, 'exclusive', 0, 0, [4, 0, 0, 0, 4]],
  ['0% GST: no tax, no split', 123456, 0, 'exclusive', 0, 0, [123456, 0, 0, 0, 123456]],
  ['everything discounted away: nothing to tax', 50000, 18, 'exclusive', 50000, 0, [0, 0, 0, 0, 0]],
  ['₹1,000 with 5% inside: tax ₹47.62 (47.619…), taxable ₹952.38', 100000, 5, 'inclusive', 0, 0, [95238, 4762, 2381, 2381, 100000]],
  ['₹1,180 with 18% inside: tax is exactly ₹180', 118000, 18, 'inclusive', 0, 0, [100000, 18000, 9000, 9000, 118000]],
  ['₹999 with 18% inside: tax ₹152.39 (152.389…), odd paisa on CGST', 99900, 18, 'inclusive', 0, 0, [84661, 15239, 7620, 7619, 99900]],
  ['₹1,000 − ₹100 referral − ₹50 off, 5% inside: customer pays ₹850, tax ₹40.48', 100000, 5, 'inclusive', 10000, 5000, [80952, 4048, 2024, 2024, 85000]],
  ['12% inside 14 paise: exactly 1.5 paise rounds up to 2', 14, 12, 'inclusive', 0, 0, [12, 2, 1, 1, 14]],
  ['0% inside: the whole price is the taxable value', 55500, 0, 'inclusive', 0, 0, [55500, 0, 0, 0, 55500]],
  ['inclusive, everything discounted away', 50000, 18, 'inclusive', 20000, 30000, [0, 0, 0, 0, 0]],
];

describe('GST arithmetic on the billing screen (the same as the server\'s)', () => {
  for (const [what, subtotal, taxPercent, priceMode, referral, discount, expected] of VECTORS) {
    it(`worked example: ${what}`, () => {
      const b = computeBill({ subtotal, referral, discount, taxPercent, priceMode });
      expect([b.taxable, b.tax, b.cgst, b.sgst, b.total]).toEqual(expected);
      expect(b.priceMode).toBe(priceMode);
    });
  }

  it('the parts always add up: taxable + tax = total and CGST + SGST = tax, with the odd paisa on CGST', () => {
    for (const priceMode of ['exclusive', 'inclusive'] as GstPriceMode[]) {
      for (const taxPercent of [0, 2.5, 5, 12, 18, 28]) {
        for (let subtotal = 0; subtotal <= 4000; subtotal += 13) {
          const b = computeBill({ subtotal, referral: Math.floor(subtotal / 10), discount: Math.floor(subtotal / 20), taxPercent, priceMode });
          expect(b.taxable + b.tax).toBe(b.total);
          expect(b.cgst + b.sgst).toBe(b.tax);
          expect([0, 1]).toContain(b.cgst - b.sgst);
        }
      }
    }
  });

  it('referral discount: exact to the paisa, where the old formula was a paisa out', () => {
    expect(percentOf(100000, 10)).toBe(10000);
    expect(percentOf(12345, 12.5)).toBe(1543);
    expect(percentOf(10, 5)).toBe(1);
    expect(percentOf(3000, 1.15)).toBe(35);                // 34.5 exactly; Math.round(3000 * 1.15 / 100) says 34
    expect(percentOf(5000, 0.57)).toBe(29);
  });

  it('splitTax, halfRate and hasSplit', () => {
    expect(splitTax(4251)).toEqual({ cgst: 2126, sgst: 2125 });
    expect(halfRate(5)).toBe(2.5);
    expect(halfRate(18)).toBe(9);
    expect(hasSplit({ cgst: 1, sgst: 1 })).toBe(true);
    expect(hasSplit({ cgst: 0, sgst: 0 })).toBe(true);     // a bill with no tax, made after the split existed
    expect(hasSplit({ cgst: null, sgst: null })).toBe(false);
  });

  it('refuses a bill that cannot be right', () => {
    const ok = { subtotal: 1000, taxPercent: 5, priceMode: 'exclusive' as GstPriceMode };
    expect(() => computeBill({ ...ok, subtotal: 10.5 })).toThrow(/whole number of paise/);
    expect(() => computeBill({ ...ok, referral: 600, discount: 401 })).toThrow(/more than the subtotal/);
    expect(() => computeBill({ ...ok, taxPercent: 101 })).toThrow(/0 to 100/);
  });
});
