// Boot-time check for required env vars. Runs before the first DB query so a
// missing var produces an actionable error in the server console instead of a
// confusing crash deep in the Prisma stack.

interface RequiredEnv {
  key: string;
  description: string;
  setupLink: string;
}

const requiredEnvVars: RequiredEnv[] = [
  {
    key: "DATABASE_URL",
    description: "PostgreSQL connection string (or SQLite file:// for local dev)",
    setupLink: "See DATABASE_SETUP.md",
  },
  {
    key: "WHATSAPP_API_TOKEN",
    description: "Meta WhatsApp API access token",
    setupLink: "See SETUP.md",
  },
  {
    key: "WHATSAPP_PHONE_NUMBER_ID",
    description: "WhatsApp Phone Number ID from Meta dashboard",
    setupLink: "See SETUP.md",
  },
  {
    key: "WHATSAPP_BUSINESS_ACCOUNT_ID",
    description: "WhatsApp Business Account ID from Meta dashboard",
    setupLink: "See SETUP.md",
  },
  {
    key: "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    description: "Webhook verification token (any random string)",
    setupLink: "See SETUP.md",
  },
  {
    key: "NEXT_PUBLIC_BASE_URL",
    description: "Public app URL (Vercel URL or ngrok tunnel)",
    setupLink: "e.g. https://your-app.vercel.app",
  },
  {
    key: "ENCRYPTION_KEY",
    description:
      "64-char hex (32 bytes) — encrypts per-user Meta API tokens at rest",
    setupLink:
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  },
  {
    key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    description: "Clerk publishable key (pk_test_... or pk_live_...)",
    setupLink: "See AUTH_SETUP.md",
  },
  {
    key: "CLERK_SECRET_KEY",
    description: "Clerk secret key (sk_test_... or sk_live_...)",
    setupLink: "See AUTH_SETUP.md",
  },
];

let validated = false;

export function validateEnv(): true {
  if (validated) return true;
  // Trim defensively — common gotcha: a trailing space in a .env entry.
  const missing = requiredEnvVars.filter((v) => !process.env[v.key]?.trim());

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error("\n❌ Missing required environment variables:\n");
    for (const v of missing) {
      // eslint-disable-next-line no-console
      console.error(`  ${v.key}`);
      // eslint-disable-next-line no-console
      console.error(`  → ${v.description}`);
      // eslint-disable-next-line no-console
      console.error(`  → ${v.setupLink}\n`);
    }
    throw new Error(
      `Missing ${missing.length} required environment variable(s). ` +
        `Check your .env.local file (or Vercel project settings).`
    );
  }
  validated = true;
  return true;
}
