import { BillAttempt, newIdempotencyKey } from './idempotency';

// What the API accepts: 8 to 128 of letters, digits and - _ . :
const ACCEPTED_BY_API = /^[A-Za-z0-9_.:-]{8,128}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newIdempotencyKey', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const setCrypto = (value: unknown) => Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete (globalThis as { crypto?: unknown }).crypto;
  });

  it('uses crypto.randomUUID when the browser has it', () => {
    setCrypto({ randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    expect(newIdempotencyKey()).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('falls back to getRandomValues (plain http pages, older browsers, the test environment) and still makes a version-4 UUID', () => {
    setCrypto({ getRandomValues: (a: Uint8Array) => { a.fill(0); return a; } });
    expect(newIdempotencyKey()).toBe('00000000-0000-4000-8000-000000000000'); // version and variant bits are set, the rest is the random bytes
    setCrypto({ getRandomValues: (a: Uint8Array) => { a.fill(0xff); return a; } });
    expect(newIdempotencyKey()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('still works with no crypto at all', () => {
    setCrypto(undefined);
    const key = newIdempotencyKey();
    expect(key).toMatch(UUID_V4);
  });

  it('is always accepted by the API and is different every time, whichever way it was made', () => {
    for (const crypto of [undefined, { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } }]) {
      setCrypto(crypto);
      const keys = Array.from({ length: 500 }, () => newIdempotencyKey());
      expect(keys.every((k) => ACCEPTED_BY_API.test(k))).toBe(true);
      expect(new Set(keys).size).toBe(500);
    }
  });
});

describe('BillAttempt', () => {
  const bill = (over: object = {}) => ({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: null, discount: 0, paymentMethod: 'cash', ...over });

  it('gives the same bill the same key every time it is sent', () => {
    const attempt = new BillAttempt();
    const first = attempt.keyFor(bill());
    expect(first).toMatch(ACCEPTED_BY_API);
    expect(attempt.keyFor(bill())).toBe(first);          // a different object with the same content
    expect(attempt.keyFor(bill())).toBe(first);
  });

  it('gives a bill that differs in anything its own key', () => {
    const attempt = new BillAttempt();
    const keys = [
      attempt.keyFor(bill()),
      attempt.keyFor(bill({ items: [{ serviceId: 's3', quantity: 2 }] })),
      attempt.keyFor(bill({ items: [{ serviceId: 's1', quantity: 1 }] })),
      attempt.keyFor(bill({ discount: 50 })),
      attempt.keyFor(bill({ paymentMethod: 'upi' })),
      attempt.keyFor(bill({ customerId: 'c1' })),
      attempt.keyFor(bill({ referrerId: 'r1' })),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a split payment is part of the bill: the same split keeps its key, any change to an amount, a method or the tip gets a new one', () => {
    const attempt = new BillAttempt();
    const split = (over: object = {}) => ({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: null, discount: 0, payments: [{ method: 'cash', amount: 600 }, { method: 'upi', amount: 450 }], ...over });
    const first = attempt.keyFor(split());
    expect(attempt.keyFor(split())).toBe(first);
    const others = [
      split({ payments: [{ method: 'cash', amount: 601 }, { method: 'upi', amount: 449 }] }),
      split({ payments: [{ method: 'cash', amount: 600 }, { method: 'card', amount: 450 }] }),
      split({ tip: 50 }),
      bill(),
    ].map((b) => attempt.keyFor(b));
    expect(new Set([first, ...others]).size).toBe(others.length + 1);
  });

  it('a bill edited and then changed back is the same bill again, so it keeps its key', () => {
    const attempt = new BillAttempt();
    const original = attempt.keyFor(bill());
    const edited = attempt.keyFor(bill({ discount: 50 }));
    expect(edited).not.toBe(original);
    expect(attempt.keyFor(bill())).toBe(original);
  });

  it('fields left undefined do not count (they are not sent)', () => {
    const attempt = new BillAttempt();
    expect(attempt.keyFor(bill({ walkInName: undefined }))).toBe(attempt.keyFor(bill()));
  });

  it('forget() makes the next send of that bill start a fresh attempt, and leaves other bills alone', () => {
    const attempt = new BillAttempt();
    const a = attempt.keyFor(bill());
    const b = attempt.keyFor(bill({ discount: 50 }));
    attempt.forget(bill());
    expect(attempt.keyFor(bill())).not.toBe(a);
    expect(attempt.keyFor(bill({ discount: 50 }))).toBe(b);
  });

  it('a new screen starts with no keys, so the same bill made on purpose a second time is a new bill', () => {
    expect(new BillAttempt().keyFor(bill())).not.toBe(new BillAttempt().keyFor(bill()));
  });
});
