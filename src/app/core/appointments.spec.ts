import { Column, DAY_END_HOUR, DAY_START_HOUR, Draft, NOBODY, NOBODY_FILTER, canMarkNoShow, canRemind, clock, columnsFor, filterColumns, filterKey, isOpen, longDate, minutesLabel, phoneProblem, placeCells, plannedMinutes, problems, servicesText, shiftDate, slotRows, waitingFor } from './appointments';
import { Appointment } from './models';

// The same ideas as billback/tests/appointments.unit.test.js.

const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1', kind: 'booked', status: 'booked', date: '2026-11-06', time: '10:00', startsAt: '2026-11-06T04:30:00.000Z', endsAt: '2026-11-06T05:00:00.000Z', durationMin: 30,
  customerId: null, customerName: 'Meena', customerPhone: null, performerId: null, performerName: null, notes: null, cancelReason: null, reminderSentAt: null,
  invoiceId: null, invoiceNumber: null, canOpenInvoice: false, createdByName: null, createdAt: '2026-11-05T10:00:00.000Z', services: [], ...over,
});
const ids = (columns: Column[]) => columns.map((c) => [c.name, c.items.map((i) => i.id)]);

describe('dates', () => {
  it('moves a calendar date by whole days, across month, year and leap-day edges', () => {
    expect(shiftDate('2026-11-06', 1)).toBe('2026-11-07');
    expect(shiftDate('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDate('2026-11-06', 0)).toBe('2026-11-06');
    expect(shiftDate('2026-11-06', -400)).toBe('2025-10-02');
  });

  it('writes a date long, on the same day whatever the browser\'s time zone is', () => {
    expect(longDate('2026-11-06')).toMatch(/Fri,? 6 Nov,? 2026/);
    expect(longDate('2026-01-01')).toMatch(/Thu,? 1 Jan,? 2026/);
  });

  it('reads the clock on the parlour\'s own wall, in 24 hours', () => {
    expect(clock('2026-11-06T10:00:00Z', 'Asia/Kolkata')).toBe('15:30');
    expect(clock('2026-11-06T10:00:00Z', 'America/New_York')).toBe('05:00');
    expect(clock('2026-11-05T18:30:00Z', 'Asia/Kolkata')).toBe('00:00');   // midnight is 00:00, never 24:00
  });

  it('says how long in plain words', () => {
    expect([5, 45, 60, 90, 125, 600].map(minutesLabel)).toEqual(['5 min', '45 min', '1 h', '1 h 30 min', '2 h 5 min', '10 h']);
  });

  it('says how long a walk-in has waited', () => {
    const at = Date.parse('2026-11-06T10:00:00Z');
    expect(waitingFor('2026-11-06T10:00:00Z', at + 20_000)).toBe('just arrived');
    expect(waitingFor('2026-11-06T10:00:00Z', at + 12 * 60_000)).toBe('12 min');
    expect(waitingFor('2026-11-06T10:00:00Z', at + 65 * 60_000)).toBe('1 h 5 min');
    expect(waitingFor('2026-11-06T10:00:00Z', at - 60_000)).toBe('just arrived');
  });
});

describe('what a visit can do', () => {
  it('is open until it is billed, cancelled or missed', () => {
    expect((['booked', 'waiting', 'in_service'] as const).every(isOpen)).toBe(true);
    expect((['completed', 'cancelled', 'no_show'] as const).some(isOpen)).toBe(false);
  });

  it('a no-show only once the time has come; a reminder only before it', () => {
    const at = Date.parse('2026-11-06T04:30:00.000Z');
    const a = appt();
    expect([canMarkNoShow(a, at - 1), canMarkNoShow(a, at), canMarkNoShow(a, at + 1)]).toEqual([false, true, true]);
    expect([canRemind(a, at - 1), canRemind(a, at), canRemind(a, at + 1)]).toEqual([true, false, false]);
    for (const status of ['waiting', 'in_service', 'completed', 'cancelled', 'no_show'] as const) {
      expect([status, canMarkNoShow(appt({ status }), at + 1), canRemind(appt({ status }), at - 1)]).toEqual([status, false, false]);
    }
  });
});

describe('length and services', () => {
  it('works the length out the way the server does: minutes times quantity, kept between 5 and 600', () => {
    expect(plannedMinutes([{ durationMin: 45, quantity: 1 }, { durationMin: 20, quantity: 2 }])).toBe(85);
    expect(plannedMinutes([{ durationMin: 2, quantity: 1 }])).toBe(5);
    expect(plannedMinutes([{ durationMin: 180, quantity: 10 }])).toBe(600);
    expect(plannedMinutes([])).toBe(5);
  });

  it('lists the services with quantities', () => {
    expect(servicesText({ services: [{ serviceId: 's1', name: 'Haircut', durationMin: 30, quantity: 1 }, { serviceId: 's2', name: 'Head Massage', durationMin: 20, quantity: 2 }] })).toBe('Haircut, Head Massage × 2');
    expect(servicesText({ services: [] })).toBe('');
  });
});

describe('the day calendar columns', () => {
  const people = [{ id: 'asha', name: 'Asha' }, { id: 'ravi', name: 'Ravi' }];

  it('gives every active person a column, even one with nothing today, with visits in time order', () => {
    const list = [
      appt({ id: 'late', performerId: 'asha', startsAt: '2026-11-06T09:00:00.000Z' }),
      appt({ id: 'early', performerId: 'asha', startsAt: '2026-11-06T04:30:00.000Z' }),
    ];
    expect(ids(columnsFor(list, people))).toEqual([['Asha', ['early', 'late']], ['Ravi', []]]);
  });

  it('puts visits with nobody chosen in one extra column, only when there are some', () => {
    expect(ids(columnsFor([appt({ id: 'x' })], people))).toEqual([['Asha', []], ['Ravi', []], [NOBODY, ['x']]]);
    expect(columnsFor([], people).map((c) => c.name)).toEqual(['Asha', 'Ravi']);
  });

  it('keeps a person who is on a visit but no longer on the list', () => {
    const cols = columnsFor([appt({ id: 'old', performerId: 'gone', performerName: 'Old Hand' })], people);
    expect(ids(cols)).toEqual([['Asha', []], ['Ravi', []], ['Old Hand', ['old']]]);
  });

  it('is one plain list when there are no people at all', () => {
    expect(ids(columnsFor([appt({ id: 'a' }), appt({ id: 'b', startsAt: '2026-11-06T03:00:00.000Z' })], []))).toEqual([['Appointments', ['b', 'a']]]);
    expect(ids(columnsFor([], []))).toEqual([['Appointments', []]]);
  });

  it('breaks a tie in start time by who was added first, and does not reorder the list it was given', () => {
    const given = [appt({ id: 'second', createdAt: '2026-11-05T10:00:02.000Z' }), appt({ id: 'first', createdAt: '2026-11-05T10:00:01.000Z' })];
    expect(ids(columnsFor(given, []))).toEqual([['Appointments', ['first', 'second']]]);
    expect(given.map((a) => a.id)).toEqual(['second', 'first']);
  });
});

describe('checking the form before it is sent (the server checks again)', () => {
  const draft = (over: Partial<Draft> = {}): Draft => ({ kind: 'booked', hasCustomer: false, name: 'Priya Das', phone: '', date: '2026-11-06', time: '15:30', serviceCount: 1, minutes: '', notes: '', ...over });

  it('accepts a good booking and a bare walk-in', () => {
    expect(problems(draft())).toEqual({});
    expect(problems(draft({ kind: 'walk_in', name: '', date: '', time: '' }))).toEqual({});
  });

  it('a booking needs a date, a time and a name or a saved customer', () => {
    expect(problems(draft({ date: '' }))).toEqual({ date: 'Choose the date' });
    expect(problems(draft({ time: '' }))).toEqual({ time: 'Choose the time' });
    expect(Object.keys(problems(draft({ name: ' P ' })))).toEqual(['customerName']);
    expect(problems(draft({ name: '', hasCustomer: true }))).toEqual({});
  });

  it('at least one service', () => expect(problems(draft({ serviceCount: 0 }))).toEqual({ items: 'Choose at least one service' }));

  it('the phone follows the customers rule', () => {
    expect(['', '  ', '98400 12345', '+91 98400-12345', '(044) 2345 6789'].map(phoneProblem)).toEqual(['', '', '', '', '']);
    expect(phoneProblem('12345678')).toBe('Enter a phone number with at least 10 digits');
    expect(phoneProblem('call me')).toBe('Enter a valid phone number');
    expect(problems(draft({ phone: '123' }))['customerPhone']).toBe('Enter a valid phone number');
    expect(problems(draft({ phone: '123', hasCustomer: true, name: '' }))).toEqual({});   // a saved customer's own number is used
  });

  it('the length is whole minutes from 5 to 600, or blank', () => {
    for (const ok of ['', '5', '600', ' 45 ']) expect(problems(draft({ minutes: ok }))).toEqual({});
    for (const bad of ['4', '601', '30.5', 'abc', '-5', '1e2']) expect(problems(draft({ minutes: bad }))['durationMin']).toBe('Enter whole minutes, 5 to 600');
  });

  it('notes are limited to 300 characters', () => {
    expect(problems(draft({ notes: 'x'.repeat(300) }))).toEqual({});
    expect(problems(draft({ notes: 'x'.repeat(301) }))['notes']).toBeTruthy();
  });
});

describe('filtering the calendar by person', () => {
  const cols: Column[] = [
    { id: 'asha', name: 'Asha', items: [] },
    { id: 'ravi', name: 'Ravi', items: [] },
    { id: null, name: NOBODY, items: [] },
  ];

  it('an empty choice shows everyone', () => {
    expect(filterColumns(cols, '').map((c) => c.name)).toEqual(['Asha', 'Ravi', NOBODY]);
  });

  it('a person\'s id shows only that person, and the nobody choice shows only the visits with nobody chosen', () => {
    expect(filterColumns(cols, 'ravi').map((c) => c.name)).toEqual(['Ravi']);
    expect(filterColumns(cols, NOBODY_FILTER).map((c) => c.name)).toEqual([NOBODY]);
  });

  it('a choice that matches no column (another day, a deactivated person) falls back to everyone, never to an empty calendar', () => {
    expect(filterColumns(cols, 'gone').map((c) => c.name)).toEqual(['Asha', 'Ravi', NOBODY]);
    expect(filterColumns(cols.slice(0, 2), NOBODY_FILTER).map((c) => c.name)).toEqual(['Asha', 'Ravi']);
  });

  it('does not change the list it was given', () => {
    const before = cols.map((c) => c.name);
    filterColumns(cols, 'asha');
    expect(cols.map((c) => c.name)).toEqual(before);
  });

  it('keys a column by its person, or by one fixed word for the visits with nobody chosen', () => {
    expect(filterKey(cols[0])).toBe('asha');
    expect(filterKey(cols[2])).toBe(NOBODY_FILTER);
    expect(NOBODY_FILTER).toBe('nobody');
  });
});

describe('the time slots of the day', () => {
  const at = (id: string, time: string, over: Partial<Appointment> = {}) => appt({ id, time, ...over });
  const rowsOf = (columns: Column[]) => slotRows(columns);
  const cellIds = (columns: Column[], hour: number) => rowsOf(columns).find((r) => r.hour === hour)!.cells.map((c) => c.items.map((i) => i.id));

  it('shows 09:00 to 20:00 on an empty day, one cell per column in every row', () => {
    const rows = rowsOf([{ id: 'asha', name: 'Asha', items: [] }, { id: 'ravi', name: 'Ravi', items: [] }]);
    expect(rows.map((r) => r.label)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']);
    expect(rows.length).toBe(DAY_END_HOUR - DAY_START_HOUR);
    expect(rows.every((r) => r.cells.length === 2)).toBe(true);
    expect(rows.every((r) => r.cells.every((c) => c.items.length === 0 && !c.busy))).toBe(true);
  });

  it('puts a visit in the hour it starts in, on the parlour\'s own clock, in the person\'s own column', () => {
    const cols: Column[] = [{ id: 'asha', name: 'Asha', items: [at('a', '10:30')] }, { id: 'ravi', name: 'Ravi', items: [at('b', '10:00'), at('c', '14:59')] }];
    expect(cellIds(cols, 10)).toEqual([['a'], ['b']]);
    expect(cellIds(cols, 14)).toEqual([[], ['c']]);
    expect(cellIds(cols, 11)).toEqual([[], []]);
  });

  it('keeps visits that start in the same hour together, in the order given (the columns are already in time order)', () => {
    const cols: Column[] = [{ id: 'asha', name: 'Asha', items: [at('first', '10:00'), at('second', '10:30')] }];
    expect(cellIds(cols, 10)).toEqual([['first', 'second']]);
  });

  it('grows to include a visit before 09:00 or after 20:59, and never past midnight', () => {
    const early = rowsOf([{ id: 'a', name: 'A', items: [at('e', '07:15')] }]);
    expect([early[0].label, early.length]).toEqual(['07:00', 14]);
    const late = rowsOf([{ id: 'a', name: 'A', items: [at('l', '22:30', { durationMin: 60 })] }]);
    expect([late[late.length - 1].label, late.length]).toEqual(['23:00', 15]);
    const overnight = rowsOf([{ id: 'a', name: 'A', items: [at('n', '23:30', { durationMin: 600 })] }]);
    expect(overnight[overnight.length - 1].hour).toBe(23);
  });

  it('a long visit shows the person as busy in the later hours it runs into, and not before it starts or after it ends', () => {
    // 10:30 for 150 minutes ends at 13:00: busy at the top of 11:00 and 12:00, not at 10:00 (it starts inside it) nor 13:00 (it has ended).
    const cols: Column[] = [{ id: 'asha', name: 'Asha', items: [at('long', '10:30', { durationMin: 150 })] }, { id: 'ravi', name: 'Ravi', items: [] }];
    const busy = (hour: number) => rowsOf(cols).find((r) => r.hour === hour)!.cells.map((c) => c.busy);
    expect([10, 11, 12, 13].map(busy)).toEqual([[false, false], [true, false], [true, false], [false, false]]);
  });

  it('a visit that starts exactly on the hour is in that hour, which is not marked busy (the card is the busy sign), but the later hours it runs into are', () => {
    const cols: Column[] = [{ id: 'asha', name: 'Asha', items: [at('x', '10:00', { durationMin: 90 })] }];
    const cell = (hour: number) => rowsOf(cols).find((r) => r.hour === hour)!.cells[0];
    expect([cell(10).items.length, cell(10).busy, cell(11).items.length, cell(11).busy]).toEqual([1, false, 0, true]);
  });

  it('a visit that ends exactly on the hour does not make the next hour busy (back-to-back is free, as on the server)', () => {
    const cols: Column[] = [{ id: 'asha', name: 'Asha', items: [at('x', '10:00', { durationMin: 60 })] }];
    expect(rowsOf(cols).find((r) => r.hour === 11)!.cells[0].busy).toBe(false);
  });

  it('only visits that take a person\'s time make them busy: not a waiting walk-in, a billed, cancelled or no-show visit', () => {
    for (const status of ['waiting', 'completed', 'cancelled', 'no_show'] as const) {
      const cols: Column[] = [{ id: 'a', name: 'A', items: [at('x', '10:00', { status, durationMin: 180 })] }];
      expect([status, rowsOf(cols).some((r) => r.cells[0].busy)]).toEqual([status, false]);
    }
    for (const status of ['booked', 'in_service'] as const) {
      const cols: Column[] = [{ id: 'a', name: 'A', items: [at('x', '10:00', { status, durationMin: 180 })] }];
      expect([status, rowsOf(cols).some((r) => r.cells[0].busy)]).toEqual([status, true]);
    }
  });

  it('marks the column of visits with nobody chosen, so the card names the person only there', () => {
    const rows = rowsOf([{ id: 'asha', name: 'Asha', items: [] }, { id: null, name: NOBODY, items: [] }]);
    expect(rows[0].cells.map((c) => [c.key, c.unassigned])).toEqual([['asha', false], [NOBODY_FILTER, true]]);
  });

  it('a plain list of everything (no people at all) still gets its rows', () => {
    const rows = rowsOf([{ id: null, name: 'Appointments', items: [at('p', '09:15')] }]);
    expect(rows[0].cells[0].items.map((i) => i.id)).toEqual(['p']);
  });

  it('a clock time that is not HH:MM cannot break the calendar: it counts as midnight, and the hours still come out', () => {
    const rows = rowsOf([{ id: 'a', name: 'A', items: [at('bad', 'soon'), at('empty', '')] }]);
    expect(rows[0].hour).toBe(0);
    expect(rows[0].cells[0].items.map((i) => i.id)).toEqual(['bad', 'empty']);
    expect(rows.every((r) => Number.isInteger(r.hour))).toBe(true);
  });

  it('every visit appears exactly once, whatever the hour', () => {
    const items = ['06:00', '09:00', '12:45', '20:59', '21:00', '23:59'].map((t, i) => at(`v${i}`, t));
    const seen = rowsOf([{ id: 'a', name: 'A', items }]).flatMap((r) => r.cells[0].items.map((i) => i.id));
    expect(seen.sort()).toEqual(items.map((i) => i.id).sort());
  });
});

describe('placing the cells on the hour grid', () => {
  const at = (id: string, time: string, over: Partial<Appointment> = {}) => appt({ id, time, ...over });
  const cols: Column[] = [
    { id: 'asha', name: 'Asha', items: [at('a1', '10:30')] },
    { id: 'ravi', name: 'Ravi', items: [at('r1', '09:00'), at('r2', '12:00')] },
  ];

  it('lists one person after another, each from the top of the day down, so the page reads person by person', () => {
    const placed = placeCells(slotRows(cols));
    const withVisits = placed.filter((c) => c.items.length).map((c) => c.items.map((i) => i.id).join());
    expect(withVisits).toEqual(['a1', 'r1', 'r2']);
    expect(placed.length).toBe(slotRows(cols).length * 2);
  });

  it('gives each cell its grid lines: the first hour is row 2 and the first person column 2, under the headings', () => {
    const placed = placeCells(slotRows(cols));
    const rowsN = slotRows(cols).length;
    expect(placed[0]).toEqual({ ...placed[0], row: 2, col: 2 });
    expect(placed[rowsN - 1]).toEqual({ ...placed[rowsN - 1], row: rowsN + 1, col: 2 });
    expect(placed[rowsN]).toEqual({ ...placed[rowsN], row: 2, col: 3 });
    const keyOf = (c: { row: number; col: number }) => `${c.col}:${c.row}`;
    expect(new Set(placed.map(keyOf)).size).toBe(placed.length);   // no two cells on the same spot
  });

  it('a visit lands on the row of its own hour and the column of its own person', () => {
    const placed = placeCells(slotRows(cols));
    const where = (id: string) => placed.filter((c) => c.items.some((i) => i.id === id)).map((c) => [c.col, c.row]);
    expect(where('a1')).toEqual([[2, 10 - DAY_START_HOUR + 2]]);   // 10:30 is in the 10:00 hour: the 2nd hour row, after 09:00
    expect(where('r1')).toEqual([[3, 2]]);
    expect(where('r2')).toEqual([[3, 12 - DAY_START_HOUR + 2]]);
  });

  it('keeps busy and the person marker, and has nothing to place when there are no rows', () => {
    const long: Column[] = [{ id: null, name: 'Appointments', items: [at('x', '10:00', { durationMin: 120 })] }];
    const placed = placeCells(slotRows(long));
    expect(placed.every((c) => c.unassigned)).toBe(true);
    expect(placed.filter((c) => c.busy).map((c) => c.row)).toEqual([4]);   // 10:00 for 2 h: busy at the top of 11:00, which is row 4 (09:00 is row 2)
    expect(placeCells([])).toEqual([]);
  });
});
