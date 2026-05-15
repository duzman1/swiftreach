// Settings → API Keys. Server shell that pre-loads the user's plan
// (so the free-plan locked state can render server-side without a
// client-side flicker), then hands the rest off to the client UI.

import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysClient } from "@/components/api-keys/ApiKeysClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "API Keys" };

const MAX_KEYS_PER_PLAN: Record<string, number> = {
  free: 0,
  starter: 1,
  growth: 3,
  pro: 10,
};

export default async function ApiKeysPage() {
  const user = await requireUser();
  const maxKeys = MAX_KEYS_PER_PLAN[user.plan] ?? 0;
  const isPaid = maxKeys > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground mt-1">
          Connect SwiftReach to Zapier, Make, or any app using your API
          keys.
        </p>
        <Link
          href="/developers"
          className="inline-flex items-center gap-1.5 mt-2 text-sm text-whatsapp hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View API Documentation
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          {isPaid && (
            <CardDescription>
              Plan: <strong>{user.plan}</strong> · {maxKeys} key
              {maxKeys === 1 ? "" : "s"} max
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!isPaid ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
                <Lock className="w-6 h-6 text-amber-700" />
              </div>
              <h3 className="text-base font-semibold text-amber-900">
                API access requires a paid plan.
              </h3>
              <p className="text-sm text-amber-800/80">
                Upgrade to Starter, Growth, or Pro to generate API keys
                and trigger WhatsApp messages from any app.
              </p>
              <Link href="/billing">
                <Button className="bg-whatsapp hover:bg-whatsapp-dark text-white">
                  Upgrade to Starter →
                </Button>
              </Link>
            </div>
          ) : (
            <ApiKeysClient initialPlan={user.plan} maxKeys={maxKeys} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
