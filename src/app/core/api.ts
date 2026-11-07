import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { GeoReading } from './geo-capture';
import { Appointment, AppointmentDay, AppointmentKind, AppointmentQueue, AttendanceRecord, AttendanceSettings, CommissionKind, CommissionLines, CommissionPayout, CommissionReport, CommissionRule, Combo, Customer, DeviceType, FeatureDef, Invoice, InvoiceRow, LocationCheck, Paged, PaymentMethod, Parlour, Performer, PerformerAttendanceReport, PerformerAttendanceRecord, PerformerAttendanceResult, PerformerAttendanceToday, PerformerRecordStatus, PlatformParlour, PlatformSummary, Reminder, ReferralPayout, Referrer, ReferrerLookup, Role, Service, Summary, TeamMember, TodayAttendance } from './models';

const API = environment.apiUrl;

/** Builds query params, skipping empty values. */
export const params = (obj: Record<string, string | number | boolean | null | undefined>): HttpParams => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  return p;
};

type One<T> = { data: T };
type Many<T> = { data: T[]; meta: Paged<T>['meta'] };
const unwrap = <T>() => map((r: One<T>) => r.data);
const unwrapPage = <T>() => map((r: Many<T>): Paged<T> => ({ items: r.data, meta: r.meta }));

@Injectable({ providedIn: 'root' })
export class ParlourApi {
  private readonly http = inject(HttpClient);
  get(): Observable<Parlour> { return this.http.get<One<Parlour>>(`${API}/parlour`).pipe(unwrap()); }
  update(body: Partial<Pick<Parlour, 'name' | 'phone' | 'address' | 'gstNumber' | 'taxPercent' | 'gstPriceMode' | 'invoicePrefix'>>): Observable<Parlour> {
    return this.http.patch<One<Parlour>>(`${API}/parlour`, body).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class ServicesApi {
  private readonly http = inject(HttpClient);
  list(includeInactive = false): Observable<Service[]> {
    return this.http.get<One<Service[]>>(`${API}/services`, { params: params({ includeInactive }) }).pipe(unwrap());
  }
  create(body: { name: string; category: string; price: number; durationMin: number; sacCode?: string | null }): Observable<Service> {
    return this.http.post<One<Service>>(`${API}/services`, body).pipe(unwrap());
  }
  update(id: string, body: Partial<Omit<Service, 'id'>>): Observable<Service> {
    return this.http.patch<One<Service>>(`${API}/services/${id}`, body).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);
  list(q: { search?: string; page?: number; limit?: number }): Observable<Paged<Customer>> {
    return this.http.get<Many<Customer>>(`${API}/customers`, { params: params(q) }).pipe(unwrapPage());
  }
  get(id: string): Observable<Customer> { return this.http.get<One<Customer>>(`${API}/customers/${id}`).pipe(unwrap()); }
  create(body: { name: string; phone: string; email?: string | null; notes?: string | null }): Observable<Customer> {
    return this.http.post<One<Customer>>(`${API}/customers`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; phone?: string; email?: string | null; notes?: string | null }): Observable<Customer> {
    return this.http.patch<One<Customer>>(`${API}/customers/${id}`, body).pipe(unwrap());
  }
}

export interface NewInvoice {
  customerId?: string | null;
  walkInName?: string;
  /** Each line is one service or one combo. */
  items: { serviceId?: string; comboId?: string; /** Who performed this line (a person from the Performers list). Left out when nobody is chosen. */ performedBy?: string; quantity: number }[];
  referrerId?: string | null;
  discount: number;
  /** How it was paid: EITHER paymentMethod (the whole bill by one method) OR payments (amounts in rupees that add up to the total). */
  paymentMethod?: PaymentMethod;
  payments?: { method: PaymentMethod; amount: number }[];
  /** Extra money for the staff, in rupees. Left out when there is none. Not part of the total. */
  tip?: number;
  notes?: string;
  /** Billing a visit from the Appointments page: the visit is closed by this bill. Left out for an ordinary bill. */
  appointmentId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private readonly http = inject(HttpClient);
  /** Send an idempotencyKey (one per bill attempt) so a repeat of the same request returns the same bill, never a second one. */
  create(body: NewInvoice, idempotencyKey?: string): Observable<Invoice> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined;
    return this.http.post<One<Invoice>>(`${API}/invoices`, body, { headers }).pipe(unwrap());
  }
  list(q: { page?: number; limit?: number; from?: string; to?: string; status?: string; search?: string; createdBy?: string }): Observable<Paged<InvoiceRow>> {
    return this.http.get<Many<InvoiceRow>>(`${API}/invoices`, { params: params(q) }).pipe(unwrapPage());
  }
  get(id: string): Observable<Invoice> { return this.http.get<One<Invoice>>(`${API}/invoices/${id}`).pipe(unwrap()); }
  /** A ready-to-open WhatsApp link for this bill. Pass a number for walk-ins, who have none saved. */
  whatsapp(id: string, phone?: string): Observable<{ url: string; message: string; phone: string }> {
    return this.http.get<One<{ url: string; message: string; phone: string }>>(`${API}/invoices/${id}/whatsapp`, { params: params({ phone }) }).pipe(unwrap());
  }
  /** Admin only: everyone who has made at least one bill, for the "made by" filter. */
  makers(): Observable<{ id: string; name: string }[]> { return this.http.get<One<{ id: string; name: string }[]>>(`${API}/invoices/makers`).pipe(unwrap()); }
  void(id: string, reason: string): Observable<Invoice> { return this.http.post<One<Invoice>>(`${API}/invoices/${id}/void`, { reason }).pipe(unwrap()); }
}

@Injectable({ providedIn: 'root' })
export class StaffApi {
  private readonly http = inject(HttpClient);
  list(): Observable<TeamMember[]> { return this.http.get<One<TeamMember[]>>(`${API}/staff`).pipe(unwrap()); }
  create(body: { name: string; email?: string; mobile: string; password: string; role: Role }): Observable<TeamMember> {
    return this.http.post<One<TeamMember>>(`${API}/staff`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; mobile?: string; role?: Role; isActive?: boolean }): Observable<TeamMember> {
    return this.http.patch<One<TeamMember>>(`${API}/staff/${id}`, body).pipe(unwrap());
  }
  resetPassword(id: string, password: string): Observable<void> { return this.http.post<void>(`${API}/staff/${id}/reset-password`, { password }); }
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  summary(from?: string, to?: string): Observable<Summary> { return this.http.get<One<Summary>>(`${API}/reports/summary`, { params: params({ from, to }) }).pipe(unwrap()); }
  myDay(): Observable<{ invoices: number; revenue: number }> { return this.http.get<One<{ invoices: number; revenue: number }>>(`${API}/reports/my-day`).pipe(unwrap()); }
}

/** Platform admin only. */
@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API}/platform`;

  features(): Observable<FeatureDef[]> { return this.http.get<One<FeatureDef[]>>(`${this.url}/features`).pipe(unwrap()); }
  summary(): Observable<PlatformSummary> { return this.http.get<One<PlatformSummary>>(`${this.url}/summary`).pipe(unwrap()); }
  list(q: { search?: string; page?: number; limit?: number }): Observable<Paged<PlatformParlour>> {
    return this.http.get<Many<PlatformParlour>>(`${this.url}/parlours`, { params: params(q) }).pipe(unwrapPage());
  }
  get(id: string): Observable<PlatformParlour> { return this.http.get<One<PlatformParlour>>(`${this.url}/parlours/${id}`).pipe(unwrap()); }
  create(body: { parlourName: string; adminName: string; email: string; password: string; features?: Record<string, boolean> }): Observable<PlatformParlour> {
    return this.http.post<One<PlatformParlour>>(`${this.url}/parlours`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; status?: 'active' | 'suspended'; features?: Record<string, boolean> }): Observable<PlatformParlour> {
    return this.http.patch<One<PlatformParlour>>(`${this.url}/parlours/${id}`, body).pipe(unwrap());
  }
  updateOwner(id: string, body: { name?: string; email?: string }): Observable<PlatformParlour> {
    return this.http.patch<One<PlatformParlour>>(`${this.url}/parlours/${id}/owner`, body).pipe(unwrap());
  }
  resetOwnerPassword(id: string, password: string): Observable<void> { return this.http.post<void>(`${this.url}/parlours/${id}/owner/reset-password`, { password }); }
  remove(id: string, confirmName: string): Observable<void> { return this.http.delete<void>(`${this.url}/parlours/${id}`, { body: { confirmName } }); }
}

@Injectable({ providedIn: 'root' })
export class CombosApi {
  private readonly http = inject(HttpClient);
  list(includeInactive = false): Observable<Combo[]> { return this.http.get<One<Combo[]>>(`${API}/combos`, { params: params({ includeInactive }) }).pipe(unwrap()); }
  create(body: { name: string; price: number; items: { serviceId: string; quantity: number }[] }): Observable<Combo> {
    return this.http.post<One<Combo>>(`${API}/combos`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; price?: number; items?: { serviceId: string; quantity: number }[]; isActive?: boolean }): Observable<Combo> {
    return this.http.patch<One<Combo>>(`${API}/combos/${id}`, body).pipe(unwrap());
  }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${API}/combos/${id}`); }
}

@Injectable({ providedIn: 'root' })
export class ReferrersApi {
  private readonly http = inject(HttpClient);
  list(q: { search?: string; page?: number; limit?: number }): Observable<Paged<Referrer>> {
    return this.http.get<Many<Referrer>>(`${API}/referrers`, { params: params(q) }).pipe(unwrapPage());
  }
  /** For the billing counter: active referrers matching a name or ID. */
  lookup(q: string): Observable<ReferrerLookup[]> { return this.http.get<One<ReferrerLookup[]>>(`${API}/referrers/lookup`, { params: params({ q }) }).pipe(unwrap()); }
  get(id: string): Observable<Referrer> { return this.http.get<One<Referrer>>(`${API}/referrers/${id}`).pipe(unwrap()); }
  create(body: { name: string; contact: string; percent: number }): Observable<Referrer> { return this.http.post<One<Referrer>>(`${API}/referrers`, body).pipe(unwrap()); }
  update(id: string, body: { name?: string; contact?: string; percent?: number; isActive?: boolean }): Observable<Referrer> {
    return this.http.patch<One<Referrer>>(`${API}/referrers/${id}`, body).pipe(unwrap());
  }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${API}/referrers/${id}`); }
  /** Records that the referrer has been paid what they are owed. `expectedAmount` is what the admin saw: if it is no longer exactly that, nothing is paid. */
  pay(id: string, expectedAmount: number): Observable<ReferralPayout> {
    return this.http.post<One<ReferralPayout>>(`${API}/referrers/${id}/pay`, { expectedAmount }).pipe(unwrap());
  }
}

/** The people who perform services. Names only: they do not sign in. */
@Injectable({ providedIn: 'root' })
export class PerformersApi {
  private readonly http = inject(HttpClient);
  /** The billing counter reads the active ones. Only an admin gets the inactive ones, with how often each has been used. */
  list(includeInactive = false): Observable<Performer[]> { return this.http.get<One<Performer[]>>(`${API}/performers`, { params: params({ includeInactive }) }).pipe(unwrap()); }
  create(name: string): Observable<Performer> { return this.http.post<One<Performer>>(`${API}/performers`, { name }).pipe(unwrap()); }
  update(id: string, body: { name?: string; isActive?: boolean }): Observable<Performer> { return this.http.patch<One<Performer>>(`${API}/performers/${id}`, body).pipe(unwrap()); }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${API}/performers/${id}`); }
}

/** Commission: what each person has earned, the rules, and recording that they were paid. Admin only. */
@Injectable({ providedIn: 'root' })
export class CommissionsApi {
  private readonly http = inject(HttpClient);
  report(range: { from?: string; to?: string }): Observable<CommissionReport> { return this.http.get<One<CommissionReport>>(`${API}/commissions`, { params: params(range) }).pipe(unwrap()); }
  /** The bill lines behind one person's numbers, so they can be checked before paying. */
  lines(performerId: string, range: { from?: string; to?: string }): Observable<CommissionLines> {
    return this.http.get<One<CommissionLines>>(`${API}/commissions/performers/${performerId}/lines`, { params: params(range) }).pipe(unwrap());
  }
  payouts(): Observable<CommissionPayout[]> { return this.http.get<One<CommissionPayout[]>>(`${API}/commissions/payouts`).pipe(unwrap()); }
  /** Pays out what one person is owed in these days. `expectedAmount` is what the admin saw: if it is no longer exactly that, nothing is paid. */
  pay(body: { performerId: string; from: string; to: string; expectedAmount: number }): Observable<CommissionPayout> {
    return this.http.post<One<CommissionPayout>>(`${API}/commissions/pay`, body).pipe(unwrap());
  }
  rules(): Observable<CommissionRule[]> { return this.http.get<One<CommissionRule[]>>(`${API}/commissions/rules`).pipe(unwrap()); }
  /** Sets the rule for ONE person or ONE service (adds it, or replaces the one they have). Applies to future bills only. */
  setRule(body: { performerId?: string; serviceId?: string; kind: CommissionKind; value: number }): Observable<CommissionRule> {
    return this.http.put<One<CommissionRule>>(`${API}/commissions/rules`, body).pipe(unwrap());
  }
  removeRule(id: string): Observable<void> { return this.http.delete<void>(`${API}/commissions/rules/${id}`); }
}

/** What a check-in or check-out sends: the GPS reading, which kind of device, and (on a shared one) the person's password. */
export interface AttendanceAction extends GeoReading { deviceType: DeviceType; password?: string }

@Injectable({ providedIn: 'root' })
export class AttendanceApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API}/attendance`;

  today(): Observable<TodayAttendance> { return this.http.get<One<TodayAttendance>>(`${this.url}/today`).pipe(unwrap()); }
  /** The server measures the distance (Haversine) and says whether this reading would be accepted. Records nothing. */
  locationCheck(reading: GeoReading): Observable<LocationCheck> { return this.http.post<One<LocationCheck>>(`${this.url}/location-check`, reading).pipe(unwrap()); }
  checkIn(body: AttendanceAction): Observable<TodayAttendance> { return this.http.post<One<TodayAttendance>>(`${this.url}/check-in`, body).pipe(unwrap()); }
  checkOut(body: AttendanceAction): Observable<TodayAttendance> { return this.http.post<One<TodayAttendance>>(`${this.url}/check-out`, body).pipe(unwrap()); }

  /** Admin only. */
  settings(): Observable<AttendanceSettings> { return this.http.get<One<AttendanceSettings>>(`${this.url}/settings`).pipe(unwrap()); }
  saveSettings(body: { latitude: number; longitude: number; radiusM?: number; maxAccuracyM?: number }): Observable<AttendanceSettings> {
    return this.http.put<One<AttendanceSettings>>(`${this.url}/settings`, body).pipe(unwrap());
  }
  records(q: { from?: string; to?: string; userId?: string; page?: number; limit?: number }): Observable<Paged<AttendanceRecord>> {
    return this.http.get<Many<AttendanceRecord>>(`${this.url}/records`, { params: params(q) }).pipe(unwrapPage());
  }
}

/**
 * Attendance by Staff: a signed-in admin or staff member records check-in and check-out for performers, who do not sign in.
 * Only the performer is sent: who is recording, which parlour, the date and the time are all decided by the server.
 */
@Injectable({ providedIn: 'root' })
export class PerformerAttendanceApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API}/performer-attendance`;

  today(): Observable<PerformerAttendanceToday> { return this.http.get<One<PerformerAttendanceToday>>(`${this.url}/today`).pipe(unwrap()); }
  checkIn(performerId: string): Observable<PerformerAttendanceResult> { return this.http.post<One<PerformerAttendanceResult>>(`${this.url}/check-in`, { performerId }).pipe(unwrap()); }
  checkOut(performerId: string): Observable<PerformerAttendanceResult> { return this.http.post<One<PerformerAttendanceResult>>(`${this.url}/check-out`, { performerId }).pipe(unwrap()); }
  /** An admin gets every record; staff get the ones they recorded themselves. */
  history(q: { from?: string; to?: string; performerId?: string; status?: PerformerRecordStatus | ''; page?: number; limit?: number }): Observable<Paged<PerformerAttendanceRecord>> {
    return this.http.get<Many<PerformerAttendanceRecord>>(`${this.url}/history`, { params: params(q) }).pipe(unwrapPage());
  }
  /** Admin only. */
  report(q: { from?: string; to?: string; performerId?: string }): Observable<PerformerAttendanceReport> {
    return this.http.get<One<PerformerAttendanceReport>>(`${this.url}/report`, { params: params(q) }).pipe(unwrap());
  }
}

/** What is sent to book a visit or add a walk-in. A booking says when (date and time on the parlour's clock); a walk-in never does. */
export interface NewAppointment {
  kind: AppointmentKind;
  date?: string;
  time?: string;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string | null;
  performerId?: string | null;
  items: { serviceId: string; quantity: number }[];
  durationMin?: number;
  notes?: string | null;
  /** Set only after the person has seen "already has someone at that time" and chosen to book anyway. */
  allowOverlap?: boolean;
}
/** Only what changed is sent. */
export type AppointmentChanges = Partial<Omit<NewAppointment, 'kind'>>;

/** The parlour's calendar and walk-in queue, shared by admin and staff. */
@Injectable({ providedIn: 'root' })
export class AppointmentsApi {
  private readonly http = inject(HttpClient);
  /** One day. Leave the date out for the parlour's today. */
  day(date?: string): Observable<AppointmentDay> { return this.http.get<One<AppointmentDay>>(`${API}/appointments`, { params: params({ date }) }).pipe(unwrap()); }
  queue(): Observable<AppointmentQueue> { return this.http.get<One<AppointmentQueue>>(`${API}/appointments/queue`).pipe(unwrap()); }
  get(id: string): Observable<Appointment> { return this.http.get<One<Appointment>>(`${API}/appointments/${id}`).pipe(unwrap()); }
  create(body: NewAppointment): Observable<Appointment> { return this.http.post<One<Appointment>>(`${API}/appointments`, body).pipe(unwrap()); }
  update(id: string, body: AppointmentChanges): Observable<Appointment> { return this.http.patch<One<Appointment>>(`${API}/appointments/${id}`, body).pipe(unwrap()); }
  /** The customer is here and the work begins. */
  start(id: string, body: { performerId?: string; allowOverlap?: boolean }): Observable<Appointment> { return this.http.post<One<Appointment>>(`${API}/appointments/${id}/start`, body).pipe(unwrap()); }
  cancel(id: string, reason?: string): Observable<Appointment> { return this.http.post<One<Appointment>>(`${API}/appointments/${id}/cancel`, reason ? { reason } : {}).pipe(unwrap()); }
  noShow(id: string): Observable<Appointment> { return this.http.post<One<Appointment>>(`${API}/appointments/${id}/no-show`, {}).pipe(unwrap()); }
  /** The reminder as a WhatsApp link. Pass a number when the visit has none saved. Building it records nothing. */
  reminder(id: string, phone?: string): Observable<Reminder> { return this.http.get<One<Reminder>>(`${API}/appointments/${id}/reminder`, { params: params({ phone }) }).pipe(unwrap()); }
  /** Records that someone opened the reminder. */
  reminded(id: string): Observable<Appointment> { return this.http.post<One<Appointment>>(`${API}/appointments/${id}/reminded`, {}).pipe(unwrap()); }
}
