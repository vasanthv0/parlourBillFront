// Small pure helpers for the platform Activity logs page. No Angular in here, so they can be tested on their own.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date typed or picked as YYYY-MM-DD, as a real local Date at the given time, or null if it is not a real day (2026-02-31). */
function localDate(day: string, h: number, m: number, s: number, ms: number): Date | null {
  const match = DAY.exec(day);
  if (!match) return null;
  const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, mo - 1, d, h, m, s, ms);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/**
 * The picked days as exact moments, using the browser's own clock: "1 November" means 1 November where the admin is
 * sitting, from its first millisecond to its last. The API takes these as ISO date-times with an offset.
 */
export function rangeToIso(from: string, to: string): { from?: string; to?: string; error?: string } {
  const start = from ? localDate(from, 0, 0, 0, 0) : undefined;
  const end = to ? localDate(to, 23, 59, 59, 999) : undefined;
  if (start === null) return { error: 'The start date is not a real date.' };
  if (end === null) return { error: 'The end date is not a real date.' };
  if (start && end && start.getTime() > end.getTime()) return { error: 'The start date is after the end date.' };
  return { from: start?.toISOString(), to: end?.toISOString() };
}

export type ActionTone = 'good' | 'bad' | 'warn' | 'plain';

/** Which colour an action's badge gets: things switched on or restored are green, removals and stops red, sensitive changes amber. */
export function toneOf(action: string): ActionTone {
  if (['parlour.created', 'parlour.reactivated', 'feature.enabled'].includes(action)) return 'good';
  if (['parlour.deleted', 'parlour.suspended'].includes(action)) return 'bad';
  if (['feature.disabled', 'parlour.owner_password_reset'].includes(action)) return 'warn';
  return 'plain';
}

/** The before or after values as readable lines. Shown as text, never as HTML. */
export function valueLines(values: Record<string, unknown> | null | undefined): { key: string; text: string }[] {
  if (!values) return [];
  return Object.entries(values).map(([key, v]) => ({
    key,
    text: v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v),
  }));
}

/** "feature page.team", "parlour 3f2b8c1e…": ids that are long uuids are shortened (the full one is in the tooltip). */
export function entityLabel(type: string, id: string | null): string {
  if (!id) return type;
  return `${type} ${id.length > 24 ? `${id.slice(0, 8)}…` : id}`;
}
