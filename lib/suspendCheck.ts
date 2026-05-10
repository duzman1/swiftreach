// Single-source suspend check used by every user-action route (campaign
// send, template create, etc.). Suspension is set from /admin/users via
// the suspend toggle. Suspended users get a 403 + support copy on any
// state-changing action; read-only access (e.g. viewing past campaigns)
// is intentionally NOT gated so users can still see their data.

import { NextResponse } from "next/server";
import { prisma } from "./prisma";

const SUSPENDED_MESSAGE =
  "Your account has been suspended. Please contact support@swiftreach.app.";

/** Cheap select-only lookup. Returns true iff the user row has suspended=true. */
export async function isUserSuspended(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { suspended: true },
  });
  return Boolean(user?.suspended);
}

/** Standard 403 JSON response for suspended-account refusals. */
export function suspendedResponse() {
  return NextResponse.json(
    { ok: false, error: SUSPENDED_MESSAGE, suspended: true },
    { status: 403 }
  );
}
