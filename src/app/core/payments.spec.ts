import { PAY_METHODS, emptySplit, formatAmount, parseAmount, paymentsBody, restFor, splitStatus } from './payments';

// The same ideas as billback/tests/payments.unit.test.js. All amounts are whole paise (₹1 = 100).

describe('reading an amount that was typed', () => {
  const GOOD: [string, number][] = [
    ['300', 30000], ['99.50', 9950], ['99.5', 9950], ['10.10', 1010], ['20.20', 2020], ['0.07', 7], ['19.99', 1999], ['1234.56', 123456],
    ['0', 0], ['', 0], ['   ', 0], ['.5', 50], ['10.', 1000], ['₹ 250', 25000], ['1,250.75', 125075], ['10000000', 1_000_000_000],
  ];
  for (const [typed, paise] of GOOD) {
    it(`"${typed}" is ${paise} paise`, () => expect(parseAmount(typed)).toBe(paise));
  }

  const BAD = ['abc', '-5', '1.234', '10.005', '1e3', '.', '1.2.3', '12 34', '10000000.01', '99999999999999999999'];
  for (const typed of BAD) {
    it(`"${typed}" is not an amount`, () => expect(parseAmount(typed)).toBeNull());
  }

  it('is exact where floating point is not (10.1 + 20.2 is 30.299999999999997 in floating point, but ₹10.10 + ₹20.20 is ₹30.30)', () => {
    expect(10.1 + 20.2).not.toBe(30.3);
    expect((parseAmount('10.10') ?? 0) + (parseAmount('20.20') ?? 0)).toBe(3030);
  });
});

describe('putting paise back into an amount box', () => {
  it('shows whole rupees without decimals and anything else with two', () => {
    expect([0, 100, 30000, 30050, 30010, 7, 1999, 123456].map(formatAmount)).toEqual(['0', '1', '300', '300.50', '300.10', '0.07', '19.99', '1234.56']);
  });
  it('reads back as the same paise', () => {
    for (const p of [0, 1, 7, 99, 100, 101, 1999, 30050, 99999999]) expect(parseAmount(formatAmount(p))).toBe(p);
  });
});

describe('where a split payment stands against the bill total', () => {
  const input = (cash = '', upi = '', card = '') => ({ cash, upi, card });

  it('adds up exactly: ₹300 + ₹498 for a bill of ₹798', () => {
    const s = splitStatus(input('300', '498'), 79800);
    expect(s.parts).toEqual([{ method: 'cash', paise: 30000 }, { method: 'upi', paise: 49800 }]);
    expect([s.paid, s.remaining, s.ok, s.invalid]).toEqual([79800, 0, true, []]);
  });

  it('one paisa short is not ok and says what is left; one paisa over is not ok and says by how much', () => {
    const short = splitStatus(input('300', '497.99'), 79800);
    expect([short.remaining, short.ok]).toEqual([1, false]);
    const over = splitStatus(input('300', '498.01'), 79800);
    expect([over.remaining, over.ok]).toEqual([-1, false]);
  });

  it('three methods on a total that does not divide by three: ₹333.33 + ₹333.33 + ₹333.34 is ₹1,000; ₹333.33 three times is a paisa short', () => {
    expect(splitStatus(input('333.33', '333.33', '333.34'), 100000).ok).toBe(true);
    expect(splitStatus(input('333.33', '333.33', '333.33'), 100000).remaining).toBe(1);
  });

  it('a blank box or a 0 is a method that was not used, and is left out', () => {
    const s = splitStatus(input('798', '0', ''), 79800);
    expect(s.parts).toEqual([{ method: 'cash', paise: 79800 }]);
    expect(s.ok).toBe(true);
  });

  it('nothing typed yet: not ok, and the whole total is still to pay', () => {
    const s = splitStatus(emptySplit(), 79800);
    expect([s.parts, s.remaining, s.ok]).toEqual([[], 79800, false]);
  });

  it('something that is not an amount is flagged, and blocks Save even if the rest adds up', () => {
    const s = splitStatus(input('300', 'abc', '498'), 79800);
    expect(s.invalid).toEqual(['upi']);
    expect(s.ok).toBe(false);
  });
});

describe('the payments sent to the server', () => {
  it('are in rupees, only for the methods used, in the order cash, UPI, card', () => {
    const s = splitStatus({ cash: '99.50', upi: '', card: '200.25' }, 29975);
    expect(paymentsBody(s.parts)).toEqual([{ method: 'cash', amount: 99.5 }, { method: 'card', amount: 200.25 }]);
  });

  it('are the same numbers the server turns back into the same paise (every amount to 2 decimals survives paise / 100)', () => {
    for (let paise = 1; paise <= 20000; paise += 7) {
      expect(Math.round((paise / 100) * 100)).toBe(paise);
      expect(parseAmount(String(paise / 100))).toBe(paise);
    }
  });
});

describe('"Rest" fills a box with what is still to pay', () => {
  it('ignores what is already in that box, and what the others hold comes off the total', () => {
    expect(restFor({ cash: '300', upi: '', card: '' }, 'upi', 79800)).toBe('498');
    expect(restFor({ cash: '300', upi: '999', card: '' }, 'upi', 79800)).toBe('498');
    expect(restFor({ cash: '300', upi: '', card: '100.50' }, 'upi', 79800)).toBe('397.50');
  });
  it('never goes below 0 when the others already cover the total', () => {
    expect(restFor({ cash: '900', upi: '', card: '' }, 'upi', 79800)).toBe('0');
  });
  it('knows all three methods', () => expect([...PAY_METHODS]).toEqual(['cash', 'upi', 'card']));
});
