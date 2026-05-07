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
