// Root URL `/`. This is the SINGLE public-facing entry point — it must
// stay OUTSIDE the (app) route group so unauthenticated visitors don't
// trip the group's `redirect("/sign-in")` guard.
//
// Behavior:
//   - signed-out → render <LandingPage /> (no auth required, no chrome)
//   - signed-in  → redirect to /dashboard, which lives inside the (app)
//                  group and gets the user chrome from (app)/layout.tsx

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import LandingPage from "@/components/LandingPage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
