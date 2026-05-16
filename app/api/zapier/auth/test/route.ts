// Zapier authentication test endpoint.
//
// When a user sets up the SwiftReach Zapier app, Zapier hits this route
// to validate the API key they pasted. We authenticate via the same
// API-key path the public webhook uses, then return a small profile
// payload so Zapier can label the connection in the user's account
// ("john@example.com — growth plan").
//
// Public route — auth is by API key only, never Clerk. Listed in
// middleware via the /api/webhooks/(.*) wildcard? No — Zapier hits
// /api/zapier/*, so we add that path to middleware separately.
//
// We accept GET and POST: Zapier's "URL test" pattern uses GET, but
// some custom integration setups POST. Behaviour is identical.

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, AuthError } from "@/lib/apiKeys";
import { prisma } from "@/lib/prisma";
import { dailyLimitForPlan } from "@/lib/webhookRateLimit";

export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  // Pull the body opportunistically so authenticateApiKey can read
  // body.api_key as a fallback. GET requests have no body — that's fine.
  let body: { api_key?: unknown } | null = null;
  if (request.method !== "GET") {
    try {
      body = (await request.json()) as { api_key?: unknown };
    } catch {
      body = null;
    }
  }

  try {
    // Pass the request through unchanged so authenticateApiKey can read
    // headers, the URL (for ?api_key=...), and the body all from one
    // source of truth.
    const auth = await authenticateApiKey(request, body);

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        plan: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Account not found." },
        { status: 404 }
      );
    }

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.email;

    // Shape is intentionally Zapier-friendly: top-level `id` + `email`
    // are what Zapier templates into "Connection label" by default.
    return NextResponse.json({
      ok: true,
      id: user.id,
      email: user.email,
      name: displayName,
      plan: user.plan,
      daily_limit: dailyLimitForPlan(user.plan),
      connected_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status }
      );
    }
    // eslint-disable-next-line no-console
    console.error("Zapier auth test error:", err);
    return NextResponse.json(
      { ok: false, error: "Unable to validate API key." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
