# Admin Setup

The admin panel lives at `/admin` and is protected by an email allowlist. This guide covers everything you need to grant access, the routes available, and how to use the operational tools (suspend, plan override, broadcast).

## 1. Grant admin access

Add comma-separated emails to `ADMIN_EMAILS` in your environment.

```bash
# .env.local
ADMIN_EMAILS=onozied@gmail.com,co-founder@swiftreach.app
```

In Vercel: **Project → Settings → Environment Variables** → add `ADMIN_EMAILS` (Production + Preview + Development), redeploy.

**SECURITY NOTE.** Emails are matched **case-insensitively** against the user's primary email in Clerk. Never prefix this var with `NEXT_PUBLIC_` — it must stay server-side.

Two-layer protection:
1. **`middleware.ts`** — auth-gates `/admin/*` so anonymous users get redirected to `/sign-in`.
2. **`lib/adminAuth.ts → requireAdmin()`** — runs at the top of every `/api/admin/*` route AND inside `app/admin/layout.tsx`. Checks the user's email against `ADMIN_EMAILS` and throws 401/403 otherwise.

Never rely on the layout alone. Every admin API route calls `requireAdmin()` directly.

## 2. Optional: configure Resend for email broadcasts

The Announcements page can fan out a banner as an email blast via [Resend](https://resend.com). This is **optional** — without it, the broadcast button soft-fails with a "skipped" toast and nothing else breaks.

```bash
# .env.local
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=SwiftReach <hello@swiftreach.app>
```

You'll need to verify the sending domain in Resend's dashboard before live emails will deliver.

## 3. Pages

| Path | Purpose |
| --- | --- |
| `/admin` | Overview — totals, MRR, signup + message-volume charts, plan donut, recent signups, failed payments. |
| `/admin/users` | Searchable user roster with filter (plan / status), sort, pagination (25/page). |
| `/admin/users/[id]` | Per-user detail with 4 tabs: Account · Billing · Campaigns · Activity Log. Suspend/unsuspend, manual plan override, delete. |
| `/admin/subscriptions` | Every paying user, sorted by renewal date. MRR by plan bar chart. |
| `/admin/campaigns` | Cross-user campaign list (last 50). |
| `/admin/system` | Health checks (DB / Stripe / Clerk / Meta / Resend), DB row counts, recent error log with clear-all. |
| `/admin/announcements` | Create + manage in-app banners. One active at a time. Optional email broadcast per announcement. |

## 4. APIs

All under `/api/admin/*`, all calling `requireAdmin()`:

- `GET  /api/admin/stats` — overview stat tiles
- `GET  /api/admin/stats/growth` — 30-day signup + message series
- `GET  /api/admin/users?q=&plan=&status=&sort=&page=` — paginated list
- `GET  /api/admin/users/[id]` — full detail (token never returned)
- `DELETE /api/admin/users/[id]` — **cancels Stripe subscription FIRST**, then cascade-deletes user
- `POST /api/admin/users/[id]/plan` — manual plan override (does NOT touch Stripe)
- `POST /api/admin/users/[id]/suspend` — toggle suspension
- `GET  /api/admin/users/[id]/activity` — campaigns + error log for that user
- `GET  /api/admin/subscriptions` — paying users + MRR summary
- `GET  /api/admin/campaigns` — paginated cross-user campaigns
- `GET  /api/admin/system/health` — live ping of DB / Stripe / Clerk
- `GET  /api/admin/system/errors` — last 100 ErrorLog rows
- `DELETE /api/admin/system/errors` — clear all ErrorLog rows
- `GET / POST /api/admin/announcements` — list / create
- `PATCH / DELETE /api/admin/announcements/[id]` — update / remove
- `POST /api/admin/announcements/[id]/broadcast` — send announcement as email

User-facing (read-only, authenticated): `GET /api/announcements/active`.

## 5. Operational playbooks

### Suspend an abusive user

1. `/admin/users` → click their email
2. **Account** tab → **Suspend** button
3. Their next call to `/api/campaigns/[id]/send` or `/api/templates POST` returns 403 with the support copy. Existing data stays intact.

### Grant a comp plan

1. `/admin/users/[id]` → **Billing** tab
2. Click `Set to growth` (or `starter`)
3. The user's plan field updates immediately. Stripe is untouched — they keep whatever subscription state they had. If they later upgrade via checkout, the webhook reconciles.

### Delete a user

1. `/admin/users/[id]` → **Account** tab → **Delete account**
2. Type `delete <their-email>` to confirm
3. The route cancels their Stripe subscription **before** deleting, then cascade-deletes their campaigns and templates.

If Stripe cancellation fails (network, already-canceled, etc.) the delete aborts and the user row stays — fix the Stripe state manually before retrying.

### Publish an announcement

1. `/admin/announcements`
2. Fill the form, choose audience (`all` / `free` / `paid`), keep "Publish immediately" checked
3. Saving deactivates any existing active banner — only one can be live at a time
4. Optional: click **Email broadcast** on the row to send the same message via Resend

### Investigate an error

1. `/admin/system` → scroll to **Recent errors**
2. Filter by severity, expand a row to see the stack trace
3. Click `→ user` to jump to the responsible user (when set)
4. Errors are populated by `lib/errorLog.ts` — currently called from `/api/campaigns/[id]/send`, `/api/billing/webhook`, `/api/webhook/[userId]`, `/api/user/settings`

## 6. Branding rule

The admin app is **slate-900 sidebar / indigo-600 accent** to make it impossible to confuse with the user app's WhatsApp-green sidebar. Don't change this.

The admin UI **never** shows decrypted Meta API tokens. The user detail view only shows `whatsappConnected: true|false` plus the public IDs (phone number ID, WABA ID, API version). Keep it that way.
