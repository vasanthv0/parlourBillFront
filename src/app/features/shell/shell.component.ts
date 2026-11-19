import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { navFor } from '../../core/nav';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: ` <a class="skip" href="#main">Skip to content</a>
    <div class="shell">
      <header class="topbar no-print">
        <button
          type="button"
          class="btn btn-ghost btn-icon"
          aria-label="Open menu"
          (click)="open.set(true)"
        >
          <app-icon name="menu" [size]="22" />
        </button>
        <span class="brand-name">{{ appName }}</span>
      </header>
      @if (open()) {
        <div class="scrim" (click)="open.set(false)"></div>
      }

      <aside class="sidebar no-print" [class.open]="open()">
        <a
          class="brand"
          [routerLink]="auth.homePath()"
          (click)="open.set(false)"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="#B0245C" />
            <path
              d="M7 5h10v14l-2-1.5-1.5 1.5L12 17.5 10.5 19 9 17.5 7 19z"
              fill="#fff"
            />
          </svg>
          <span>{{ appName }}</span>
        </a>
        @if (auth.role() === 'super_admin') {
          <span class="pill"
            ><app-icon name="shield" [size]="14" /> Platform admin</span
          >
        }

        <nav aria-label="Main">
          @for (item of nav(); track item.path) {
            <a
              [routerLink]="base() + '/' + item.path"
              routerLinkActive="active"
              (click)="open.set(false)"
            >
              <app-icon [name]="item.icon" /> {{ item.label }}
            </a>
          }
        </nav>

        <div class="who">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who-text">
            <div class="who-name">{{ auth.user()?.name }}</div>
            <div class="who-role">{{ roleLabel() }}</div>
          </div>
        </div>
        <div class="who-actions">
          <a
            [routerLink]="base() + '/account'"
            routerLinkActive="active"
            (click)="open.set(false)"
            ><app-icon name="key" [size]="16" /> Account</a
          >
          <button type="button" (click)="auth.logout()">
            <app-icon name="logout" [size]="16" /> Sign out
          </button>
        </div>
      </aside>

      <main class="main" id="main">
        @if (notice(); as n) {
          <div class="sub-notice no-print" [class.bad]="n.bad" role="status">
            <app-icon name="alert" [size]="16" />
            <span class="grow">{{ n.text }}</span>
            <a [routerLink]="base() + '/subscription'">View subscription</a>
          </div>
        }
        <router-outlet />
      </main>
    </div>`,
  styles: [
    `
      .skip {
        position: absolute;
        left: -999px;
        top: 8px;
        z-index: 200;
        background: #fff;
        padding: 8px 12px;
        border-radius: 6px;
        &:focus {
          left: 8px;
        }
      }
      .shell {
        display: grid;
        grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
        min-height: 100dvh;
      }
      .main {
        min-width: 0;
      }
      .topbar {
        display: none;
      }
      .scrim {
        display: none;
      }
      .sub-notice {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding: 10px 24px;
        background: var(--amber-tint);
        color: var(--amber);
        border-bottom: 1px solid var(--line);
        font-size: 14px;
        font-weight: 550;
      }
      .sub-notice.bad {
        background: var(--brick-tint);
        color: var(--brick);
      }
      .sub-notice a {
        color: inherit;
        text-decoration: underline;
        white-space: nowrap;
      }
      .grow {
        flex: 1 1 240px;
      }

      .sidebar {
        background: var(--plum);
        color: var(--plum-text);
        display: flex;
        flex-direction: column;
        padding: 20px 14px 16px;
        position: sticky;
        top: 0;
        height: 100dvh;
        overflow-y: auto;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        align-self: flex-start;
        margin: -10px 8px 18px;
        padding: 3px 10px;
        border-radius: 999px;
        background: rgba(224, 86, 141, 0.18);
        color: #f3b3cd;
        font-size: 12.5px;
        font-weight: 600;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 2px 8px 22px;
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 20px;
        letter-spacing: -0.01em;
        color: #fff;
        text-decoration: none;
        &:hover {
          color: #fff;
        }
      }
      nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      nav a,
      .who-actions a,
      .who-actions button {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        color: var(--plum-text);
        text-decoration: none;
        font-weight: 550;
        font-size: 14.5px;
        background: none;
        border: 0;
        width: 100%;
        text-align: left;
        &:hover {
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
        }
        &.active {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
        &.active::before {
          content: '';
          position: absolute;
          left: -14px;
          top: 8px;
          bottom: 8px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: #e0568d;
        }
      }
      .who {
        margin-top: auto;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 8px 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .avatar {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: var(--plum-2);
        display: grid;
        place-items: center;
        font-weight: 700;
        font-size: 13px;
        color: #fff;
        flex: none;
      }
      .who-text {
        min-width: 0;
      }
      .who-name {
        font-weight: 600;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .who-role {
        font-size: 12.5px;
        color: var(--plum-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .who-actions {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 6px;
        a,
        button {
          padding: 8px 12px;
          font-size: 13.5px;
          font-weight: 500;
          color: var(--plum-muted);
        }
      }

      @media (max-width: 899px) {
        .shell {
          grid-template-columns: minmax(0, 1fr);
        }
        .topbar {
          display: flex;
          align-items: center;
          gap: 8px;
          position: sticky;
          top: 0;
          z-index: 30;
          height: 56px;
          padding: 0 12px;
          background: var(--plum);
          color: #fff;
        }
        .brand-name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 18px;
        }
        .topbar .btn-ghost {
          color: #fff;
          &:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }
        }
        .sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          width: min(290px, 86vw);
          z-index: 50;
          transform: translateX(-100%);
          transition: transform 0.2s ease;
          &.open {
            transform: none;
          }
        }
        .scrim {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 40;
          background: rgba(36, 26, 39, 0.5);
        }
        nav a.active::before {
          left: -14px;
        }
      }
    `,
  ],
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly appName = environment.appName;
  protected readonly open = signal(false);
  protected readonly base = computed(() => this.auth.basePath());
  // Sidebar items the platform admin switched off for this parlour simply do not appear.
  protected readonly nav = computed(() =>
    navFor(this.auth.role()).filter(
      (i) => !i.feature || this.auth.hasFeature(i.feature),
    ),
  );
  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    if (role === 'super_admin') return 'Platform admin';
    return `${role === 'admin' ? 'Admin' : 'Staff'} · ${this.auth.user()?.parlourName ?? ''}`;
  });
  /**
   * A line for the parlour's ADMIN when the subscription needs attention: it is waiting to be activated, has ended or been suspended (only
   * billing works until then), or is about to end. Nothing is shown while all is well, to staff, or to a parlour with no subscription.
   * It is only a notice: what the parlour may actually use is decided by the server.
   */

  protected readonly notice = computed<{ text: string; bad: boolean } | null>(
    () => {
      const u = this.auth.user();
      const s = u?.role === 'admin' ? u.subscription : null;

      if (!s) return null;

      const subscription = s.subscription;
      const planName = s.plan?.name ?? 'Your';

      if (!subscription) return null;

      if (subscription.status === 'expired') {
        return {
          bad: true,
          text: `Your ${planName} subscription has ended. Only billing is available until it is renewed.`,
        };
      }

      if (subscription.status === 'suspended') {
        return {
          bad: true,
          text: `Your ${planName} subscription is suspended. Only billing is available until it is reactivated.`,
        };
      }

      if (subscription.status === 'pending') {
        return {
          bad: false,
          text: `Your ${planName} subscription has not been activated yet. Only billing is available until it is.`,
        };
      }

      if (subscription.expiringSoon) {
        const daysRemaining = subscription.daysRemaining;
        const when =
          daysRemaining === 0
            ? 'today'
            : daysRemaining === 1
              ? 'tomorrow'
              : `in ${daysRemaining ?? 'a few'} days`;

        return {
          bad: false,
          text: `Your ${planName} subscription ends ${when}. Contact your provider to renew it.`,
        };
      }

      return null;
    },
  );

  protected readonly initials = computed(() =>
    (this.auth.user()?.name ?? '?')
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
  );

  constructor() {
    // Close the mobile drawer whenever the route changes.
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe(() => this.open.set(false));
  }
}
