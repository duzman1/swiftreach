// Clerk auth runs at the edge before any route renders. Public routes are
// listed below; everything else requires a session. The Meta WhatsApp webhook
// MUST stay public (Meta hits it from their servers, no Clerk session) — same
// for the Clerk user-sync webhook, which Clerk hits with its own signing
// secret instead of a session cookie.
//
// For unauthenticated requests to protected ROUTES we redirect to /sign-in
// (better UX than Clerk's default 404). For unauthenticated requests to
// protected APIs we 401 with JSON so client fetches see a useful error.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",                    // Landing for logged-out, dashboard for logged-in
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhook(.*)",     // Meta WhatsApp webhook (incl. /api/webhook/[userId])
  "/api/clerk-webhook",   // Clerk user lifecycle webhook
]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  const { userId } = await auth();
  if (userId) return; // signed in — let the route render

  const url = new URL(request.url);
  const pathname = url.pathname;

  // API requests get a JSON 401 instead of an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Page request: redirect to /sign-in with the intended URL preserved so we
  // can come back here after sign-in.
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirect_url", pathname + url.search);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    // Skip Next internals + all static assets, but always run on API/TRPC.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
