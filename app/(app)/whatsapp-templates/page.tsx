// Read-only viewer for the user's Meta-approved WhatsApp templates.
// Lives at /whatsapp-templates. The heavy lifting happens in the
// client island — this page is just the header shell so it stays
// server-rendered.
//
// This is the surface that legitimizes the `whatsapp_business_management`
// permission request in Meta App Review.

import { WhatsAppTemplatesList } from "@/components/whatsapp-templates/WhatsAppTemplatesList";

export default function WhatsAppTemplatesPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          WhatsApp Templates
        </h1>
        <p className="text-muted-foreground mt-1">
          Your Meta-approved WhatsApp message templates, synced live from your
          connected Business Account. Use the template name in New Campaign →
          Template mode to send.
        </p>
      </header>
      <WhatsAppTemplatesList />
    </div>
  );
}
