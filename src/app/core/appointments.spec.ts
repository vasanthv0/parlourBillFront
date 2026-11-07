import { Column, Draft, NOBODY, canMarkNoShow, canRemind, clock, columnsFor, isOpen, longDate, minutesLabel, phoneProblem, plannedMinutes, problems, servicesText, shiftDate, waitingFor } from './appointments';
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
