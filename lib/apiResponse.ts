// Consistent success / error response builders. Adapted to this codebase's
// existing `{ ok: true | false }` shape (every route + every frontend call
// site assumes that shape).

import { NextResponse } from "next/server";

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...{ data } }, { status });
}

export function errorResponse(
  message: string,
  status = 500,
  details?: unknown
) {
  // Server-side log — useful in Vercel function logs.
  // eslint-disable-next-line no-console
  console.error(`API Error [${status}]:`, message, details ?? "");
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

interface PrismaErrorLike {
  code?: string;
  message?: string;
}

/**
 * Catch-all error handler for API routes. Translates well-known Prisma codes
 * and database connection errors into actionable messages, falls back to a
 * generic 500 for anything else.
 */
export function handleApiError(error: unknown, context = "") {
  // eslint-disable-next-line no-console
  console.error(`Error in ${context}:`, error);

  const e = error as PrismaErrorLike;

  // Prisma unique constraint violation
  if (e?.code === "P2002") {
    return errorResponse("A record with this value already exists", 409);
  }
  // Prisma "record not found"
  if (e?.code === "P2025") {
    return errorResponse("Record not found", 404);
  }

  const msg = e?.message ?? "";
  // Common database connection signatures
  if (
    /connect|database|ECONNREFUSED|EHOSTUNREACH|getaddrinfo/i.test(msg)
  ) {
    return errorResponse(
      "Database connection failed. Check your DATABASE_URL.",
      503
    );
  }

  return errorResponse(msg || "An unexpected error occurred", 500);
}
