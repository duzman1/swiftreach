// Public webhook endpoint. External platforms (Zapier, Make, n8n,
// custom code) POST here with an API key + a phone + either a
// freeform message or a template name. We authenticate, rate-limit
// per plan, send via Meta, and return a structured response with
// rate-limit headers — successful OR not.
//
// EVERY request is logged to WebhookLog before responding. The log
// is fire-and-forget on errors so logging itself can never crash
// the response — the user-facing reply is always returned.
//
// This route is public in middleware (auth-via-API-key, not Clerk).

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateApiKey,
  AuthError,
  type AuthenticatedKey,
} from "@/lib/apiKeys";
import {
  checkWebhookRateLimit,
  type RateLimitState,
} from "@/lib/webhookRateLimit";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";
import {
  sendTextMessage,
  sendTemplateMessage,
  buildTemplateComponents,
  DEFAULT_API_VERSION,
  type WhatsAppCredentials,
  type SendError,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

interface TriggerBody {
  phone?: string;
  message?: string;
  template?: string;
  variables?: Record<string, string>;
  language?: string;
  api_key?: string;
}

const DOCS_URL = "https://www.swiftreach.app/developers";

// ── helpers ─────────────────────────────────────────────────────────────

function rateHeaders(rl: RateLimitState, includeRetryAfter = false): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.floor(rl.resetAt.getTime() / 1000)),
  };
  if (includeRetryAfter) {
    headers["Retry-After"] = String(
      Math.max(0, Math.floor((rl.resetAt.getTime() - Date.now()) / 1000))
    );
  }
  return headers;
}

function errorResponse(
  message: string,
  status: number,
  details?: Record<string, unknown>,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
      docs: DOCS_URL,
    },
    { status, headers }
  );
}

// {{name}} → variables.name. Unknown placeholders pass through unchanged
// so the user can see the typo rather than getting an empty string.
function resolveVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const k = key.trim();
    return Object.prototype.hasOwnProperty.call(variables, k)
      ? String(variables[k])
      : match;
  });
}

// Translate Meta error codes to plain English. Mirrors the existing
// /admin/system error catalog plus the codes the spec calls out.
function translateMetaError(err?: SendError): string {
  if (!err) return "Unknown error from WhatsApp API";
  const code = String(err.code ?? "");
  const msg = err.message ?? "";

  if (code === "131030")
    return "This phone number is not on your Meta approved test recipients list. Add them at developers.facebook.com → your app → WhatsApp → Getting Started.";
  if (code === "131047")
    return "This contact must message your WhatsApp number first (within 24 hours) before you can send free-form messages. Use a template instead.";
  if (code === "131026")
    return "This phone number is not registered on WhatsApp.";
  if (code === "131021")
    return "Invalid phone number format. Use international format: +13103459139";
  if (code === "100")
    return "Invalid WhatsApp API credentials. Check your API token in SwiftReach Settings.";
  if (code === "190")
    return "Your WhatsApp access token is expired. Reconnect at swiftreach.app/onboarding.";
  if (code === "80007" || /rate limit/i.test(msg))
    return "WhatsApp rate limit reached. Wait a few minutes and try again.";

  return msg || `WhatsApp API error (code: ${code})`;
}

// Best-effort log writer. Never throws.
async function writeLog(params: {
  apiKeyId: string | null;
  userId: string | null;
  body: TriggerBody | null;
  status: "success" | "failed" | "rate_limited" | "invalid";
  errorMessage?: string;
  whatsappMsgId?: string;
  responseTimeMs: number;
}) {
  if (!params.apiKeyId || !params.userId) return; // Can't attribute — skip.
  try {
    await prisma.webhookLog.create({
      data: {
        apiKeyId: params.apiKeyId,
        userId: params.userId,
        phoneNumber: String(params.body?.phone ?? "unknown"),
        // Trim-check so a whitespace-only template field doesn't get
        // logged as "template" when we actually sent freeform.
        messageType: params.body?.template?.trim() ? "template" : "freeform",
        templateName: params.body?.template?.trim() ? params.body.template : null,
        variables: params.body?.variables
          ? JSON.stringify(params.body.variables)
          : null,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
        whatsappMsgId: params.whatsappMsgId ?? null,
        responseTimeMs: params.responseTimeMs,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("WebhookLog write failed:", err);
  }
}

// ── handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let body: TriggerBody | null = null;
  let auth: AuthenticatedKey | null = null;

  try {
    // Step 0 — parse body. JSON-only.
    try {
      body = (await request.json()) as TriggerBody;
    } catch {
      return errorResponse(
        "Request body must be valid JSON.",
        400
      );
    }

    // Step 1 — authenticate.
    try {
      auth = await authenticateApiKey(request, body);
    } catch (err) {
      if (err instanceof AuthError) {
        return errorResponse(err.message, err.status);
      }
      throw err;
    }

    // Step 2 — rate-limit.
    const rl = await checkWebhookRateLimit(auth.userId, auth.plan);

    if (!rl.allowed) {
      const isFree = auth.plan === "free" || rl.limit === 0;
      const errorMsg = isFree
        ? "API access requires a paid plan. Upgrade at swiftreach.app/billing"
        : `Daily limit of ${rl.limit} requests reached. Resets at ${rl.resetAt.toISOString()}`;

      await writeLog({
        apiKeyId: auth.apiKeyId,
        userId: auth.userId,
        body,
        status: "rate_limited",
        errorMessage: errorMsg,
        responseTimeMs: Date.now() - startTime,
      });

      return NextResponse.json(
        {
          success: false,
          error: isFree
            ? "API access requires Starter, Growth, or Pro plan."
            : "Daily webhook limit reached.",
          limit: rl.limit,
          used: rl.used,
          remaining: rl.remaining,
          reset_at: rl.resetAt.toISOString(),
          upgrade_url: "https://www.swiftreach.app/billing",
          docs: DOCS_URL,
        },
        {
          status: 429,
          headers: rateHeaders(rl, true),
        }
      );
    }

    // Step 3 — validate.
    const phoneRaw = typeof body.phone === "string" ? body.phone : "";
    const message = typeof body.message === "string" ? body.message : "";
    const template = typeof body.template === "string" ? body.template : "";
    const variables = (body.variables && typeof body.variables === "object"
      ? body.variables
      : {}) as Record<string, string>;
    const language =
      typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : "en_US";

    if (!phoneRaw) {
      return errorResponse(
        "Missing required field: phone",
        400,
        { field: "phone", example: "+13103459139" },
        rateHeaders(rl)
      );
    }

    const normalizedPhone = phoneRaw.replace(/\D/g, "");
    if (normalizedPhone.length < 10) {
      return errorResponse(
        "Invalid phone number. Must be at least 10 digits.",
        400,
        {
          field: "phone",
          received: phoneRaw,
          example: "+13103459139",
        },
        rateHeaders(rl)
      );
    }

    // Mode selection. Template takes priority when both are present —
    // Zapier test/sample data often populates `message` with placeholder
    // text ("Free text, can be multiline"), so a workflow set up to send
    // a template should still send the template, not the placeholder.
    // Whitespace-only values don't count.
    const useTemplate = template.trim().length > 0;
    const useFreeform = !useTemplate && message.trim().length > 0;

    if (!useTemplate && !useFreeform) {
      return errorResponse(
        'Either "message" or "template" is required.',
        400,
        {
          option_a: {
            message: "Hello {{name}}!",
            variables: { name: "John" },
          },
          option_b: {
            template: "your_template_name",
            variables: { "1": "John" },
          },
        },
        rateHeaders(rl)
      );
    }

    // Step 4 — load creds.
    const userRow = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        whatsappApiToken: true,
        whatsappPhoneNumberId: true,
        whatsappApiVersion: true,
      },
    });
    if (!userRow?.whatsappApiToken || !userRow.whatsappPhoneNumberId) {
      const msg =
        "WhatsApp account not connected. Complete setup at swiftreach.app/onboarding";
      await writeLog({
        apiKeyId: auth.apiKeyId,
        userId: auth.userId,
        body,
        status: "invalid",
        errorMessage: msg,
        responseTimeMs: Date.now() - startTime,
      });
      return errorResponse(
        msg,
        400,
        { setup_url: "https://www.swiftreach.app/onboarding" },
        rateHeaders(rl)
      );
    }
    const apiToken = decrypt(userRow.whatsappApiToken);
    if (!apiToken) {
      const msg =
        "Could not decrypt your saved API token. Reconnect WhatsApp in Settings.";
      await writeLog({
        apiKeyId: auth.apiKeyId,
        userId: auth.userId,
        body,
        status: "invalid",
        errorMessage: msg,
        responseTimeMs: Date.now() - startTime,
      });
      return errorResponse(msg, 500, undefined, rateHeaders(rl));
    }
    const creds: WhatsAppCredentials = {
      apiToken,
      phoneNumberId: userRow.whatsappPhoneNumberId,
      apiVersion: userRow.whatsappApiVersion ?? DEFAULT_API_VERSION,
    };

    // Step 5 — send via existing whatsapp.ts helpers (axios under the
    // hood; same retry/error parsing as the campaign send loop).
    //
    // The raw Meta URL + request body + error response are logged
    // inside lib/whatsapp.ts (tagged "META API PAYLOAD:" and
    // "META API ERROR:") — those show what the wire actually carries.
    // The TEMPLATE DEBUG block below is the route-side view: what
    // variables the webhook received and how they were converted to
    // template components before we handed off to sendTemplateMessage.
    let result;
    if (useFreeform) {
      result = await sendTextMessage(
        normalizedPhone,
        resolveVariables(message, variables),
        creds
      );
    } else {
      const components = buildTemplateComponentsFromVariables(variables);
      // eslint-disable-next-line no-console
      console.log(
        "TEMPLATE DEBUG:",
        JSON.stringify(
          {
            templateName: template,
            language,
            rawVariables: variables,
            builtComponents: components,
            componentCount: components.length,
            normalizedPhone,
          },
          null,
          2
        )
      );
      result = await sendTemplateMessage(
        normalizedPhone,
        template,
        language,
        components,
        creds
      );
    }

    // Route-layer view of what sendTemplateMessage / sendTextMessage
    // returned. For the underlying HTTP response from Meta, grep
    // Vercel logs for "META API PAYLOAD:" / "META API ERROR:".
    // eslint-disable-next-line no-console
    console.log(
      "WEBHOOK SEND RESULT:",
      JSON.stringify(
        {
          success: result.success,
          messageId: result.messageId ?? null,
          errorCode: result.error?.code ?? null,
          errorHttpStatus: result.error?.httpStatus ?? null,
          errorMessage: result.error?.message ?? null,
        },
        null,
        2
      )
    );

    if (!result.success) {
      const errMsg = translateMetaError(result.error);
      await writeLog({
        apiKeyId: auth.apiKeyId,
        userId: auth.userId,
        body,
        status: "failed",
        errorMessage: errMsg,
        responseTimeMs: Date.now() - startTime,
      });
      return errorResponse(
        errMsg,
        400,
        {
          meta_error_code: result.error?.code,
          meta_error_type: undefined,
        },
        rateHeaders(rl)
      );
    }

    // Step 6 — log + respond.
    await writeLog({
      apiKeyId: auth.apiKeyId,
      userId: auth.userId,
      body,
      status: "success",
      whatsappMsgId: result.messageId,
      responseTimeMs: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        success: true,
        message_id: result.messageId,
        phone: normalizedPhone,
        type: useTemplate ? "template" : "freeform",
        rate_limit: {
          limit: rl.limit,
          remaining: Math.max(0, rl.remaining - 1),
          reset_at: rl.resetAt.toISOString(),
        },
      },
      {
        headers: {
          ...rateHeaders({
            ...rl,
            remaining: Math.max(0, rl.remaining - 1),
          }),
        },
      }
    );
  } catch (err) {
    // Catch-all. Log if we know the user, then return a generic 500.
    if (auth) {
      await writeLog({
        apiKeyId: auth.apiKeyId,
        userId: auth.userId,
        body,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        responseTimeMs: Date.now() - startTime,
      });
    }
    // eslint-disable-next-line no-console
    console.error("Webhook trigger error:", err);
    return errorResponse(
      "An unexpected error occurred. Contact support@swiftreach.app if this persists.",
      500
    );
  }
}

// Build Meta template body parameters. Supports either positional
// {{1}}, {{2}}... (sorted numerically) or named variables (passed in
// insertion order). buildTemplateComponents from lib/whatsapp.ts
// expects a VariableMapping[] which is tied to the wizard's column-
// mapping flow — for the API we just construct text params directly.
function buildTemplateComponentsFromVariables(
  variables: Record<string, string>
): import("@/lib/whatsapp").TemplateComponent[] {
  const positional = Object.entries(variables)
    .filter(([k]) => /^\d+$/.test(k))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, v]) => String(v));

  const ordered =
    positional.length > 0
      ? positional
      : Object.values(variables).map((v) => String(v));

  if (ordered.length === 0) return [];
  return [
    {
      type: "body",
      parameters: ordered.map((text) => ({ type: "text" as const, text })),
    },
  ];
}

// Suppress unused-import warning — buildTemplateComponents is referenced
// by other call sites, kept here for future template-mapping work.
void buildTemplateComponents;
