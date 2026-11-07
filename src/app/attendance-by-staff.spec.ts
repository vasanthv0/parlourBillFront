import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Route, UrlTree } from '@angular/router';
import { routes } from './app.routes';
import { PerformerAttendanceApi } from './core/api';
import { ADMIN_NAV, STAFF_NAV } from './core/nav';
import { ShellComponent } from './features/shell/shell.component';
import { AttendanceByStaffComponent } from './features/shared/attendance-by-staff.component';
import { Page, installDomShims, open } from './testing/harness';

jest.setTimeout(30000);
beforeAll(installDomShims);

const KEY = 'page.attendance_by_staff';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The sample day: Asha is checked in, Kavya is not, Meena is checked in and out (see testing/harness.ts). */
const button = (page: Page, label: string) => page.host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const posts = (page: Page, urlPart: string) => page.http.match((r) => r.method === 'POST' && r.url.includes(urlPart));

const line = (name: string, performerId: string, status: 'checked_in' | 'checked_out', at: string, out: string | null = null) => ({
  performerId, name, status,
  record: { id: 'new1', performerId, performerName: name, workDate: '2026-10-29', status, checkInAt: at, checkOutAt: out,
    markedBy: { id: 'u1', name: 'Olive Owner' }, checkOutMarkedBy: out ? { id: 'u1', name: 'Olive Owner' } : null },
});
const result = (performer: object) => ({ data: { workDate: '2026-10-29', timezone: 'Asia/Kolkata', performer } });

describe('the Attendance by Staff page', () => {
  it('lists each performer with where they stand, the times in the salon’s time zone, and who recorded each one', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'staff' });
    const text = page.text();

    expect(text).toContain('Attendance by Staff');
    for (const name of ['Asha', 'Kavya', 'Meena']) expect(text).toContain(name);
    expect(text).toMatch(/Checked in – 10:10\sAM/);   // Asha
    expect(text).toContain('Not checked in');          // Kavya
    expect(text).toMatch(/Checked out – 7:15\sPM/);   // Meena
    expect(text).toMatch(/10:05\sAM/);                 // Meena's check-in
    expect(text).toContain('2026-10-29');              // the attendance date
    expect(text).toContain('Riya');                    // recorded the check-ins
    expect(text).toContain('Farah');                   // recorded Meena's check-out
    expect(text).toContain('Completed');               // Meena has nothing left to do

    expect(button(page, 'Check in Kavya')).not.toBeNull();
    expect(button(page, 'Check out Asha')).not.toBeNull();
    expect(button(page, 'Check in Asha')).toBeNull();
    expect(button(page, 'Check in Meena')).toBeNull();
    expect(button(page, 'Check out Meena')).toBeNull();
  });

  it('check in: sends only the performer, then shows the new status and a success message', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'staff' });
    button(page, 'Check in Kavya')!.click();
    await page.settle();

    const req = page.expectOne('POST', '/performer-attendance/check-in');
    expect(req.request.body).toEqual({ performerId: 'pf4' }); // no user, parlour, date or time: the server decides all of those
    req.flush(result(line('Kavya', 'pf4', 'checked_in', '2026-10-29T06:30:00.000Z')));
    await page.settle();

    expect(page.text()).toMatch(/Kavya checked in at 12:00\sPM\./);
    expect(page.text()).toMatch(/Checked in – 12:00\sPM/);
    expect(button(page, 'Check out Kavya')).not.toBeNull();
    expect(button(page, 'Check in Kavya')).toBeNull();
    page.http.verify();
  });

  it('check out: sends only the performer, then shows Completed', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'admin' });
    button(page, 'Check out Asha')!.click();
    await page.settle();

    const req = page.expectOne('POST', '/performer-attendance/check-out');
    expect(req.request.body).toEqual({ performerId: 'pf2' });
    req.flush(result(line('Asha', 'pf2', 'checked_out', '2026-10-29T04:40:00.000Z', '2026-10-29T13:00:00.000Z')));
    await page.settle();

    expect(page.text()).toMatch(/Asha checked out at 6:30\sPM\./);
    expect(button(page, 'Check out Asha')).toBeNull();
    page.http.verify();
  });

  it('a double click sends one request, and every button is off while it is on its way', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'staff' });
    const kavya = button(page, 'Check in Kavya')!;
    kavya.click();
    kavya.click(); // the second tap lands before the screen has even updated
    await page.settle();

    expect(posts(page, '/performer-attendance/check-in')).toHaveLength(1);
    expect(page.text()).toContain('Checking in…');
    expect(button(page, 'Check out Asha')!.disabled).toBe(true);
    expect(button(page, 'Check in Kavya')!.disabled).toBe(true);
  });

  it('shows the server’s reason when it refuses, keeps the row as it was, and reloads the list in case someone else got there first', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'staff' });
    button(page, 'Check in Kavya')!.click();
    await page.settle();
    page.expectOne('POST', '/performer-attendance/check-in').flush(
      { error: { code: 'ALREADY_CHECKED_IN', message: 'Kavya is already checked in for today.' } }, { status: 409, statusText: 'Conflict' });
    await page.settle(); // answers the quiet reload of today's list

    const alert = page.host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Kavya is already checked in for today.');
    // Buttons work again afterwards.
    expect(button(page, 'Check in Kavya')!.disabled).toBe(false);
    page.http.verify();
  });

  it('a network failure says so in plain words', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'staff' });
    button(page, 'Check in Kavya')!.click();
    await page.settle();
    page.expectOne('POST', '/performer-attendance/check-in').error(new ProgressEvent('error'));
    await page.settle();
    expect(page.host.querySelector('[role="alert"]')?.textContent).toContain('Cannot reach the server');
    expect(button(page, 'Check in Kavya')!.disabled).toBe(false);
  });

  it('with no active performers it explains where they come from', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'staff', empty: true });
    expect(page.text()).toContain('No performers to record');
    expect(page.text()).toContain('Performers page');
  });
});

describe('the Attendance by Staff history', () => {
  it('an admin sees every record, who recorded each, missed check-outs flagged, and per-person totals', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'admin' });
    const text = page.text();
    expect(text).toContain('Every record in your parlour');
    expect(text).toContain('Missed check-out');
    expect(text).toContain('Time worked');
    expect(text).toContain('9h 10m');           // Meena's day in the history table (04:35Z to 13:45Z)
    expect(text).toContain('Totals for these dates');
    expect(text).toContain('Old Hand');         // inactive, in the summary
    expect(text).toContain('inactive');
    page.http.verify();
  });

  it('staff see only their own records, and their page never asks for the admin-only report', async () => {
    const report = jest.spyOn(PerformerAttendanceApi.prototype, 'report');
    const history = jest.spyOn(PerformerAttendanceApi.prototype, 'history');
    try {
      const page = await open(AttendanceByStaffComponent, { role: 'staff' });
      expect(page.text()).toContain('The records you recorded');
      expect(page.text()).not.toContain('Totals for these dates');
      expect(history).toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    } finally { report.mockRestore(); history.mockRestore(); }
  });

  it('an admin’s page does ask for the report, for the same dates as the list', async () => {
    const report = jest.spyOn(PerformerAttendanceApi.prototype, 'report');
    try {
      await open(AttendanceByStaffComponent, { role: 'admin' });
      expect(report).toHaveBeenCalledWith({ from: '2026-10-23', to: '2026-10-29', performerId: undefined });
    } finally { report.mockRestore(); }
  });

  it('the dates start as the last seven days of the salon’s calendar and the list is asked for exactly those', async () => {
    const history = jest.spyOn(PerformerAttendanceApi.prototype, 'history');
    try {
      await open(AttendanceByStaffComponent, { role: 'staff' });
      expect(history).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-10-23', to: '2026-10-29', status: '' }));
    } finally { history.mockRestore(); }
  });

  it('changing a filter asks the server again with that filter', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'admin' });
    const select = page.host.querySelector('#abs-status') as HTMLSelectElement;
    select.value = 'missed_checkout';
    select.dispatchEvent(new Event('change'));
    await sleep(0);
    const asked = page.http.match((r) => r.method === 'GET' && r.urlWithParams.includes('/performer-attendance/history') && r.urlWithParams.includes('status=missed_checkout'));
    expect(asked).toHaveLength(1);
    // The performer filter works the same way.
    const person = page.host.querySelector('#abs-person') as HTMLSelectElement;
    person.value = 'pf2';
    person.dispatchEvent(new Event('change'));
    await sleep(0);
    expect(page.http.match((r) => r.urlWithParams.includes('/performer-attendance/history') && r.urlWithParams.includes('performerId=pf2'))).toHaveLength(1);
  });

  it('with nothing recorded the list says so, and so does the history', async () => {
    const page = await open(AttendanceByStaffComponent, { role: 'admin', empty: true });
    expect(page.text()).toContain('No performers to record');
    expect(page.text()).toContain('No attendance in these dates');
  });
});

describe('the sidebar and the route guard', () => {
  it('the sidebar shows Attendance by Staff when it is on, for admin and staff, and hides only that item when it is off', async () => {
    for (const role of ['admin', 'staff'] as const) {
      const on = await open(ShellComponent, { role });
      expect(on.text()).toContain('Attendance by Staff');
      TestBed.resetTestingModule();

      const off = await open(ShellComponent, { role, off: [KEY] });
      expect(off.text()).not.toContain('Attendance by Staff');
      expect(off.text()).toContain(role === 'admin' ? 'My attendance' : 'Attendance'); // the existing menu is untouched
      expect(off.text()).toContain('New bill');
      TestBed.resetTestingModule();
    }
  });

  it('it is independent of the existing Attendance menu in both directions', async () => {
    const ownOff = await open(ShellComponent, { role: 'admin', off: ['page.attendance'] });
    expect(ownOff.text()).toContain('Attendance by Staff');
    expect(ownOff.text()).not.toContain('My attendance');
    TestBed.resetTestingModule();
    const byStaffOff = await open(ShellComponent, { role: 'admin', off: [KEY] });
    expect(byStaffOff.text()).toContain('My attendance');
    expect(byStaffOff.text()).toContain('Staff attendance');
  });

  it('the existing menu items and their paths are unchanged', () => {
    const find = (nav: typeof ADMIN_NAV, path: string) => nav.find((i) => i.path === path);
    expect(find(ADMIN_NAV, 'attendance')).toMatchObject({ label: 'My attendance', feature: 'page.attendance' });
    expect(find(ADMIN_NAV, 'attendance-log')).toMatchObject({ label: 'Staff attendance', feature: 'page.attendance' });
    expect(find(STAFF_NAV, 'attendance')).toMatchObject({ label: 'Attendance', feature: 'page.attendance' });
    for (const nav of [ADMIN_NAV, STAFF_NAV]) expect(find(nav, 'attendance-by-staff')).toMatchObject({ label: 'Attendance by Staff', feature: KEY });
  });

  /** The route's own guard, run for a signed-in person of this role with this switch state. */
  async function guardFor(role: 'admin' | 'staff', area: 'admin' | 'staff', off: string[], path = 'attendance-by-staff') {
    await open(ShellComponent, { role, off });
    const parent = routes.find((r) => r.path === area) as Route;
    const child = parent.children!.find((c) => c.path === path) as Route;
    expect(child).toBeDefined();
    const guard = child.canActivate![0] as CanActivateFn;
    return TestBed.runInInjectionContext(() => guard({} as never, {} as never));
  }

  it('the route is guarded: direct access with the switch off is sent home, with it on is allowed', async () => {
    for (const [role, area, home] of [['admin', 'admin', '/admin/dashboard'], ['staff', 'staff', '/staff/new-bill']] as const) {
      const on = await guardFor(role, area, []);
      expect(on).toBe(true);
      TestBed.resetTestingModule();
      const off = await guardFor(role, area, [KEY]);
      expect(off).toBeInstanceOf(UrlTree);
      expect(String(off)).toBe(home);
      TestBed.resetTestingModule();
    }
  });

  it('the existing Attendance routes keep their own guard: turning Attendance by Staff off does not block them', async () => {
    const own = await guardFor('staff', 'staff', [KEY], 'attendance');
    expect(own).toBe(true);
    TestBed.resetTestingModule();
    const log = await guardFor('admin', 'admin', [KEY], 'attendance-log');
    expect(log).toBe(true);
    TestBed.resetTestingModule();
    const ownOff = await guardFor('staff', 'staff', ['page.attendance'], 'attendance');
    expect(ownOff).toBeInstanceOf(UrlTree);
    TestBed.resetTestingModule();
    const stillOn = await guardFor('staff', 'staff', ['page.attendance'], 'attendance-by-staff');
    expect(stillOn).toBe(true);
  });
});
