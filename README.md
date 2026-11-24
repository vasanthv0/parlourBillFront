# Parlour billing web app

Angular 19, standalone components and signals. No UI framework: the design system is in `src/styles/`.

```bash
npm install
npm start        # http://localhost:4200 (uses environment.development.ts)
npm run build    # production bundle in dist/parlourbill/browser
```

## Configure

- `src/environments/environment.development.ts`: API URL for local work (default `http://localhost:3000/api/v1`).
- `src/environments/environment.ts`: **set `apiUrl` to your deployed API** before a production build. `appName` is the product name shown in the UI, so change it in both files to rename it.

## Structure

```
src/styles/           tokens (colours, type, radii), base, components, print
src/app/core/         auth service, interceptor, guards, nav definitions, API clients, models
src/app/shared/       icon, modal, toast, money pipe
src/app/features/
  auth/               sign in (there is no sign-up)
  shell/              sidebar layout; navigation differs by role and by the parlour's switches
  superadmin/         parlour list, create parlour, per-parlour management and switchboard; Subscriptions overview, Plans, Plan payments, and the Subscription panel on each parlour's page
  admin/              dashboard, services, combos, referrals (list, form, detail, mark as paid), performers, commissions, team, settings, My subscription (read only)
  shared/             new bill (services, combos, referral), bills (with Made by filter for admins), bill view/print/WhatsApp, customers, account
```

## How sign-in works

The access token lives in memory only. On page load the app silently calls `/auth/refresh` (the browser sends the `httpOnly` cookie) to restore the session. If a request returns "token expired", the interceptor refreshes once, even when several requests fail together, and replays them. If refreshing fails, the person is sent to sign in and returned to where they were.

**Email or mobile number.** The sign-in box takes either one and sends it as a single `identifier` (the API tells which it is). The browser only checks the shape (an `@` means an email; anything else must be a mobile number with at least 10 digits, `core/identifier.ts`); the server decides. Staff can be added on the Team page with a mobile number and no email (an admin needs an email), and the Team list and Account page show the number for them. Deploy the API before this version of the web app: the API still accepts the old `email` field, but an old API does not know `identifier`.

Route guards send each role to its own area: the platform admin to `/superadmin/*`, parlour admins to `/admin/*`, staff to `/staff/*`. Opening another role's URL redirects you home. The API enforces the same rules independently.

## Page and button switches

The sign-in response carries what the parlour is allowed to use. `core/nav.ts` lists the sidebar items and which switch each needs; the shell filters it, `featureGuard` blocks the address, and buttons check `auth.hasFeature('action.team.add')`. If the platform admin switches something off while a page is open, the API refuses with `FEATURE_DISABLED` and the interceptor reloads the profile so the sidebar and buttons update. The list of switches itself lives on the API (`features.js`) and the superadmin screen reads it from there.

## Subscriptions

What a parlour pays the platform for ParlourBill, entered by hand by the platform admin (no payment gateway, nothing collected online, nothing marked paid automatically; not the bills a parlour makes for its customers). The platform admin has **Subscriptions** (totals, recurring revenue, who is about to lapse, a filterable list), **Plans** (create, edit, activate or deactivate; prices; which pages a plan includes; usage limits) and **Plan payments** (every payment, to chase what is pending), and each parlour's page has a **Subscription** panel: give a plan, activate, renew, change plan, suspend, reactivate, remove, record payments, the history, and a table of *your switch / the plan / the result* for every page. A parlour's admin has **My subscription** (read only: plan, dates, days left, renewal information, what is included, limits and usage, payment history); it is never behind a switch or a plan, and staff do not get it. The sidebar and buttons follow the plan as well as the platform admin's switches, and the admin gets a notice when the subscription is about to end, has ended, is suspended or is waiting to be activated. All of this is only what the screen shows: the server decides and refuses (`FEATURE_DISABLED`, `PLAN_FEATURE_UNAVAILABLE`, `SUBSCRIPTION_INACTIVE`, `PLAN_LIMIT_REACHED`), and any of the first three refreshes the sidebar (`core/errors.ts`, `ACCESS_REFUSED`). The API client and types are in `core/subscriptions.ts`; the words, date text, which buttons a status gets and the payment form's checks are in `core/subscription-rules.ts` (no Angular in it, so it is tested on its own).

## Tests

```bash
npm test
```

Runs in a simulated browser (Jest with jsdom), so it needs no Chrome. `src/app/render.spec.ts` signs in as each kind of user with realistic API responses, opens **every page** (with data, and empty), clicks through the add forms (including the customer phone rule: at least 10 digits), runs the billing maths (the ₹892.50 example, with the CGST/SGST split, and with GST inside the price), the GST price setting and SAC field, how old and new bills print, the safe-retry key on the billing screen, the WhatsApp button, the Made-by filter, and checks that each switch shows or hides the right button. `src/app/core/gst.spec.ts` checks the GST arithmetic against the same worked examples as the API's tests. `src/app/core/idempotency.spec.ts` covers the key helper, which has to work where `crypto.randomUUID` does not exist. It exists because some mistakes (for example calling `inject()` from a template) compile fine and only fail when a page renders. The Angular Jest builder is still marked experimental by Angular.

The Performers and Commissions pages are covered there too: adding and renaming people, the rules form, "Show bills", "Mark as paid" (and the amount-changed case), "Performed by" on the billing screen and what it sends, sales by performer on the dashboard, and the referral "Mark as paid".

Attendance by Staff is covered in `src/app/attendance-by-staff.spec.ts`: the performer list and each status, what check-in and check-out send (only the performer: no user, parlour, date or time), that a double click sends one request, the server's refusals and a network failure, the history filters, that staff never ask for the admin report, the sidebar item showing and hiding with its switch (and independently of the Attendance one), and the route guard sending a direct visit home when it is off.

Sign in with a mobile number is covered in `render.spec.ts` (what the box sends, what it refuses without calling the server, how a wrong password and a server message show) and `core/identifier.spec.ts` (the shape checks). The Team page tests cover adding staff with no email, an admin needing one, the 10-digit rule for a new number, and an older member's shorter number not being sent back when only the name changes.

> **Build and test status (Angular CLI 19.2.27, Node 22):** `ng build` compiles with `strictTemplates` and no errors, and `ng test` passes in full (11 suites, 456 tests), including `render.spec.ts`, `attendance.spec.ts` and `subscriptions.spec.ts`; `ng test --aot` gives the same result. The production build downloads and inlines the Google Fonts named in `src/index.html`, so it needs internet access.

The Appointments page is covered in `render.spec.ts` (columns per person, the queue, the buttons following each switch, booking, the "already has someone then" confirmation, reminders, and billing a visit from the billing screen) and `core/appointments.spec.ts` (dates, columns, form checks). The hour grid, the person filter and the three-part walk-in board have their own blocks at the end of `render.spec.ts` ("filter by person, the hour grid, and the walk-in board"), and their logic is in `core/appointments.spec.ts` (`filterColumns`, `slotRows`, `placeCells`: pure functions that need no Angular).

Subscriptions are covered in `src/app/subscriptions.spec.ts` (every new screen with data and empty, creating and editing a plan, the filters, marking a payment received, renewing with and without a payment, the reference rule, the sidebar and the notice, and the interceptor's refresh) and `core/subscription-rules.spec.ts`. The harness has the new endpoints; the existing parlour page tests need them because that page now embeds the panel.

When you add a page, add it to the `PAGES` list in that file; sample API responses live in `src/app/testing/harness.ts`.

> **Task 4 test status.** `ng build` (strict templates, also the production configuration) compiles with no errors, and `ng test` runs 533 tests: 482 pass, including 40 new ones in `render.spec.ts` (sharing a service, the compulsory performer, tip sharing, the rule list, history, the "which rule applies?" explanation, the tips panel, the Settings switch and the invoice) and 15 in `core/allocation.spec.ts`; before Task 4 it was 478 tests with the same 51 failing. The **51 that fail** (`subscriptions.spec.ts` and a few in `render.spec.ts` that open the platform admin's parlour page) already failed before Task 4 and still fail for the same reason: the hand-off's `testing/harness.ts` has no sample responses for `GET /subscription`, `/platform/subscription-meta`, `/platform/subscription-plans` and `/platform/parlours/:id/subscription`. Task 4 did not touch them. The status paragraph above describes the earlier Task 2 state.

## Appointments page notes

**The day is a grid of hours.** One row for each hour from 09:00 to 20:00 (more, if a visit falls outside), one column for each person, and a column for visits with nobody chosen. A visit sits in the hour it *starts* in, read from the `time` the server wrote down on the parlour's own clock (never the browser's). An hour where someone is still busy with a visit that began earlier is shaded. Cells are placed with explicit `grid-row` / `grid-column`, so the page is read, and tabbed through, one person at a time, top to bottom. The logic is `slotRows` and `placeCells` in `core/appointments.ts`.

**Filter by person** (the box in the date bar, shown when there is more than one column) keeps only that person's column. A choice that matches nobody on the day being shown (you moved to a day they have no visits, or they were deactivated) falls back to everyone rather than an empty calendar. On a phone it is the quickest way to see one person's day.

**The walk-in board** (second tab) has three lists: *Waiting* (in order, with a place in line), *In service* and *Completed today*. A walk-in is billed from any open state with **Bill this visit**, which opens the billing screen for it. The last two lists are missing from an older API: the page treats them as empty.

A visit whose bill was voided later reads "(voided)" and stays on record as billed.

## Billing screen notes

**Saving is safe to retry.** Each distinct bill gets one `Idempotency-Key` (a UUID, sent as a header, never in the body). If a save times out or the connection drops, the server may already have made the bill; tapping Save again on the same unchanged bill sends the same key, so the API returns that bill instead of making a second one. Change anything on the bill and it gets a new key. Opening the screen afresh starts with no keys. See "Safe retries" in the API README.

The cart holds two kinds of line, keyed `s:<serviceId>` and `c:<comboId>`. Totals are worked out in whole paise in the same order as the API (subtotal, referral discount, extra discount, GST), by `src/app/core/gst.ts`, which is a line-for-line copy of the API's `gst.js`. It follows the parlour's "prices include GST" setting and shows the taxable value, CGST and SGST, so the total on screen is the total that is saved. The server works the bill out again when it is saved; the app sends only what the counter chose, never a tax or a total. The WhatsApp button opens a blank window inside the click (so pop-up blockers allow it) and points it at the link the API returns.

**Paying.** One method is a row of three buttons, as before, and is sent as `paymentMethod`. **Split payment** (switch `action.payments.split`) swaps it for one amount box per method; the whole bill starts on the method already chosen, **Rest** puts whatever is left in a box, and Save stays off until the boxes add up to the total to the paisa. Amounts are read as text into whole paise by `src/app/core/payments.ts` (never floating point), mirroring the API's `payments.js`; the server checks again against a total it works out itself. Only the methods used are sent, as `payments`. The **Tip** box (switch `action.payments.tip`) is sent as `tip` when above 0, is never part of the total, and takes no part in the amounts adding up. A bill of ₹0 has nothing to split. A saved bill shows `Paid by UPI` as before, or each method with its amount, and any tip apart from the total; the dashboard shows tips collected apart from takings.

**Billing a visit.** Opened as `/new-bill?appointmentId=…` (the Appointments page does this). The screen loads that visit, fills in its services, person and customer, shows a note with **Not this visit**, and sends `appointmentId` with the bill. If the visit was billed or cancelled by someone else meanwhile, the server refuses, the note disappears and the next Save is an ordinary bill. A visit never carries a price.

**Sharing a service between people (Task 4).** Next to a line's "Performed by" choice there is a **Share** button (shown when the parlour has two or more active people). It opens one row per person with a percentage; it starts at 50% / 50% with the person already chosen kept, **Split equally** shares evenly to the hundredth (the spare goes to the first person), and a line shows how much is still to share or too much. Save stays off until every line's percentages add up to exactly 100, so the screen says "ready" exactly when the server will accept it. The rules are in `src/app/core/allocation.ts` (hundredths of a percent as whole numbers; a mirror of the API's `allocation.js`, with `core/allocation.spec.ts`). A shared line is sent as `performers: [{ performerId, percent }]`, a one-person line as `performedBy` as before, never both. Taking people off down to one puts it back to one person.

**The performer made compulsory.** When the parlour setting (Settings page, **Every service on a bill must say who performed it**) is on and the Performers page is on, a line with nobody chosen is marked, the lines missing someone are named under the bill, and Save stays off. Discount, GST and tip are never asked about. The server checks too (`PERFORMER_REQUIRED`).

**Sharing a tip.** With a tip typed (and the Tip box and the Performers page on), **Share the tip** appears: *Not shared* (default: the bill is sent exactly as before), *By amount* or *By percentage*. It starts with the people on the bill, equally; **Split equally** shares down to the paisa; the status says "₹150 still to share", "₹1 too much" or "Adds up to the tip". It is sent as `tipSplit: { mode, shares: [{ performerId, value }] }`. Changing the tip afterwards makes the amounts stop adding up and Save says so; "Not shared" sends no split.

**Commissions page (Task 4).** Rules are listed most specific first with their priority (1 person + service, 2 person, 3 service, 4 default) and whether they are on. **Add rule** asks what it applies to (a person doing one service, a person, a service, or everybody); a rule can be switched off and on, edited (who it is for cannot change) and removed, and **Which rule applies?** explains the winner for a person and service. **Show rule history** lists what was done. The people table has a **Tips** column and a **Tips shared** panel lists how each tip was shared; tips are never added to commission. A shared line shows the person's share, their part, and which kind of rule it came from.

## Design notes

- Colours and type are CSS variables in `src/styles/_tokens.scss`. Change `--lacquer` to re-colour every action and accent.
- Fonts (Bricolage Grotesque, Figtree) load from Google Fonts in `index.html`. Self-host them if you need to work offline. Production builds inline the font CSS at build time, so they need internet access.
- The bill on the counter screen and the printable invoice share one receipt style (`.receipt`). Print styles are in `_print.scss` (80 mm receipt width).

## Deploying on Vercel + Render

The web app goes on **Vercel**; the API and database go on **Render** (see "Deploying on Vercel + Render" in the API README for that half).

1. Import the repository into Vercel and set the **Root Directory** to `billfront`. `vercel.json` already holds the build command (`npm run build`), the output folder (`dist/parlourbill/browser`) and the single-page-app rewrite that sends unknown paths such as `/admin/invoices/123` to `index.html`, so deep links and reloads work. Real files (the hashed scripts and styles) are served first; only paths with no file behind them are rewritten.
2. Set `apiUrl` in `src/environments/environment.ts` to your API, for example `https://api.example.com/api/v1`, and commit it before deploying.
3. Add your custom domain, for example `app.example.com`, and create the DNS record Vercel shows you.

**The cookie rule, in one paragraph.** Sign-in keeps people signed in with a cookie that belongs to the API's address, and the browser only sends it when the app and the API are on the same site. So use subdomains of **one domain you own** (`app.example.com` and `api.example.com`) and keep `COOKIE_SAMESITE=lax` on the API. On the default addresses (`*.vercel.app` with `*.onrender.com`) browsers treat the two as different sites, the cookie is not sent, and everyone is signed out on every page reload; `COOKIE_SAMESITE=none` only moves the problem to Safari and privacy-focused browsers, which block it. Test it after deploying: sign in, reload, and check you are still signed in.

`netlify.toml` is still included for Netlify (the same build command, folder and redirect). On any other host, serve `dist/parlourbill/browser` and send unknown paths to `index.html`.
