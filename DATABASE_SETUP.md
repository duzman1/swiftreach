# Database Setup — Neon PostgreSQL

SwiftReach uses PostgreSQL in production. Locally you can run on SQLite while
developing, but to deploy to Vercel (or any serverless host) you need a hosted
Postgres database.

**Neon** (recommended for Vercel) has a free tier. **Supabase** also works.

---

## Step 1 — Create a Neon account

Go to <https://neon.tech> and sign up (free, no credit card).

## Step 2 — Create a new project

1. Click **New Project**.
2. Name: `swiftreach`.
3. Region: pick the closest to your Vercel region (US East works well for
   Vercel's default `iad1` region).
4. Postgres version: leave the default (16+).
5. Click **Create Project**.

Neon provisions in a few seconds.

## Step 3 — Get your connection strings

After provisioning, the **Connection Details** panel appears.

1. **Connection type dropdown:** select **Prisma**.
2. Neon will show two URL templates:
   - **Pooled connection** → `DATABASE_URL` (used at runtime — handles
     concurrent serverless function invocations cleanly)
   - **Direct connection** → `DIRECT_URL` (used by `prisma migrate` — the
     pooler doesn't support some commands migrations need)

Click the eye icon to reveal the password, then **Copy** each string.

## Step 4 — Add to `.env.local`

In the project root, edit `.env.local`. Replace the SQLite line:

```
DATABASE_URL="file:./dev.db"
```

with the two Neon strings:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
```

`DATABASE_URL` is used by Prisma for queries (pooled, scales with your
serverless concurrency). `DIRECT_URL` is used for migrations only (must be a
direct connection — pgBouncer doesn't support some Postgres protocol
features migrations need).

## Step 5 — Push the schema

In your terminal:

```
npx prisma db push
```

This creates the tables (`Campaign`, `Contact`, `MessageTemplate`, `Settings`)
in Neon based on `prisma/schema.prisma`. **No** migration history is created —
this is the right command for the first run on a fresh database.

For subsequent schema changes (after the project is live), use:

```
npx prisma migrate dev --name describe_your_change
```

Locally, then in CI/Vercel build:

```
npx prisma migrate deploy
```

## Step 6 — Verify

```
npx prisma studio
```

Opens a local web UI at <http://localhost:5555>. You should see the four tables
empty (zero rows). Empty is correct — you haven't run any campaigns against
the new database yet.

## Step 7 — Restart `npm run dev`

```
# Ctrl+C the running dev server, then:
npm run dev
```

The dashboard at `http://localhost:3000` will now read from Neon. The previous
SQLite data (in `prisma/dev.db`) is left untouched — you can delete the file
or keep it as a backup.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Authentication failed` | Wrong password in URL. Re-copy from Neon Connection Details. |
| `Can't reach database server` | Wrong host. Re-copy from Neon. |
| `prepared statement "s1" already exists` | Using pooled URL for migrations. Use `DIRECT_URL` for migrations (already wired in `schema.prisma`). |
| `error: SSL connection is required` | Add `?sslmode=require` to the URL — already in Neon's templates. |

## Going to production (Vercel)

After local works, copy the **same two URLs** into Vercel project settings:

1. Vercel project → **Settings** → **Environment Variables**.
2. Add `DATABASE_URL` and `DIRECT_URL` for **Production**, **Preview**, and
   **Development** scopes (or just Production + Preview if you only run
   migrations from local).
3. Redeploy.

The Vercel build runs `prisma generate` automatically (via the `postinstall`
script in `package.json`). For schema changes, run `npx prisma migrate deploy`
locally before pushing — or override the Vercel build command to:

```
prisma migrate deploy && next build
```

See `DEPLOY.md` for the full deploy walkthrough.
