import { TestBed } from '@angular/core/testing';
import { entityLabel, rangeToIso, toneOf, valueLines } from './core/activity-log';
import { ActivityLogsComponent } from './features/superadmin/activity-logs.component';
import { ShellComponent } from './features/shell/shell.component';
import { Page, installDomShims, open } from './testing/harness';

jest.setTimeout(30000);
beforeAll(installDomShims);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isLogList = (r: { method: string; url: string }) => r.method === 'GET' && r.url.includes('/platform/activity-logs') && !r.url.includes('/filters');
const meta = (total: number, page = 1, pages = 1) => ({ page, limit: 20, total, pages });
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, createdAt: '2026-11-11T10:30:00.000Z', actor: { id: 'su', name: 'Platform Admin' }, action: 'parlour.updated', actionLabel: 'Parlour updated',
  parlour: { id: 'pp1', name: 'Glow Salon' }, entity: { type: 'parlour', id: 'pp1' }, description: 'Updated parlour “Glow Salon” (name)',
  previousValues: { name: 'Old' }, newValues: { name: 'Glow Salon' }, requestId: 'req-abcdefgh', ip: null, ...over,
});

/** Make a change to a filter and hand back the request it caused (the page asks straight away). */
async function change(page: Page, selector: string, value: string, event = 'change') {
  const el = page.host.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) throw new Error(`No element for ${selector}`);
  el.value = value;
  el.dispatchEvent(new Event(event));
  return page.http.expectOne(isLogList);
}

describe('activity log helpers', () => {
  it('turns picked days into the browser’s own day boundaries', () => {
    const r = rangeToIso('2026-11-01', '2026-11-03');
    const from = new Date(r.from as string);
    const to = new Date(r.to as string);
    expect([from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([2026, 10, 1, 0, 0, 0]);
    expect([to.getFullYear(), to.getMonth(), to.getDate(), to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()]).toEqual([2026, 10, 3, 23, 59, 59, 999]);
    expect(r.error).toBeUndefined();
  });

  it('one day is a valid range, and leaving either end empty is fine', () => {
    expect(rangeToIso('2026-11-01', '2026-11-01').error).toBeUndefined();
    expect(rangeToIso('', '')).toEqual({ from: undefined, to: undefined });
    expect(rangeToIso('2026-11-01', '').to).toBeUndefined();
    expect(rangeToIso('', '2026-11-01').from).toBeUndefined();
  });

  it('refuses impossible and backwards ranges', () => {
    expect(rangeToIso('2026-02-31', '').error).toMatch(/start date/);
    expect(rangeToIso('', '2026-13-01').error).toMatch(/end date/);
    expect(rangeToIso('garbage', '').error).toBeDefined();
    expect(rangeToIso('2026-11-05', '2026-11-01').error).toMatch(/after/);
  });

  it('gives each action a tone', () => {
    expect(toneOf('parlour.created')).toBe('good');
    expect(toneOf('feature.enabled')).toBe('good');
    expect(toneOf('parlour.suspended')).toBe('bad');
    expect(toneOf('parlour.deleted')).toBe('bad');
    expect(toneOf('feature.disabled')).toBe('warn');
    expect(toneOf('parlour.updated')).toBe('plain');
    expect(toneOf('something.new')).toBe('plain');
  });

  it('shows values as plain lines', () => {
    expect(valueLines(null)).toEqual([]);
    expect(valueLines(undefined)).toEqual([]);
    expect(valueLines({ name: 'Glow', enabled: false, n: 3, gone: null, nested: { a: 1 } })).toEqual([
      { key: 'name', text: 'Glow' }, { key: 'enabled', text: 'false' }, { key: 'n', text: '3' }, { key: 'gone', text: '—' }, { key: 'nested', text: '{"a":1}' },
    ]);
  });

  it('shortens long ids but not feature keys', () => {
    expect(entityLabel('parlour', '3f2b8c1e-5d4a-4e7b-9c1d-2a6f8e0b7c11')).toBe('parlour 3f2b8c1e…');
    expect(entityLabel('feature', 'page.team')).toBe('feature page.team');
    expect(entityLabel('platform_config', null)).toBe('platform_config');
  });
});

describe('Activity logs page', () => {
  it('lists each entry with date, admin, action, parlour, entity and description', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    const text = page.text();
    expect(text).toContain('Activity logs');
    for (const expected of ['Platform Admin', 'Second Admin', 'Parlour suspended', 'Feature disabled', 'Parlour created', 'Glow Salon', 'Suspended parlour “Glow Salon”', 'Switched off “Team” for “Glow Salon”', 'feature page.team', 'parlour 3f2b8c1e…']) {
      expect(text).toContain(expected);
    }
    expect(text).toContain('3 entries');
    expect(page.host.querySelectorAll('tbody tr').length).toBe(3);
    page.http.verify();
  });

  it('says so when there is nothing yet', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin', empty: true });
    expect(page.text()).toContain('No activity yet');
    expect(page.host.querySelector('table')).toBeNull();
  });

  it('can only be read: there is no button to edit, delete or remove an entry', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    const labels = [...page.host.querySelectorAll('button, a')].map((b) => (b.textContent ?? '').trim());
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/delete|remove|edit|undo|restore|clear (all|log)/i);
    expect(page.host.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('opens an entry to show what it was before and after, and where the request came from', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    expect(page.text()).not.toContain('req-0123456789');
    await page.click('Details');
    const text = page.text();
    for (const expected of ['Before', 'After', 'status', 'active', 'suspended', 'req-0123456789', '203.0.113.9']) expect(text).toContain(expected);
    expect(page.host.querySelectorAll('.detail-row').length).toBe(1);
    await page.click('Hide');
    expect(page.host.querySelectorAll('.detail-row').length).toBe(0);
  });

  it('says what a created entry replaced: nothing', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    const buttons = [...page.host.querySelectorAll('button')].filter((b) => (b.textContent ?? '').includes('Details'));
    buttons[2].click(); // the "Parlour created" entry
    await page.settle();
    expect(page.text()).toContain('this did not exist before');
  });

  it('filters by admin, parlour and action: each choice asks the API, starting again from page 1', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    for (const [selector, param, value] of [['#al-admin', 'actorId', 'su2'], ['#al-parlour', 'parlourId', 'pp2'], ['#al-action', 'action', 'parlour.deleted']] as const) {
      const req = await change(page, selector, value);
      expect(req.request.params.get(param)).toBe(value);
      expect(req.request.params.get('page')).toBe('1');
      req.flush({ data: [], meta: meta(0) });
      await page.settle();
    }
    expect(page.text()).toContain('Nothing matches these filters');
    page.http.verify();
  });

  it('filters by date range using the browser’s own day boundaries', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    const first = await change(page, '#al-from', '2026-11-01', 'input');
    expect(first.request.params.get('from')).toBe(rangeToIso('2026-11-01', '').from);
    expect(first.request.params.get('to')).toBeNull();
    first.flush({ data: [], meta: meta(0) });
    await page.settle();
    const second = await change(page, '#al-to', '2026-11-03', 'input');
    expect(second.request.params.get('from')).toBe(rangeToIso('2026-11-01', '').from);
    expect(second.request.params.get('to')).toBe(rangeToIso('', '2026-11-03').to);
    second.flush({ data: [], meta: meta(0) });
    await page.settle();
  });

  it('does not ask the server about a range that cannot be right', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    (await change(page, '#al-from', '2026-11-05', 'input')).flush({ data: [], meta: meta(0) });
    await page.settle();
    const to = page.host.querySelector('#al-to') as HTMLInputElement;
    to.value = '2026-11-01';
    to.dispatchEvent(new Event('input'));
    await page.settle();
    expect(page.http.match(isLogList).length).toBe(0);
    expect(page.text()).toContain('start date is after the end date');
  });

  it('searches after the person stops typing, and sends what they typed', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    const input = page.host.querySelector('#al-search') as HTMLInputElement;
    input.value = 'glow';
    input.dispatchEvent(new Event('input'));
    expect(page.http.match(isLogList).length).toBe(0); // still waiting for them to finish typing
    await sleep(400);
    const req = page.http.expectOne(isLogList);
    expect(req.request.params.get('search')).toBe('glow');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [row('x1')], meta: meta(1) });
    await page.settle();
  });

  it('pages: Next asks for the next page, Previous goes back', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    (await change(page, '#al-admin', 'su')).flush({ data: [row('a1')], meta: meta(45, 1, 3) });
    await page.settle();
    expect(page.text()).toContain('Page 1 of 3');
    expect(page.text()).toContain('45 entries');

    const nextClick = page.click(/Next/);
    const next = page.http.expectOne(isLogList);
    expect(next.request.params.get('page')).toBe('2');
    expect(next.request.params.get('actorId')).toBe('su'); // the filter is kept
    next.flush({ data: [row('a2')], meta: meta(45, 2, 3) });
    await nextClick;
    expect(page.text()).toContain('Page 2 of 3');

    const prevClick = page.click(/Previous/);
    const prev = page.http.expectOne(isLogList);
    expect(prev.request.params.get('page')).toBe('1');
    prev.flush({ data: [row('a1')], meta: meta(45, 1, 3) });
    await prevClick;
    expect(page.text()).toContain('Page 1 of 3');
  });

  it('ignores an answer that arrives after a newer question was asked', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    (page.host.querySelector('#al-admin') as HTMLSelectElement).value = 'su';
    (page.host.querySelector('#al-admin') as HTMLSelectElement).dispatchEvent(new Event('change'));
    (page.host.querySelector('#al-action') as HTMLSelectElement).value = 'parlour.deleted';
    (page.host.querySelector('#al-action') as HTMLSelectElement).dispatchEvent(new Event('change'));
    const [older, newer] = page.http.match(isLogList);
    newer.flush({ data: [row('n1', { description: 'NEWER ANSWER' })], meta: meta(1) });
    older.flush({ data: [row('o1', { description: 'OLDER ANSWER' })], meta: meta(1) });
    await page.settle();
    expect(page.text()).toContain('NEWER ANSWER');
    expect(page.text()).not.toContain('OLDER ANSWER');
  });

  it('shows names and descriptions as text, never as HTML', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    const evil = '<img src="x" onerror="window.__pwned = 1"><b>bold</b>';
    (await change(page, '#al-admin', 'su')).flush({
      data: [row('e1', { description: evil, actor: { id: 'su', name: evil }, parlour: { id: 'pp1', name: evil }, newValues: { name: evil } })],
      meta: meta(1),
    });
    await page.settle();
    await page.click('Details');
    expect(page.host.querySelector('img')).toBeNull();
    expect(page.host.querySelector('tbody b')).toBeNull();
    expect(page.text()).toContain('<img src="x"');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('says what went wrong and lets the person try again', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    (await change(page, '#al-admin', 'su')).flush({ error: { code: 'INTERNAL', message: 'Something went wrong on our side' } }, { status: 500, statusText: 'Server Error' });
    await page.settle();
    expect(page.text()).toContain('Could not load the activity log');
    expect(page.text()).toContain('Something went wrong on our side');
    const retry = page.click('Try again');
    page.http.expectOne(isLogList).flush({ data: [row('r1')], meta: meta(1) });
    await retry;
    expect(page.text()).not.toContain('Could not load the activity log');
  });

  it('clears every filter in one go', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin' });
    expect(page.text()).not.toContain('Clear filters');
    (await change(page, '#al-admin', 'su2')).flush({ data: [], meta: meta(0) });
    await page.settle();
    const clear = page.click('Clear filters');
    const req = page.http.expectOne(isLogList);
    expect(req.request.params.has('actorId')).toBe(false);
    req.flush({ data: [row('c1')], meta: meta(1) });
    await clear;
    expect((page.host.querySelector('#al-admin') as HTMLSelectElement).value).toBe('');
  });

  it('opens already filtered when linked to with a parlour', async () => {
    const page = await open(ActivityLogsComponent, { role: 'super_admin', query: '?parlourId=pp1' });
    expect((page.host.querySelector('#al-parlour') as HTMLSelectElement).value).toBe('pp1');
    expect(page.text()).toContain('Clear filters');
  });
});

describe('Activity logs in the sidebar', () => {
  it('is in the platform admin’s menu, and not in a parlour admin’s or staff member’s', async () => {
    const platform = await open(ShellComponent, { role: 'super_admin' });
    expect(platform.text()).toContain('Activity logs');
    expect(platform.text()).toContain('Parlours');
    TestBed.resetTestingModule();

    const admin = await open(ShellComponent, { role: 'admin' });
    expect(admin.text()).not.toContain('Activity logs');
    TestBed.resetTestingModule();

    const staff = await open(ShellComponent, { role: 'staff' });
    expect(staff.text()).not.toContain('Activity logs');
  });
});
