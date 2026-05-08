# Authentication Setup — Clerk

SwiftReach uses **Clerk** for sign-up, sign-in, and session management. Clerk
handles the auth UI and email/Google OAuth; we sync user records to our own
Postgres database via webhook so each user can have their own campaigns,
templates, and Meta API credentials.

Allow ~10 minutes the first time.

---

## Step 1 — Create a Clerk account

Go to <https://clerk.com> and sign up (free, no credit card).

## Step 2 — Create an application

1. Top right → **Create application** (or **Add application**).
2. **Name:** `SwiftReach`.
3. **Sign-in options:**
   - ☑ Email address
   - ☑ Google (under "Social Connections")
4. Click **Create application**.

## Step 3 — Copy your API keys

You'll land on the **API Keys** screen automatically. If not: left sidebar →
**API Keys**.

Two values to copy:

| Field in Clerk | Goes into `.env.local` as |
|---|---|
| **Publishable key** (starts with `pk_test_...`) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| **Secret key** (starts with `sk_test_...`) | `CLERK_SECRET_KEY` |

Click the eye icon to reveal the secret key. **Copy both.**

Open `.env.local` in your project root and paste them in. The other
`NEXT_PUBLIC_CLERK_*_URL` lines are already filled in correctly — leave them
alone.

## Step 4 — Allow your domains

Left sidebar → **Domains**.

Click **Add domain** and add **both**:

- `http://localhost:3000` (for local dev)
- `https://www.swiftreach.app` (for production — and any other production URL you use)

Without this, Clerk's auth widgets refuse to render on those origins.

## Step 5 — Create the user-sync webhook

This lets Clerk tell our app every time someone signs up or updates their
profile, so we can mirror them into the Postgres `User` table.

1. Left sidebar → **Webhooks** (or **Configure → Webhooks** depending on
   Clerk's current UI).
2. **Add Endpoint**.
3. **Endpoint URL:** `https://www.swiftreach.app/api/clerk-webhook`
   - For testing locally with ngrok: `https://YOUR-NGROK-DOMAIN/api/clerk-webhook`
4. **Subscribe to events:**
   - ☑ `user.created`
   - ☑ `user.updated`
   - ☑ `user.deleted`
5. Click **Create**.
6. After creation, click into the endpoint → **Signing Secret** → copy it
   (starts with `whsec_...`).
7. Paste it into `.env.local` as `CLERK_WEBHOOK_SECRET`.

## Step 6 — (Optional) Brand the Clerk UI

Left sidebar → **Customization**.

- **Primary color:** `#25D366` (SwiftReach green)
- **Logo:** upload your SwiftReach logo if you have one

Both are optional — defaults look fine.

## Step 7 — Restart the dev server

```bash
# Ctrl+C the running dev server, then:
npm run dev
```

`NEXT_PUBLIC_*` env vars are inlined at build/dev start, so changes don't
hot-reload.

## Step 8 — Add the same vars to Vercel (production)

When you're ready to deploy:

1. Vercel project → **Settings → Environment Variables**
2. Add **all** of these for **Production** (and **Preview**):
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL` = `/sign-in`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_URL` = `/sign-up`
   - `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` = `/`
   - `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` = `/onboarding`
   - `CLERK_WEBHOOK_SECRET`
   - `ENCRYPTION_KEY` (the same value as in your `.env.local` — see below)
3. Redeploy.

---

## About `ENCRYPTION_KEY`

SwiftReach stores each user's Meta API token AES-256-CBC encrypted in the
database. The encryption key is read from `process.env.ENCRYPTION_KEY` at
runtime. It must be a **64-char hex string** (32 bytes / 256 bits).

A key has already been generated for you and saved into `.env.local`. **Do
not change it.** Rotating the key permanently breaks every previously stored
token — every user would have to paste their Meta API token again.

To verify it's correctly set:

```bash
grep ENCRYPTION_KEY .env.local
```

The value should be a 64-char hex string. If you ever need to regenerate
(e.g. for a fresh project):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

When you deploy to Vercel, copy the same value into the Vercel env var.
**Never commit `.env.local` to git.** The included `.gitignore` already
excludes it.

---

## Testing the flow end-to-end

After completing the SwiftReach Phase 3 build:

1. Open `http://localhost:3000/`
2. **Logged-out users see:** the landing page with a "Get Started Free" CTA
3. Click **Get Started Free** → sign up with email or Google
4. After Clerk verifies email, you're redirected to `/onboarding`
5. Paste your Meta API credentials and click **Test Connection**
6. After connection passes, click **Continue** → land on the dashboard
7. Sign out from the avatar in the sidebar → back to landing page

If any step fails, see the troubleshooting section below.

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| Sign-in widget doesn't render, blank gray box | Origin not in **Domains** list (step 4). Add `http://localhost:3000`. |
| `Error: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set` | `.env.local` missing the publishable key. Restart `npm run dev` after editing. |
| Sign-up succeeds in Clerk but user never appears in your Postgres `User` table | Webhook not configured (step 5), or `CLERK_WEBHOOK_SECRET` mismatched. Check Vercel function logs for `/api/clerk-webhook`. |
| `redirect_uri_mismatch` on Google OAuth (Drive picker) | Different issue — see `GOOGLE_DRIVE_SETUP.md` step 7. |
| Email verification email not arriving | Clerk's free tier uses their own SMTP; check spam folder. For production, configure custom email in Clerk → Email & SMS. |
| `ENCRYPTION_KEY must be a 64-char hex string` at boot | The value got truncated or has whitespace. Re-paste from `.env.local`. |
