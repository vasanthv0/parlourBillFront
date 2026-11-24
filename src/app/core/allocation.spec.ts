import { WHOLE, equalRows, equalTipRows, formatPercent, parsePercent, shareStatus, sharesBody, tipSplitBody, tipStatus } from './allocation';

// What the billing screen decides before it lets a shared line or a shared tip be saved. The server checks again with the same rules.

describe('parsePercent', () => {
  it('reads whole hundredths of a percent', () => {
    expect(['50', '33.33', '0.01', '100', '12.5', ' 7.25 ', '50%', '100.00'].map(parsePercent)).toEqual([5000, 3333, 1, 10000, 1250, 725, 5000, 10000]);
  });
  it('refuses anything that is not a percentage', () => {
    for (const bad of ['', ' ', '0', '0.00', '-5', '100.01', '101', '33.333', 'half', '5,0', '.', '1e2', '50 50']) expect(parsePercent(bad)).toBeNull();
  });
  it('formats it back, without trailing zeros', () => {
    expect([5000, 3333, 1, 10000, 3350, 725].map(formatPercent)).toEqual(['50', '33.33', '0.01', '100', '33.5', '7.25']);
    for (const text of ['50', '33.33', '0.01', '99.99', '12.5']) expect(formatPercent(parsePercent(text) as number)).toBe(text);
  });
});

describe('shareStatus', () => {
  const K = 'k'; const R = 'r'; const S = 's';
  it('is ready only when everyone is chosen, nobody is twice, and the shares add up to exactly 100', () => {
    expect(shareStatus([{ performerId: K, percent: '50' }, { performerId: R, percent: '50' }])).toMatchObject({ ok: true, remaining: 0, message: 'Adds up to 100%' });
    expect(shareStatus([{ performerId: K, percent: '33.33' }, { performerId: R, percent: '33.33' }, { performerId: S, percent: '33.34' }]).ok).toBe(true);
    expect(shareStatus([{ performerId: K, percent: '100' }]).ok).toBe(true);
  });
  it('says what is still to share, or too much, in words', () => {
    expect(shareStatus([{ performerId: K, percent: '50' }, { performerId: R, percent: '49.99' }])).toMatchObject({ ok: false, remaining: 1, message: '0.01% still to share' });
    expect(shareStatus([{ performerId: K, percent: '50' }, { performerId: R, percent: '50.01' }])).toMatchObject({ ok: false, remaining: -1, message: '0.01% too much' });
    expect(shareStatus([{ performerId: K, percent: '60' }])).toMatchObject({ ok: false, remaining: 4000, message: '40% still to share' });
  });
  it('flags the row that is wrong', () => {
    const s = shareStatus([{ performerId: '', percent: '50' }, { performerId: R, percent: 'half' }, { performerId: R, percent: '50' }]);
    expect(s.ok).toBe(false);
    expect(s.rowErrors).toEqual(['Choose a person', 'Enter a percentage like 50 or 33.33', 'This person is listed twice']);
    expect(s.message).toBe('Choose a person');
    expect(shareStatus([{ performerId: K, percent: '0' }, { performerId: R, percent: '100' }]).rowErrors[0]).toBe('Enter a percentage like 50 or 33.33');
  });
  it('refuses more than ten people, and nobody at all', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ performerId: `p${i}`, percent: '9' }));
    expect(shareStatus(eleven).ok).toBe(false);
    expect(shareStatus([]).ok).toBe(false);
  });
});

describe('equalRows', () => {
  it('shares evenly and always adds up to exactly 100, the spare going to the first', () => {
    expect(equalRows(['a', 'b']).map((r) => r.percent)).toEqual(['50', '50']);
    expect(equalRows(['a', 'b', 'c']).map((r) => r.percent)).toEqual(['33.34', '33.33', '33.33']);
    expect(equalRows(['a']).map((r) => r.percent)).toEqual(['100']);
    for (let n = 1; n <= 10; n++) {
      const rows = equalRows(Array.from({ length: n }, (_, i) => `p${i}`));
      expect(rows.reduce((s, r) => s + (parsePercent(r.percent) as number), 0)).toBe(WHOLE);
      expect(shareStatus(rows).ok).toBe(true);
    }
  });
});

describe('sharesBody', () => {
  it('sends percentages as numbers', () => {
    expect(sharesBody([{ performerId: 'a', percent: '33.34' }, { performerId: 'b', percent: '66.66' }])).toEqual([{ performerId: 'a', percent: 33.34 }, { performerId: 'b', percent: 66.66 }]);
  });
});

describe('tipStatus', () => {
  it('by amount: ₹500 as ₹250 + ₹250 is ready; anything else says what is left', () => {
    expect(tipStatus('fixed', [{ performerId: 'k', value: '250' }, { performerId: 'r', value: '250' }], 50000)).toMatchObject({ ok: true, remaining: 0, message: 'Adds up to the tip' });
    expect(tipStatus('fixed', [{ performerId: 'k', value: '250' }, { performerId: 'r', value: '249' }], 50000)).toMatchObject({ ok: false, remaining: 100, message: '₹1 still to share' });
    expect(tipStatus('fixed', [{ performerId: 'k', value: '250' }, { performerId: 'r', value: '250.50' }], 50000)).toMatchObject({ ok: false, remaining: -50, message: '₹0.50 too much' });
    expect(tipStatus('fixed', [{ performerId: 'k', value: '99.50' }, { performerId: 'r', value: '0.51' }], 10001).ok).toBe(true);
  });
  it('by percentage: they must add up to 100', () => {
    expect(tipStatus('percent', [{ performerId: 'k', value: '50' }, { performerId: 'r', value: '50' }], 50000).ok).toBe(true);
    expect(tipStatus('percent', [{ performerId: 'k', value: '50' }, { performerId: 'r', value: '49' }], 50000)).toMatchObject({ ok: false, message: '1% still to share' });
    expect(tipStatus('percent', [{ performerId: 'k', value: '51' }, { performerId: 'r', value: '50' }], 50000)).toMatchObject({ ok: false, message: '1% too much' });
  });
  it('needs a tip, real people and real values', () => {
    expect(tipStatus('fixed', [{ performerId: 'k', value: '10' }], 0)).toMatchObject({ ok: false, message: 'Enter a tip first' });
    expect(tipStatus('fixed', [{ performerId: '', value: '500' }], 50000).rowErrors).toEqual(['Choose a person']);
    expect(tipStatus('fixed', [{ performerId: 'k', value: '250' }, { performerId: 'k', value: '250' }], 50000).rowErrors).toEqual(['', 'This person is listed twice']);
    expect(tipStatus('fixed', [{ performerId: 'k', value: '0' }, { performerId: 'r', value: '500' }], 50000).rowErrors[0]).toBe('Enter an amount like 250 or 99.50');
    expect(tipStatus('fixed', [{ performerId: 'k', value: 'x' }], 50000).ok).toBe(false);
    expect(tipStatus('percent', [{ performerId: 'k', value: '33.333' }], 50000).ok).toBe(false);
  });
  it('not shared is always fine', () => {
    expect(tipStatus('none', [], 50000)).toMatchObject({ ok: true, message: '' });
    expect(tipStatus('none', [], 0).ok).toBe(true);
  });
});

describe('equalTipRows and tipSplitBody', () => {
  it('shares a tip evenly down to the paisa, the spare going to the first, and the result is ready to save', () => {
    expect(equalTipRows('fixed', ['a', 'b'], 50000).map((r) => r.value)).toEqual(['250', '250']);
    expect(equalTipRows('fixed', ['a', 'b', 'c'], 10001).map((r) => r.value)).toEqual(['33.34', '33.34', '33.33']);
    expect(equalTipRows('percent', ['a', 'b', 'c'], 10001).map((r) => r.value)).toEqual(['33.34', '33.33', '33.33']);
    for (const tip of [1, 2, 3, 10001, 50000, 123457]) {
      for (const n of [1, 2, 3, 7]) {
        const ids = Array.from({ length: n }, (_, i) => `p${i}`);
        if (tip >= n) expect(tipStatus('fixed', equalTipRows('fixed', ids, tip), tip).ok).toBe(true);
        expect(tipStatus('percent', equalTipRows('percent', ids, tip), tip).ok).toBe(true);
      }
    }
  });
  it('sends what the server expects, or nothing when the tip is not shared', () => {
    expect(tipSplitBody('fixed', [{ performerId: 'k', value: '250' }, { performerId: 'r', value: '250.5' }])).toEqual({ mode: 'fixed', shares: [{ performerId: 'k', value: 250 }, { performerId: 'r', value: 250.5 }] });
    expect(tipSplitBody('percent', [{ performerId: 'k', value: '33.33' }, { performerId: 'r', value: '66.67' }])).toEqual({ mode: 'percent', shares: [{ performerId: 'k', value: 33.33 }, { performerId: 'r', value: 66.67 }] });
    expect(tipSplitBody('none', [{ performerId: 'k', value: '1' }])).toBeUndefined();
  });
});
