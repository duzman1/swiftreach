# Deploying SwiftReach to Vercel

Once you've got the app running locally with Postgres
(see `DATABASE_SETUP.md`), production deployment is a one-time setup of about
20 minutes.

## Prerequisites

- GitHub account, project pushed to a repo
- Vercel account (free at <https://vercel.com>)
- Neon Postgres database set up — see `DATABASE_SETUP.md`
- Meta WhatsApp app already working locally
- (Optional) Google Drive OAuth credentials — see `GOOGLE_DRIVE_SETUP.md`

---

## Step 1 — Push to GitHub

If you haven't already:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/swiftreach.git
git push -u origin main
```

Make sure `.env.local` is **not** committed. The included `.gitignore`
already excludes it — double-check with `git status` that no `.env*` file is
staged.

## Step 2 — Import to Vercel

1. <https://vercel.com> → sign in with GitHub.
2. **Add New** → **Project**.
3. Select your repo.
4. Framework preset: **Next.js** (auto-detected).
5. Root directory: leave default (the project root).
6. **Don't click Deploy yet** — add env vars first (next step).

## Step 3 — Add environment variables

In the Vercel project's **Environment Variables** screen, add **all** of these
for **Production** and **Preview** (and Development too if you want
Vercel's local dev pulls to work):

### Required
- `DATABASE_URL` — pooled Neon URL
- `DIRECT_URL` — direct Neon URL
- `WHATSAPP_API_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_API_VERSION` — `v25.0` is current
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_BASE_URL` — your Vercel URL, e.g. `https://swiftreach.vercel.app`
  (you'll know the URL after step 5; you can update this then and redeploy)

### Optional (Google Drive)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_API_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_API_KEY`

Tip: Vercel's UI lets you paste a `.env`-format text block in one shot via the
"Bulk-add" toggle.

## Step 4 — Push the schema to Neon

Vercel won't run migrations for you on first deploy. Run **once locally** with
your Neon URL in `.env.local`:

```bash
npx prisma db push
```

For schema changes after the first deploy, use:

```bash
npx prisma migrate deploy
```

Or wire it into the Vercel build command (Settings → Build & Output Settings):

```
prisma migrate deploy && next build
```

That way every Vercel deploy runs pending migrations before building.

## Step 5 — Click Deploy

Vercel pulls, installs, builds, deploys. ~3 min the first time.

After it's live you'll have a URL like `https://swiftreach-abc123.vercel.app`.
Open it. Browse `/`, `/campaigns`, `/templates`, `/settings`. Everything should
look identical to localhost.

## Step 6 — Update `NEXT_PUBLIC_BASE_URL` to the real URL

If you set this to a placeholder in step 3, update it now to the actual Vercel
URL and **Redeploy** (Deployments → ⋯ → Redeploy). The Settings page reads
this to display the webhook URL.

## Step 7 — Repoint the Meta webhook

In `developers.facebook.com` → your app → **WhatsApp → Configuration** →
**Webhook → Edit**:

| Field | Value |
|---|---|
| Callback URL | `https://YOUR-VERCEL-URL/api/webhook` |
| Verify token | the same string in `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |

Click **Verify and save**. Subscribe to `messages` and `message_status`.

You can stop your local `ngrok` tunnel — it's no longer needed.

## Step 8 — Update Google OAuth (if Drive integration is enabled)

In Google Cloud Console → **APIs & Services** → **Credentials**:

1. Click your **OAuth 2.0 Client ID** for the web app.
2. **Authorized JavaScript origins:** add `https://YOUR-VERCEL-URL`.
3. **Authorized redirect URIs:** add `https://YOUR-VERCEL-URL`.
4. Save.
5. Click your **API Key**.
6. **HTTP referrers:** add `https://YOUR-VERCEL-URL/*`.
7. Save.

## Step 9 — Verify

1. Open the Vercel URL.
2. **Settings** → **Test Connection** → should turn green.
3. **New Campaign** → upload your sample file → send to your own number first.
4. Check the campaign detail page — webhook callbacks should populate the
   "Delivered" and "Read" timestamps within ~30 sec of the recipient opening
   the message.

---

## Custom domain (optional)

Vercel → project → **Settings** → **Domains** → **Add**.

If you own `swiftreach.app`:
- Add `swiftreach.app` and `app.swiftreach.app`.
- Vercel walks you through DNS (CNAME or A record at your registrar).
- Update `NEXT_PUBLIC_BASE_URL` to the custom domain.
- Update Meta webhook to the custom domain.
- Update Google OAuth origins/redirects/referrers to the custom domain.
- Redeploy.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with `prisma: command not found` | The `postinstall` script in `package.json` should run `prisma generate`. If it doesn't, set Build Command to `prisma generate && next build`. |
| Build fails with `DATABASE_URL is not set` | Env var missing in Vercel project settings. Add all the keys from `.env.example`. |
| 500 errors on every page after deploy | Check the Vercel function logs (Deployments → click a deployment → Functions). Most common: the schema hasn't been pushed to Neon yet (run `prisma db push` locally with the Neon URL). |
| SSE / live progress hangs at "Starting…" | `vercel.json` sets `maxDuration: 300` for the send route. If you're on the Hobby plan, max is 60s — switch to the Pro plan, or split sends into batches. |
| Webhook delivery callbacks not arriving | Webhook URL in Meta dashboard doesn't match Vercel URL exactly. Re-verify. Also check Vercel function logs for the `/api/webhook` POSTs. |
| `redirect_uri_mismatch` after deploy on Drive picker | Google OAuth client doesn't have the production origin. Add it (step 8). |
