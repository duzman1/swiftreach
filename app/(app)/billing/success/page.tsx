// Post-checkout success landing. Stripe redirects here with
// ?session_id=cs_test_... — we render an immediate "you're in" page rather
// than parsing the session, because the Stripe webhook is the canonical
// path for plan updates (race-safe, idempotent).

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage() {
  // Fetch fresh user state. By the time the user clicks back from Stripe
  // Checkout, the webhook has usually run already and the plan is updated.
  // If not, the dashboard usage meter will catch up on next page load.
  const user = await requireUser();
  const plan = getPlan(user.plan);

  return (
    <div className="max-w-xl mx-auto py-12">
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div className="bg-emerald-100 text-emerald-700 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            🎉 You&apos;re all set!
          </h1>
          <p className="text-muted-foreground">
            {user.plan !== "free" ? (
              <>
                Welcome to SwiftReach <strong>{plan.name}</strong>. Your
                subscription is now active and your monthly message allowance
                has reset.
              </>
            ) : (
              <>
                Your payment was received. It can take a few seconds for the
                upgrade to reflect — refresh the dashboard if your plan still
                shows as Free.
              </>
            )}
          </p>
          <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
            <Link href="/">
              <Button>Go to Dashboard →</Button>
            </Link>
            <Link href="/billing">
              <Button variant="outline">View Billing</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
