/**
 * A new unique id for one bill attempt. It is sent as the Idempotency-Key header so that sending the same bill
 * twice (a double tap, or a retry after the connection dropped) cannot make two bills.
 *
 * crypto.randomUUID() only exists on secure pages (https or localhost) and in recent browsers, so this falls back
 * to getRandomValues, and last of all to Math.random. Keys only need to be unique, not secret.
 * The result is always a version-4 UUID, which is inside what the API accepts (8 to 128 of letters, digits and - _ . :).
 */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Remembers one key per distinct bill, for as long as the new-bill screen is open. The same bill sent again (after a
 * timeout, or a dropped connection where the server may already have saved it) gets the SAME key, so the server can
 * recognise it and return the bill it already made. A bill that differs in anything gets its own, new key. That also
 * holds if someone edits the bill and then changes it back: it is the same bill, so it keeps its key.
 * A new screen (the next customer) starts with no keys, so making the same bill twice on purpose still works.
 */
export class BillAttempt {
  private readonly keys = new Map<string, string>();

  /** The key to send for this exact bill. `bill` is whatever is sent to the server: only its content matters. */
  keyFor(bill: unknown): string {
    const signature = JSON.stringify(bill);
    let key = this.keys.get(signature);
    if (!key) {
      key = newIdempotencyKey();
      this.keys.set(signature, key);
    }
    return key;
  }

  /** Drop the key for this bill, so its next send starts a fresh attempt (used when the server says the key clashed). */
  forget(bill: unknown): void {
    this.keys.delete(JSON.stringify(bill));
  }
}
