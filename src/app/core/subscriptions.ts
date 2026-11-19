import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { params } from './api';
import { FeatureDef, PageMeta, Paged } from './models';

// Subscription Management: selling ParlourBill to parlours. Everything here is about what a PARLOUR pays the PLATFORM. It is not about the
// bills a parlour raises for its own customers, which live in models.ts / payments.ts and are never mixed with these.
// Names carry "Subscription" (SubscriptionPaymentMethod, not PaymentMethod) so the two can never be confused in code.

const API = environment.apiUrl;
type One<T> = { data: T };
type Many<T> = { data: T[]; meta: PageMeta };
const unwrap = <T>() => map((r: One<T>) => r.data);
const unwrapPage = <T>() => map((r: Many<T>): Paged<T> => ({ items: r.data, meta: r.meta }));

export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'suspended';
export type SubscriptionPaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'card' | 'other';
export type SubscriptionPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface LimitDef { key: string; label: string; description: string }
export interface SubscriptionMeta {
  features: FeatureDef[];
  limits: LimitDef[];
  statuses: SubscriptionStatus[];
  billingCycles: BillingCycle[];
  paymentMethods: SubscriptionPaymentMethod[];
  paymentStatuses: SubscriptionPaymentStatus[];
  paymentTransitions: Record<SubscriptionPaymentStatus, SubscriptionPaymentStatus[]>;
  referenceRequiredMethods: SubscriptionPaymentMethod[];
  expiringSoonDays: number;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  /** null: this plan is not sold yearly. */
  yearlyPrice: number | null;
  /** Every switchable feature: true when the plan includes it. */
  features: Record<string, boolean>;
  /** Every limit: a whole number, or null for "no limit". */
  limits: Record<string, number | null>;
  isActive: boolean;
  subscriberCount: number;
  activeSubscribers: number;
  createdAt: string;
  updatedAt: string;
}
export interface PlanInput {
  code?: string;
  name?: string;
  description?: string | null;
  monthlyPrice?: number;
  yearlyPrice?: number | null;
  features?: Record<string, boolean>;
  limits?: Record<string, number | null>;
  isActive?: boolean;
}

/** One row of "what does this parlour really get": the platform admin's switch, the plan, and the result. */
export interface FeatureBreakdown { key: string; manual: boolean; plan: boolean | null; effective: boolean }
export interface LimitUsage { key: string; label: string; limit: number | null; used: number }

export interface ParlourSubscription {
  id: string;
  parlourId: string;
  parlourName: string;
  /** The effective status: an active subscription whose expiry date has been reached shows as expired. */
  status: SubscriptionStatus;
  plan: { id: string; code: string; name: string; description: string | null; isActive: boolean };
  billingCycle: BillingCycle;
  /** What one period costs this parlour now. */
  price: number;
  /** What the plan would charge for the next period. */
  renewalPrice: number;
  /** 'YYYY-MM-DD'. A subscription is in force up to, but not including, expiresOn. */
  startsOn: string;
  expiresOn: string;
  today: string;
  daysRemaining: number | null;
  daysOverdue: number | null;
  expiringSoon: boolean;
  suspendedFrom: 'pending' | 'active' | null;
  createdAt: string;
  updatedAt: string;
  /** Only on the single-parlour view. */
  entitlements?: { mode: 'unmanaged' | 'plan' | 'lapsed'; features: FeatureBreakdown[]; limits: LimitUsage[]; limitsEnforced: boolean };
  /** Only on the answer to a plan change. */
  change?: { direction: 'upgrade' | 'downgrade' | 'change'; from: string; to: string };
}

export interface SubscriptionPayment {
  id: string;
  parlourId: string;
  parlourName?: string;
  subscriptionId: string;
  planName: string;
  billingCycle: BillingCycle;
  amount: number;
  method: SubscriptionPaymentMethod;
  status: SubscriptionPaymentStatus;
  paymentDate: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  recordedByName: string | null;
  createdAt: string;
  updatedAt: string;
}
/** What the parlour's own admin sees: no notes, no name of who recorded it. */
export interface OwnSubscriptionPayment {
  id: string;
  planName: string;
  billingCycle: BillingCycle;
  amount: number;
  method: SubscriptionPaymentMethod;
  status: SubscriptionPaymentStatus;
  paymentDate: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}
export interface PaymentInput {
  amount: number;
  method: SubscriptionPaymentMethod;
  status?: 'paid' | 'pending';
  paymentDate?: string;
  reference?: string | null;
  notes?: string | null;
}

export type SubscriptionEventType = 'assigned' | 'activated' | 'renewed' | 'plan_changed' | 'suspended' | 'reactivated' | 'expired' | 'payment_recorded' | 'payment_updated';
export interface SubscriptionEvent {
  id: string;
  type: SubscriptionEventType;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus | null;
  planName: string | null;
  fromPlanName: string | null;
  billingCycle: BillingCycle | null;
  oldExpiresOn: string | null;
  newExpiresOn: string | null;
  note: string | null;
  by: string;
  at: string;
  payment: { id: string; amount: number; method: SubscriptionPaymentMethod; status: SubscriptionPaymentStatus } | null;
}

export interface SubscriptionDashboard {
  totalSubscriptions: number;
  byStatus: Record<SubscriptionStatus, number>;
  expiringSoon: { days: number; count: number; items: ParlourSubscription[] };
  monthlyRecurringRevenue: number;
  yearlyRecurringRevenue: number;
  activeByCycle: Record<BillingCycle, number>;
  pendingPayments: { count: number; amount: number };
  parlourWithoutSubscription: number;
  plans: { total: number; active: number };
}

/** What a parlour's admin sees about its own subscription. */
export interface OwnSubscription {
  managed: boolean;
  subscription: null | {
    status: SubscriptionStatus;
    billingCycle: BillingCycle;
    price: number;
    startsOn: string;
    expiresOn: string;
    daysRemaining: number | null;
    daysOverdue: number | null;
    expiringSoon: boolean;
  };
  plan: null | { name: string; description: string | null };
  /** Renewal is done by the provider when they receive payment: there is no automatic renewal and no online payment. */
  renewal: null | { dueOn: string; amount: number; billingCycle: BillingCycle; autoRenews: false; managedBy: 'provider' };
  features: { key: string; label: string; group: 'page' | 'action'; included: boolean; available: boolean; reason: null | 'switched_off' | 'subscription' | 'plan' }[];
  limits: { key: string; label: string; description: string; limit: number | null; used: number; enforced: boolean }[];
  lastPayment: OwnSubscriptionPayment | null;
  pendingPayments: { count: number; amount: number };
}

export interface AssignInput { planId: string; billingCycle: BillingCycle; startNow?: boolean; startDate?: string; payment?: PaymentInput }
export interface ListQuery { status?: SubscriptionStatus; planId?: string; search?: string; expiringWithin?: number; page?: number; limit?: number }
export interface PaymentsQuery { status?: SubscriptionPaymentStatus; method?: SubscriptionPaymentMethod; parlourId?: string; from?: string; to?: string; page?: number; limit?: number }

/** Platform admin only. */
@Injectable({ providedIn: 'root' })
export class SubscriptionsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API}/platform`;
  private readonly sub = (parlourId: string, rest = '') => `${this.url}/parlours/${parlourId}/subscription${rest}`;

  meta(): Observable<SubscriptionMeta> { return this.http.get<One<SubscriptionMeta>>(`${this.url}/subscription-meta`).pipe(unwrap()); }

  // Plans
  plans(active?: boolean): Observable<SubscriptionPlan[]> {
    return this.http.get<One<SubscriptionPlan[]>>(`${this.url}/subscription-plans`, { params: params({ active }) }).pipe(unwrap());
  }
  createPlan(body: PlanInput & { code: string; name: string; monthlyPrice: number }): Observable<SubscriptionPlan> {
    return this.http.post<One<SubscriptionPlan>>(`${this.url}/subscription-plans`, body).pipe(unwrap());
  }
  updatePlan(id: string, body: PlanInput): Observable<SubscriptionPlan> {
    return this.http.patch<One<SubscriptionPlan>>(`${this.url}/subscription-plans/${id}`, body).pipe(unwrap());
  }

  // Across all parlours
  dashboard(): Observable<SubscriptionDashboard> { return this.http.get<One<SubscriptionDashboard>>(`${this.url}/subscriptions/dashboard`).pipe(unwrap()); }
  list(q: ListQuery): Observable<Paged<ParlourSubscription>> {
    return this.http.get<Many<ParlourSubscription>>(`${this.url}/subscriptions`, { params: params({ ...q }) }).pipe(unwrapPage());
  }
  allPayments(q: PaymentsQuery): Observable<Paged<SubscriptionPayment>> {
    return this.http.get<Many<SubscriptionPayment>>(`${this.url}/subscription-payments`, { params: params({ ...q }) }).pipe(unwrapPage());
  }
  updatePayment(id: string, body: { status?: 'paid' | 'failed' | 'refunded'; reference?: string | null; paymentDate?: string; notes?: string | null }): Observable<SubscriptionPayment> {
    return this.http.patch<One<SubscriptionPayment>>(`${this.url}/subscription-payments/${id}`, body).pipe(unwrap());
  }

  // One parlour
  get(parlourId: string): Observable<ParlourSubscription | null> { return this.http.get<One<ParlourSubscription | null>>(this.sub(parlourId)).pipe(unwrap()); }
  assign(parlourId: string, body: AssignInput): Observable<ParlourSubscription> { return this.http.post<One<ParlourSubscription>>(this.sub(parlourId), body).pipe(unwrap()); }
  remove(parlourId: string): Observable<void> { return this.http.delete<void>(this.sub(parlourId)); }
  activate(parlourId: string, body: { startDate?: string; payment?: PaymentInput }): Observable<ParlourSubscription> {
    return this.http.post<One<ParlourSubscription>>(this.sub(parlourId, '/activate'), body).pipe(unwrap());
  }
  renew(parlourId: string, body: { startDate?: string; payment?: PaymentInput }): Observable<ParlourSubscription> {
    return this.http.post<One<ParlourSubscription>>(this.sub(parlourId, '/renew'), body).pipe(unwrap());
  }
  changePlan(parlourId: string, body: { planId: string; billingCycle?: BillingCycle; expiresOn?: string; payment?: PaymentInput }): Observable<ParlourSubscription> {
    return this.http.post<One<ParlourSubscription>>(this.sub(parlourId, '/change-plan'), body).pipe(unwrap());
  }
  suspend(parlourId: string, reason: string): Observable<ParlourSubscription> { return this.http.post<One<ParlourSubscription>>(this.sub(parlourId, '/suspend'), { reason }).pipe(unwrap()); }
  reactivate(parlourId: string, note?: string): Observable<ParlourSubscription> { return this.http.post<One<ParlourSubscription>>(this.sub(parlourId, '/reactivate'), note ? { note } : {}).pipe(unwrap()); }
  history(parlourId: string, page = 1, limit = 20): Observable<Paged<SubscriptionEvent>> {
    return this.http.get<Many<SubscriptionEvent>>(this.sub(parlourId, '/history'), { params: params({ page, limit }) }).pipe(unwrapPage());
  }
  payments(parlourId: string, page = 1, limit = 20): Observable<Paged<SubscriptionPayment>> {
    return this.http.get<Many<SubscriptionPayment>>(this.sub(parlourId, '/payments'), { params: params({ page, limit }) }).pipe(unwrapPage());
  }
  recordPayment(parlourId: string, body: PaymentInput): Observable<SubscriptionPayment> { return this.http.post<One<SubscriptionPayment>>(this.sub(parlourId, '/payments'), body).pipe(unwrap()); }
}

/** A parlour admin's own subscription, read only. The server decides which parlour from the signed-in user. */
@Injectable({ providedIn: 'root' })
export class OwnSubscriptionApi {
  private readonly http = inject(HttpClient);
  get(): Observable<OwnSubscription> { return this.http.get<One<OwnSubscription>>(`${API}/subscription`).pipe(unwrap()); }
  payments(page = 1, limit = 20): Observable<Paged<OwnSubscriptionPayment>> {
    return this.http.get<Many<OwnSubscriptionPayment>>(`${API}/subscription/payments`, { params: params({ page, limit }) }).pipe(unwrapPage());
  }
}

// The words, date text and form rules every screen shares live in subscription-rules.ts (no Angular in it, so it is easy to test).
export * from './subscription-rules';
