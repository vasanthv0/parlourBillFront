/**
 * Sharing a bill line, and a tip, between people, on the billing screen. This mirrors
 * billback/src/modules/commissions/allocation.js: the same rules, so the screen says "ready" exactly when the server will accept it.
 * The server is the one that decides (it checks again when the bill is saved); this only lets the screen show what is still to
 * be shared before Save is pressed.
 *
 * Percentages are typed as text with at most two decimals ("33.33") and are worked with as WHOLE HUNDREDTHS OF A PERCENT
 * (33.33% = 3333, 100% = 10000), so "do they add up to 100?" is an exact whole-number sum, never a floating point one.
 * Tip amounts are whole paise (parseAmount in payments.ts).
 */
import { formatAmount, parseAmount } from './payments';

/** The most people one line (or one tip) can be shared between. The server refuses more. */
export const MAX_PEOPLE = 10;
/** 100.00% in hundredths of a percent. */
export const WHOLE = 10_000;

/** One person on a line, as typed: who, and their share as text ("50", "33.33"). */
export interface ShareRow { performerId: string; percent: string }

/**
 * What was typed in a percentage box, as whole hundredths of a percent: "33.33" → 3333, "50" → 5000.
 * Null for anything that is not a percentage: blank, 0, negative, letters, more than 2 decimals, or above 100.
 */
export function parsePercent(raw: string): number | null {
  const text = String(raw ?? '').trim().replace(/%$/, '').trim();
  const m = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(text);
  if (!m) return null;
  const hundredths = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return hundredths >= 1 && hundredths <= WHOLE ? hundredths : null;
}

/** Hundredths as the text for a percentage box: 5000 → "50", 3333 → "33.33", 3350 → "33.5". */
export function formatPercent(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const rest = hundredths % 100;
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(2, '0')}`.replace(/0$/, '');
}

export interface ShareStatus {
  /** Each row's problem, in order ('' when it is fine): no person chosen, the same person twice, or not a percentage. */
  rowErrors: string[];
  /** The percentages typed so far that are valid, added up, in hundredths. */
  total: number;
  /** Still to share (positive) or shared too much (negative), in hundredths. */
  remaining: number;
  /** Every row is fine and they add up to exactly 100: this is what the server will accept. */
  ok: boolean;
  /** One short sentence for the person: what is wrong, or that it adds up. */
  message: string;
}

/** Where the shares of one line stand. A line with fewer than two people is never "shared": it is one person at 100%. */
export function shareStatus(rows: readonly ShareRow[]): ShareStatus {
  const seen = new Set<string>();
  let total = 0;
  let bad = false;
  const rowErrors = rows.map((r) => {
    if (!r.performerId) { bad = true; return 'Choose a person'; }
    if (seen.has(r.performerId)) { bad = true; return 'This person is listed twice'; }
    seen.add(r.performerId);
    const h = parsePercent(r.percent);
    if (h === null) { bad = true; return 'Enter a percentage like 50 or 33.33'; }
    total += h;
    return '';
  });
  const remaining = WHOLE - total;
  const ok = !bad && rows.length >= 1 && rows.length <= MAX_PEOPLE && remaining === 0;
  let message: string;
  if (bad) message = rowErrors.find(Boolean) ?? '';
  else if (remaining === 0) message = 'Adds up to 100%';
  else if (remaining > 0) message = `${formatPercent(remaining)}% still to share`;
  else message = `${formatPercent(-remaining)}% too much`;
  return { rowErrors, total, remaining, ok, message };
}

/** Whole hundredths shared as evenly as possible between n people: 3 → 3334, 3333, 3333 (the spare goes to the first). */
function evenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const spare = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < spare ? 1 : 0));
}

/** n people with equal shares that add up to exactly 100: [50, 50], [33.34, 33.33, 33.33]. */
export function equalRows(performerIds: readonly string[]): ShareRow[] {
  const shares = evenly(WHOLE, performerIds.length);
  return performerIds.map((performerId, i) => ({ performerId, percent: formatPercent(shares[i]) }));
}

/** What the server is sent for a line shared between people: percentages as numbers. */
export const sharesBody = (rows: readonly ShareRow[]): { performerId: string; percent: number }[] =>
  rows.map((r) => ({ performerId: r.performerId, percent: (parsePercent(r.percent) ?? 0) / 100 }));

// ───────────── tips ─────────────

/** How a tip is shared: not at all, by an amount for each person, or by a percentage for each. */
export type TipMode = 'none' | 'fixed' | 'percent';

/** One person's share of a tip, as typed: rupees for 'fixed', a percentage for 'percent'. */
export interface TipRow { performerId: string; value: string }

export interface TipStatus {
  rowErrors: string[];
  /** The valid values typed so far, added up: paise for 'fixed', hundredths of a percent for 'percent'. */
  total: number;
  /** What the total has to be: the tip in paise for 'fixed', 10000 for 'percent'. */
  target: number;
  /** Still to share (positive) or shared too much (negative), in the same unit as `total`. */
  remaining: number;
  ok: boolean;
  message: string;
}

/** Where a shared tip stands against the tip. Nothing to check when it is not shared. */
export function tipStatus(mode: TipMode, rows: readonly TipRow[], tipPaise: number): TipStatus {
  const target = mode === 'percent' ? WHOLE : tipPaise;
  if (mode === 'none') return { rowErrors: [], total: 0, target, remaining: 0, ok: true, message: '' };
  const seen = new Set<string>();
  let total = 0;
  let bad = false;
  const rowErrors = rows.map((r) => {
    if (!r.performerId) { bad = true; return 'Choose a person'; }
    if (seen.has(r.performerId)) { bad = true; return 'This person is listed twice'; }
    seen.add(r.performerId);
    if (mode === 'percent') {
      const h = parsePercent(r.value);
      if (h === null) { bad = true; return 'Enter a percentage like 50 or 33.33'; }
      total += h;
    } else {
      const p = parseAmount(r.value);
      if (p === null || p <= 0) { bad = true; return 'Enter an amount like 250 or 99.50'; }
      total += p;
    }
    return '';
  });
  const remaining = target - total;
  const ok = !bad && tipPaise > 0 && rows.length >= 1 && rows.length <= MAX_PEOPLE && remaining === 0;
  const unit = (n: number) => (mode === 'percent' ? `${formatPercent(n)}%` : `₹${formatAmount(n)}`);
  let message: string;
  if (tipPaise <= 0) message = 'Enter a tip first';
  else if (bad) message = rowErrors.find(Boolean) ?? '';
  else if (remaining === 0) message = mode === 'percent' ? 'Adds up to 100%' : 'Adds up to the tip';
  else if (remaining > 0) message = `${unit(remaining)} still to share`;
  else message = `${unit(-remaining)} too much`;
  return { rowErrors, total, target, remaining, ok, message };
}

/** The tip shared as evenly as possible between people: by amount (the spare paise go to the first) or by percentage. */
export function equalTipRows(mode: Exclude<TipMode, 'none'>, performerIds: readonly string[], tipPaise: number): TipRow[] {
  const parts = mode === 'percent' ? evenly(WHOLE, performerIds.length) : evenly(Math.max(0, tipPaise), performerIds.length);
  return performerIds.map((performerId, i) => ({ performerId, value: mode === 'percent' ? formatPercent(parts[i]) : formatAmount(parts[i]) }));
}

/** What the server is sent for a shared tip: amounts in rupees, or percentages, as numbers. Undefined when the tip is not shared. */
export function tipSplitBody(mode: TipMode, rows: readonly TipRow[]): { mode: 'fixed' | 'percent'; shares: { performerId: string; value: number }[] } | undefined {
  if (mode === 'none') return undefined;
  return {
    mode,
    shares: rows.map((r) => ({ performerId: r.performerId, value: mode === 'percent' ? (parsePercent(r.value) ?? 0) / 100 : (parseAmount(r.value) ?? 0) / 100 })),
  };
}
