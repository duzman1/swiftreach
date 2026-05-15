// API key utilities for the public webhook API. Plain keys live in
// the user's clipboard for ~10 seconds — only the bcrypt hash is
// persisted, so revoking a key permanently disables it and we can
// never reconstruct one if asked.
//
// Key format: `sr_live_` + 32 hex chars (16 random bytes). The
// `sr_live_` prefix lets us reject obvious typos at the door without
// even hashing.

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "./prisma";

export interface AuthenticatedKey {
  userId: string;
  apiKeyId: string;
  plan: string;
}

export interface GeneratedKey {
  plainKey: string;
  keyHash: string;
  keyPrefix: string;
  keySuffix: string;
}

const KEY_PREFIX = "sr_live_";
const PREFIX_LEN = 12; // "sr_live_" + 4 hex
const BCRYPT_ROUNDS = 10;

/**
 * Generate a fresh API key. Returns BOTH the plain key (to be shown
 * once and immediately discarded) and the hash + display fragments
 * to persist on the ApiKey row.
 */
export function generateApiKey(): GeneratedKey {
  const randomPart = crypto.randomBytes(16).toString("hex");
  const plainKey = `${KEY_PREFIX}${randomPart}`;
  const keyHash = bcrypt.hashSync(plainKey, BCRYPT_ROUNDS);
  const keyPrefix = plainKey.substring(0, PREFIX_LEN);
  const keySuffix = plainKey.slice(-4);
  return { plainKey, keyHash, keyPrefix, keySuffix };
}

/** Compare a plain key against a stored bcrypt hash. */
export async function verifyApiKey(
  plainKey: string,
  keyHash: string
): Promise<boolean> {
  return bcrypt.compare(plainKey, keyHash);
}

/**
 * Pull the API key out of the request. Three accepted forms:
 *   - Authorization: Bearer sr_live_...
 *   - X-API-Key: sr_live_...
 *   - body.api_key (for legacy clients that can't set headers)
 */
export function extractApiKey(
  request: Request,
  body?: { api_key?: unknown } | null
): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();

  const headerKey = request.headers.get("X-API-Key");
  if (headerKey) return headerKey.trim();

  const bodyKey = body?.api_key;
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim();

  return null;
}

/**
 * Authenticate an API key. Throws AuthError with a `.status` hint so
 * the route handler can surface a 401 with a useful message. On
 * success, returns the user/plan plus the apiKeyId so the call site
 * can attribute logs.
 *
 * SECURITY: we narrow the candidate set by `keyPrefix` (the first 12
 * chars of the plain key, which we DO store) before iterating — bcrypt
 * compare is intentionally slow, so checking against every key on the
 * platform per request would be devastating. The prefix gives us a
 * cheap O(small-N) candidate filter.
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function authenticateApiKey(
  request: Request,
  body?: { api_key?: unknown } | null
): Promise<AuthenticatedKey> {
  const plainKey = extractApiKey(request, body);
  if (!plainKey) {
    throw new AuthError(
      "API key is required. Pass it in the Authorization header: Bearer sr_live_..."
    );
  }
  if (!plainKey.startsWith(KEY_PREFIX)) {
    throw new AuthError(
      "Invalid API key format. Keys must start with sr_live_"
    );
  }

  const keyPrefix = plainKey.substring(0, PREFIX_LEN);
  const candidates = await prisma.apiKey.findMany({
    where: { keyPrefix, isActive: true },
    include: {
      user: { select: { id: true, plan: true, suspended: true } },
    },
  });

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await verifyApiKey(plainKey, candidate.keyHash);
    if (!ok) continue;

    if (candidate.user.suspended) {
      throw new AuthError(
        "This account has been suspended. Contact support@swiftreach.app",
        403
      );
    }

    // Fire-and-forget bookkeeping. We never block the request on this.
    prisma.apiKey
      .update({
        where: { id: candidate.id },
        data: {
          lastUsedAt: new Date(),
          requestCount: { increment: 1 },
        },
      })
      // eslint-disable-next-line no-console
      .catch((err) => console.error("apiKey usage update failed:", err));

    return {
      userId: candidate.userId,
      apiKeyId: candidate.id,
      plan: candidate.user.plan,
    };
  }

  throw new AuthError(
    "Invalid or expired API key. Check your key in SwiftReach Settings → API Keys."
  );
}
