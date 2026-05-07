# WhatsApp Bulk Messenger

A self-hosted web app for sending personalized WhatsApp messages at scale via the official Meta WhatsApp Business Cloud API. Upload any Excel or CSV file, write a message template using your file's column headers as variables, preview per-contact, and send. No variable names are hardcoded — the variable system is driven entirely by your data.

## Prerequisites

- **Node.js 18+** (`node -v`)
- A **Meta Developer account** with a WhatsApp app — see [SETUP.md](./SETUP.md) for the full walkthrough.

## Installation

```bash
npm install
```

## Database setup

This app uses SQLite via Prisma. The schema and migrations are in `prisma/`.

```bash
npx prisma migrate dev --name init
```

That creates `prisma/dev.db` and generates the Prisma client.

## Environment

Copy the template and fill in your Meta credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`. Each variable has a comment explaining where to get it. The full guide is in [SETUP.md](./SETUP.md).

## Run locally

```bash
npm run dev
```

Open <http://localhost:3000>.

## Project status

This repo is built in phases:

- **Phase 1 (current):** scaffold, database schema, base UI, dashboard, settings page.
- **Phase 2:** file upload + column detection + variable pool.
- **Phase 3:** message editor with live preview and substitution engine.
- **Phase 4:** Meta API client, SSE send pipeline, delivery webhook.
- **Phase 5:** template library, campaign history, polish.

## Deployment

### Vercel (recommended)

1. Push this repo to GitHub.
2. Import in Vercel.
3. Add the env vars from `.env.example` in the Vercel project settings.
4. Set `DATABASE_URL` to a hosted Postgres or LibSQL URL (SQLite won't survive Vercel's serverless filesystem) and update `prisma/schema.prisma` `datasource` to `postgresql` if using Postgres.

### Self-hosted (Node.js)

```bash
npm run build
npm run start
```

Reverse-proxy through nginx/Caddy, terminate TLS there. Webhooks require a public HTTPS URL.

## License

Internal / private — license as you see fit.
