import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DefaultsForm } from "@/components/settings/DefaultsForm";
import { WhatsAppCredentialsForm } from "@/components/settings/WhatsAppCredentialsForm";
import { WebhookUrl } from "@/components/settings/WebhookUrl";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Authenticated user — used to construct the per-user webhook URL.
  const user = await requireUser();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your WhatsApp Business connection, sending defaults, and
          webhook settings. Credentials are stored encrypted in your account.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Credentials</CardTitle>
          <CardDescription>
            Get these from the Meta Developer dashboard. See <strong>SETUP.md</strong> for a
            step-by-step guide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsAppCredentialsForm />
        </CardContent>
      </Card>

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
    </div>
  );
}
