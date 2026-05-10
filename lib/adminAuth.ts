// Admin gate. Two-layer protection:
//   1. middleware.ts blocks /admin routes for non-admins at the edge
//   2. requireAdmin() below MUST be called at the top of every
//      /api/admin/* route — never trust the middleware alone, since edge
//      checks can be skipped or stale.
//
// The allowlist lives in the ADMIN_EMAILS env var (comma-separated).
// Server-side only — there is no NEXT_PUBLIC_ADMIN_EMAILS, by design.

import { auth, currentUser } from "@clerk/nextjs/server";

interface AdminContext {
  userId: string;
  email: string;
}

function readAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return readAdminEmails().includes(email.toLowerCase());
}

/**
 * Throw if the request isn't from a Clerk-authenticated user whose email
 * is in ADMIN_EMAILS. Throws errors with `.status` codes (401 / 403) so
 * handleApiError surfaces them correctly.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const { userId } = await auth();
  if (!userId) {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  // currentUser() is a DB lookup against Clerk — safe to call from any
  // server route. Email is the canonical identity for admin checks.
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;

  if (!isAdminEmail(email)) {
    const err = new Error("Forbidden — admin access required") as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }

  return { userId, email: email! };
}
