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
 * Three-stage lookup:
 *   1. findUnique by id — hot path.
 *   2. fallback to findUnique by EMAIL — handles the Clerk dev→prod
 *      switch where the same human gets re-issued under a new userId.
 *      If found, the row's id is updated to point at the new userId.
 *   3. final safety-net upsert by email — covers any race / partial
 *      state we didn't catch above.
 *
 * NOTE on the id update at stage 2: Postgres rejects updating a
 * primary key while child rows still reference the old value (FK
 * constraint, ON UPDATE NO ACTION by default). If the affected user
 * has any campaigns / templates / scheduled / contacts / inbox rows,
 * THIS UPDATE WILL THROW P2003. If P2003 surfaces in logs, switch the
 * id update for a $transaction that issues
 * `SET CONSTRAINTS ALL DEFERRED` first — but that also requires the
 * FK constraints to be DEFERRABLE, which Prisma doesn't generate by
 * default. The migration-friendly path is to recreate the User row
 * with the new id and re-point children in raw SQL.
 */
export async function requireUser() {
  const userId = await requireUserId();

  const clerkUser = await currentUser();
  const userEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";

  // Stage 1: lookup by current Clerk userId.
  let user = await prisma.user.findUnique({ where: { id: userId } });

  // Stage 2: fallback to email-based lookup. Handles Clerk dev→prod
  // migration where the userId changes but the email is stable.
  if (!user && userEmail) {
    user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (user) {
      user = await prisma.user.update({
        where: { email: userEmail },
        data: { id: userId },
      });
    }
  }

  if (user) return user;

  // Stage 3: nothing found by id OR by email → upsert as safety net.
  return prisma.user.upsert({
    where: { email: userEmail },
    update: {
      id: userId,
      firstName: clerkUser?.firstName ?? null,
      lastName: clerkUser?.lastName ?? null,
      updatedAt: new Date(),
    },
    create: {
      id: userId,
      email: userEmail,
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
