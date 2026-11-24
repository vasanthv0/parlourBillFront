import { MovementType, StockState } from './models';

/** Quantities show up to 3 decimals and no trailing zeros: 12, 2.5, 0.125. */
const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
export const fmtQty = (n: number | null | undefined): string => quantity.format(Number(n ?? 0));

/** "+5" / "−2" for a stock movement. */
export const fmtChange = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '') + quantity.format(Math.abs(n));

export const MOVEMENT_LABEL: Record<MovementType, string> = { stock_in: 'Stock in', stock_out: 'Stock out', adjustment: 'Adjustment', purchase: 'Purchase' };
export const STATE_LABEL: Record<StockState, string> = { ok: 'In stock', low: 'Low stock', out: 'Out of stock' };
export const stateBadge = (s: StockState | undefined): string => (s === 'out' ? 'badge-void' : s === 'low' ? 'badge-warn' : 'badge-paid');

/** Common units to suggest in the product form. Any text is accepted. */
export const UNIT_SUGGESTIONS = ['pcs', 'bottle', 'tube', 'box', 'pack', 'sachet', 'ml', 'l', 'g', 'kg'];

/** A date-time as the person sees it (their own device's clock). */
export const fmtWhen = (iso: string): string => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Turns an empty text box into null, otherwise the trimmed text. */
export const orNull = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);
