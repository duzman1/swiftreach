// Server-side helpers for getting the authenticated user. Wraps Clerk so that
// route handlers don't import @clerk/nextjs directly — keeps a single seam in
// case we ever swap auth providers, and lets us layer the "create-on-first-
// access" safety net consistently in one place.

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";

/**
 * Return the authenticated Clerk user id, or throw 401-shaped error if there
 * is no signed-in user. Use this when you only need the id and don't want to
 * touch the DB.
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return userId;
}

/**
 * Return the authenticated user's full DB row (creating it if missing).
 *
 * Why the create-on-first-access fallback: in normal operation the Clerk
 * user.created webhook (POST /api/clerk-webhook) inserts the row before the
 * user can hit any other route. But webhooks can be late, retried, or — in
 * dev — not configured at all. Rather than 500ing on a foreign-key violation
 * the first time a user touches the API, materialize the row on demand.
 */
export async function requireUser() {
  const userId = await requireUserId();

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  return prisma.user.create({
    data: {
      id: userId,
      email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? "",
      firstName: clerkUser?.firstName ?? null,
      lastName: clerkUser?.lastName ?? null,
    },
  });
}

/**
 * Verify a record returned from the DB belongs to the calling user.
 * Throws a 403-shaped error if the record exists but isn't theirs, or a
 * 404-shaped error if it doesn't exist.
 *
 * Accepts `userId: string | null | undefined` because Campaign / Template
 * have a nullable `userId` during the Phase 3 transition. A null userId on
 * the record means "orphaned data, predates auth" — we treat that as
 * forbidden so it stays inaccessible until explicitly migrated.
 */
export function assertOwnership<T extends { userId: string | null }>(
  record: T | null | undefined,
  userId: string,
  notFoundMessage = "Not found"
): asserts record is T {
  if (!record) {
    const err = new Error(notFoundMessage) as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (record.userId !== userId) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}
