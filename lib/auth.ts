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
 * Three-path safety net:
 *   1. Row exists at the current Clerk userId — return it (hot path).
 *   2. Row exists under the same EMAIL but a different Clerk userId —
 *      migrate it. This happens when the Clerk instance flips from
 *      development to production: same human, but Clerk issues a brand
 *      new userId. Naive `prisma.user.create()` would crash on the email
 *      unique constraint (P2002).
 *   3. No row at all — create one fresh.
 *
 * Case 2 needs a transaction: changing User.id while FKs in Campaign,
 * MessageTemplate, ScheduledCampaign, SavedContact, ContactGroup,
 * InboundMessage and OutboundReply still reference the old value will
 * fail at commit (Postgres FK has ON UPDATE NO ACTION by default,
 * which Prisma doesn't override). Update every child relation first,
 * then update the User's primary key — all atomically.
 *
 * Race: two concurrent requests on the first login after the switch can
 * both enter the migration branch; one wins, the other will find the
 * row by id on retry. We don't lock the row explicitly — the worst case
 * is a single 500 that the user retries through.
 */
export async function requireUser() {
  const userId = await requireUserId();

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
  const firstName = clerkUser?.firstName ?? null;
  const lastName = clerkUser?.lastName ?? null;

  // Case 2: email already exists under a different Clerk userId.
  const existingByEmail = email
    ? await prisma.user.findUnique({ where: { email } })
    : null;

  if (existingByEmail && existingByEmail.id !== userId) {
    return prisma.$transaction(async (tx) => {
      const oldId = existingByEmail.id;
      // Re-point every child relation. updateMany is a no-op when the
      // user has none of a given kind — safe to call all.
      await tx.campaign.updateMany({ where: { userId: oldId }, data: { userId } });
      await tx.messageTemplate.updateMany({ where: { userId: oldId }, data: { userId } });
      await tx.scheduledCampaign.updateMany({ where: { userId: oldId }, data: { userId } });
      await tx.savedContact.updateMany({ where: { userId: oldId }, data: { userId } });
      await tx.contactGroup.updateMany({ where: { userId: oldId }, data: { userId } });
      await tx.inboundMessage.updateMany({ where: { userId: oldId }, data: { userId } });
      await tx.outboundReply.updateMany({ where: { userId: oldId }, data: { userId } });
      // Now safe to flip the User's primary key.
      return tx.user.update({
        where: { id: oldId },
        data: { id: userId, firstName, lastName },
      });
    });
  }

  // Case 3: fresh user, no collision.
  return prisma.user.create({
    data: { id: userId, email, firstName, lastName },
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
