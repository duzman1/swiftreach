import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TestConnectionButton } from "@/components/settings/TestConnectionButton";
import { DefaultsForm } from "@/components/settings/DefaultsForm";
import { WebhookUrl } from "@/components/settings/WebhookUrl";

function mask(value: string | undefined) {
  if (!value) return "(not set)";
  if (value.length <= 8) return "•".repeat(value.length);
  return value.slice(0, 4) + "•".repeat(Math.max(value.length - 8, 4)) + value.slice(-4);
}

export default function SettingsPage() {
  const env = {
    token: process.env.WHATSAPP_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v19.0",
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  };

  const hasAll =
    env.token && env.phoneNumberId && env.wabaId && env.verifyToken;

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Meta WhatsApp Cloud API configuration. Values come from{" "}
          <code className="text-xs bg-zinc-200 px-1 py-0.5 rounded">.env.local</code>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            API Credentials
            {hasAll ? (
              <Badge variant="success">Configured</Badge>
            ) : (
              <Badge variant="warning">Not configured</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Restart the dev server after editing{" "}
            <code className="text-xs bg-zinc-200 px-1 py-0.5 rounded">.env.local</code>.
            See <strong>SETUP.md</strong> for a step-by-step guide.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Access Token" value={mask(env.token)} />
          <Row label="Phone Number ID" value={env.phoneNumberId || "(not set)"} />
          <Row label="Business Account ID" value={env.wabaId || "(not set)"} />
          <Row label="API Version" value={env.apiVersion} />
          <Row label="Webhook Verify Token" value={mask(env.verifyToken)} />

          <div className="pt-3 border-t">
            <TestConnectionButton />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>
            Paste this into Meta&apos;s webhook configuration to receive delivery callbacks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WebhookUrl url={`${env.baseUrl}/api/webhook`} />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <code className="text-xs bg-zinc-100 px-2 py-1 rounded break-all max-w-[60%] text-right">
        {value}
      </code>
    </div>
  );
}
