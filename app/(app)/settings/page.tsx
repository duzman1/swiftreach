import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DefaultsForm } from "@/components/settings/DefaultsForm";
import { WhatsAppCredentialsForm } from "@/components/settings/WhatsAppCredentialsForm";
import { WebhookUrl } from "@/components/settings/WebhookUrl";
import { WhatsAppConnectionStatus } from "@/components/settings/WhatsAppConnectionStatus";
import { BrandingForm } from "@/components/settings/BrandingForm";
import { requireUser } from "@/lib/auth";
import { resolveBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

const TOTAL_STEPS = 7;

export default async function SettingsPage() {
  // Authenticated user — used to construct the per-user webhook URL.
  const user = await requireUser();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const wizardComplete = Boolean(user.wizardCompletedAt);
  // wizardStep counts from 1; "X/7 complete" treats the highest reached
  // step as the number of completed steps. Cap at 7 for display.
  const completedSteps = Math.min(user.wizardStep ?? 0, TOTAL_STEPS);

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your WhatsApp Business connection, sending defaults, and
          webhook settings. Credentials are stored encrypted in your account.
        </p>
      </header>

      {!wizardComplete && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-900">
              Setup incomplete
            </div>
            <div className="text-xs text-amber-800/80 mt-0.5">
              Complete the setup wizard to start sending WhatsApp campaigns.
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-amber-800 tabular-nums">
              Steps: {completedSteps}/{TOTAL_STEPS} complete
            </span>
            <Link href="/onboarding">
              <Button size="sm" className="bg-whatsapp hover:bg-whatsapp-dark text-white">
                Continue Setup →
              </Button>
            </Link>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Connection</CardTitle>
          <CardDescription>
            Connect via Meta Embedded Signup, or expand &quot;Advanced —
            Manual Setup&quot; below to paste credentials directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsAppConnectionStatus
            connected={Boolean(
              user.whatsappApiToken && user.whatsappPhoneNumberId
            )}
            phoneNumberId={user.whatsappPhoneNumberId ?? null}
            businessAccountId={user.whatsappBusinessAccountId ?? null}
          />
        </CardContent>
      </Card>

      <details className="bg-white rounded-md border border-zinc-200 group">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 select-none flex items-center justify-between">
          <span>Advanced — Manual Setup</span>
          <span className="text-xs text-zinc-400 group-open:hidden">
            (click to expand)
          </span>
        </summary>
        <div className="px-4 pb-4 pt-2 border-t border-zinc-100 space-y-2">
          <p className="text-xs text-zinc-500">
            For developers. Paste API token, Phone Number ID, and Business
            Account ID directly. Credentials are stored encrypted.
          </p>
          <WhatsAppCredentialsForm />
        </div>
      </details>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>
            Paste this into Meta&apos;s webhook configuration to receive delivery
            callbacks. Each user has their own URL — keep yours private.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WebhookUrl url={`${baseUrl}/api/webhook/${user.id}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <CardDescription>
            Used as starting values for new campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DefaultsForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Customize your PDF campaign reports with your logo, company
            name, and accent color. Available on the Pro plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm
            initial={resolveBranding(user)}
            canEdit={user.plan === "pro"}
            plan={user.plan}
          />
        </CardContent>
      </Card>

      <div className="text-center pt-4 border-t border-zinc-100">
        <Link
          href="/settings/setup"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Redo Setup Wizard
        </Link>
      </div>
    </div>
  );
}
