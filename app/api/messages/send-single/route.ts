import { NextRequest, NextResponse } from "next/server";
import {
  sendTextMessage,
  sendTemplateMessage,
  sendWithRetry,
  buildTemplateComponents,
  DEFAULT_API_VERSION,
  type VariableMapping,
  type WhatsAppCredentials,
} from "@/lib/whatsapp";
import { normalizePhone, isValidPhone } from "@/lib/phoneUtils";
import { buildMessage, type FormatRule } from "@/lib/buildMessage";
import { requireUser } from "@/lib/auth";
import { decrypt } from "@/lib/encrypt";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

interface SendSingleBody {
  mode: "freeform" | "template";
  phoneNumber?: string;
  defaultCountryCode?: string;
  // freeform
  template?: string;
  // template mode
  templateName?: string;
  templateLanguage?: string;
  variableMap?: VariableMapping[];
  // shared
  rowData?: Record<string, string>;
  staticVars?: Record<string, string>;
  formatRules?: Record<string, FormatRule>;
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    if (!user.whatsappApiToken || !user.whatsappPhoneNumberId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "WhatsApp credentials not configured. Add them in Settings.",
          code: "CONFIG_MISSING",
        },
        { status: 200 }
      );
    }
    const decrypted = decrypt(user.whatsappApiToken);
    if (!decrypted) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not decrypt your saved API token. Re-enter it in Settings.",
        },
        { status: 200 }
      );
    }
    const creds: WhatsAppCredentials = {
      apiToken: decrypted,
      phoneNumberId: user.whatsappPhoneNumberId,
      apiVersion: user.whatsappApiVersion ?? DEFAULT_API_VERSION,
    };

    let body: SendSingleBody;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body || (body.mode !== "freeform" && body.mode !== "template")) {
      return badRequest("Missing or invalid 'mode' (must be 'freeform' or 'template')");
    }
    if (!body.phoneNumber || typeof body.phoneNumber !== "string") {
      return badRequest("Missing 'phoneNumber'");
    }

    const phone = normalizePhone(
      body.phoneNumber,
      body.defaultCountryCode || user.defaultCountryCode || "1"
    );
    if (!isValidPhone(phone)) {
      return badRequest("Invalid phone number (need at least 10 digits)");
    }

    if (body.mode === "freeform") {
      if (typeof body.template !== "string") {
        return badRequest("Missing 'template' for freeform mode");
      }
      const text = buildMessage({
        template: body.template,
        rowData: body.rowData ?? {},
        staticVars: body.staticVars ?? {},
        formatRules: body.formatRules ?? {},
      });
      if (!text.trim()) {
        return badRequest("Message is empty after substitution");
      }
      const result = await sendWithRetry(() =>
        sendTextMessage(phone, text, creds)
      );
      return NextResponse.json({
        ok: result.success,
        messageId: result.messageId,
        error: result.error?.message,
        code: result.error?.code,
      });
    }

    // template mode
    if (!body.templateName || !body.templateLanguage) {
      return badRequest("Missing 'templateName' or 'templateLanguage' for template mode");
    }
    const components = buildTemplateComponents(
      body.variableMap ?? [],
      body.rowData ?? {},
      body.staticVars ?? {}
    );
    const result = await sendWithRetry(() =>
      sendTemplateMessage(
        phone,
        body.templateName!,
        body.templateLanguage!,
        components,
        creds
      )
    );
    return NextResponse.json({
      ok: result.success,
      messageId: result.messageId,
      error: result.error?.message,
      code: result.error?.code,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/messages/send-single");
  }
}
