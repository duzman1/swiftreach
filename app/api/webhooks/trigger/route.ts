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
  validateHeaderMedia,
  DEFAULT_API_VERSION,
  type WhatsAppCredentials,
  type SendError,
} from "@/lib/whatsapp";
import { checkSuppression } from "@/lib/checkSuppression";
import { recordOutboundMessage } from "@/lib/outboundMessage";

export const dynamic = "force-dynamic";

interface TriggerBody {
  phone?: string;
  message?: string;
  template?: string;
  // Object form is preferred; string form is accepted because Zapier
  // (and some no-code platforms) serialize nested JSON to a string.
  variables?: Record<string, unknown> | string;
  language?: string;
  api_key?: string;
  // Caller-supplied correlation id. Stored verbatim on OutboundMessage
  // and echoed back in every outbound webhook event (message.sent /
  // delivered / read / failed) so an integration can tie the event to
  // its own record without needing to track wamids. Fully optional.
  external_id?: string;
  // Optional media header for templates that declare one. Ignored for
  // freeform sends (no Meta template component to attach to).
  // Shape: { type: "image"|"video"|"document", link, filename? }
  header_media?: unknown;
}

// Validation cap on external_id. Matches most downstream systems'
// id-field lengths (Stripe metadata values, GHL contact external_id,
// HubSpot record ids). Long enough for UUIDs + namespaced ids,
// short enough that a megabyte of garbage can't be smuggled into
// the DB via this field.
const MAX_EXTERNAL_ID_LEN = 128;

function validateExternalId(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "external_id must be a string" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_EXTERNAL_ID_LEN) {
    return {
      ok: false,
      error: `external_id must be ${MAX_EXTERNAL_ID_LEN} characters or fewer`,
    };
  }
  // Reject control characters (anything below U+0020 except tab, and
  // DEL). These aren't valid in any real id scheme and tend to be
  // smuggled in via copy-paste or encoding bugs. Everything else —
  // Unicode letters, dashes, underscores, colons, dots — passes.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(trimmed)) {
    return { ok: false, error: "external_id contains invalid control characters" };
  }
  return { ok: true, value: trimmed };
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

// Accept either a JSON object or a JSON-encoded string for `variables`
// and return a flat `Record<string, string>`. All values are coerced
// to strings — Meta template body parameters are text-only, and a
// numeric variable (e.g. `{"1": 100}`) would otherwise be passed
// through as a number and reject downstream. Arrays and `null` are
// rejected and reported via console.warn; the caller falls back to {}.
function coerceVariables(input: unknown): Record<string, string> {
  if (input == null) return {};

  let value: unknown = input;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return {};
    try {
      value = JSON.parse(trimmed);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(
        "[webhook trigger] Could not parse variables as JSON:",
        trimmed
      );
      return {};
    }
  }

  if (
    value == null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[webhook trigger] variables did not resolve to a plain object:",
      value
    );
    return {};
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
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

    // Validate external_id up front — a clean 400 before we touch
    // Meta or the DB. Fully optional; result.value === null when
    // omitted or empty, which flows through to OutboundMessage as
    // null and dispatcher payloads as null.
    const extIdResult = validateExternalId(body.external_id);
    if (!extIdResult.ok) {
      return errorResponse(extIdResult.error, 400);
    }
    const externalId = extIdResult.value;

    // Validate header_media up front too. Null when omitted; when
    // present, it's a {type, link, filename?} object that will be
    // prepended as a Meta header component in the template send below.
    const headerMediaResult = validateHeaderMedia(body.header_media);
    if (!headerMediaResult.ok) {
      return errorResponse(headerMediaResult.error, 400);
    }
    const headerMediaValue = headerMediaResult.value;

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
    // Variables can arrive as either a real JSON object (preferred,
    // /developers docs example) OR a JSON-encoded string (Zapier and
    // a few other no-code platforms serialize nested objects this
    // way). Accept both, coerce values to strings since Meta template
    // body parameters MUST be text. Anything that doesn't resolve to
    // a plain object becomes {} with a warning — the request still
    // proceeds, and the user will see unresolved {{placeholders}} in
    // the delivered message rather than a silent send.
    const variables = coerceVariables(body.variables);
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

    // Compliance (finding 7). Webhook-triggered sends were previously
    // ungated. A Zap that fires on new form submissions can easily
    // include a phone that had earlier texted STOP — we must refuse.
    // Returns 409 with a structured error so the calling platform
    // (Zapier / Make / custom code) sees a clear "why" and can branch.
    const suppression = await checkSuppression(prisma, {
      userId: auth.userId,
      phoneNumber: normalizedPhone,
      surface: "webhook",
    });
    if (suppression.suppress) {
      const msg =
        suppression.reason === "do_not_contact"
          ? `${normalizedPhone} is on this user's do-not-contact list. Send refused.`
          : `${normalizedPhone} has opted out of messages from this account. Send refused.`;
      // The WebhookLog status enum doesn't have "suppressed" today —
      // classify as "invalid" (semantically: request refused before
      // Meta ever saw it) and put the actual reason in errorMessage.
      // SuppressionLog carries the compliance audit; WebhookLog is
      // just per-request debugging for the API caller.
      await writeLog({
        apiKeyId: auth.apiKeyId,
        userId: auth.userId,
        body,
        status: "invalid",
        errorMessage: `Suppressed: ${msg}`,
        responseTimeMs: Date.now() - startTime,
      });
      return errorResponse(
        msg,
        409,
        { reason: suppression.reason, code: "SUPPRESSED" },
        rateHeaders(rl)
      );
    }

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
      const components = buildTemplateComponentsFromVariables(variables, headerMediaValue);
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
      // Also record in the unified outbound ledger — a failed dispatch
      // is still an "outbound attempt" the dispatcher may need to emit
      // a message.failed event for. externalId passthrough lands in
      // Step 2; here it's always null.
      try {
        await recordOutboundMessage(prisma, {
          userId: auth.userId,
          source: "TRIGGER",
          phone: normalizedPhone,
          whatsappMsgId: null,
          externalId,
          status: "failed",
          errorMessage: errMsg,
        });
      } catch {
        /* non-fatal */
      }
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
    // Unified ledger entry for the successful dispatch. externalId
    // lands on OutboundMessage.externalId so Step 4's dispatcher can
    // echo it back in every outbound event tied to this wamid.
    try {
      await recordOutboundMessage(prisma, {
        userId: auth.userId,
        source: "TRIGGER",
        phone: normalizedPhone,
        whatsappMsgId: result.messageId ?? null,
        externalId,
        status: "sent",
      });
    } catch {
      /* non-fatal */
    }

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
//
// headerMedia is optional; when present a type:"header" component is
// prepended with the correct image/video/document wrapper object so
// Meta accepts templates that declare a media header.
function buildTemplateComponentsFromVariables(
  variables: Record<string, string>,
  headerMedia?: import("@/lib/whatsapp").HeaderMedia | null
): import("@/lib/whatsapp").TemplateComponent[] {
  const components: import("@/lib/whatsapp").TemplateComponent[] = [];

  if (headerMedia && headerMedia.link) {
    let param: import("@/lib/whatsapp").TemplateParameter;
    if (headerMedia.type === "image") {
      param = { type: "image", image: { link: headerMedia.link } };
    } else if (headerMedia.type === "video") {
      param = { type: "video", video: { link: headerMedia.link } };
    } else {
      param = {
        type: "document",
        document: {
          link: headerMedia.link,
          ...(headerMedia.filename ? { filename: headerMedia.filename } : {}),
        },
      };
    }
    components.push({ type: "header", parameters: [param] });
  }

  const positional = Object.entries(variables)
    .filter(([k]) => /^\d+$/.test(k))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, v]) => String(v));

  const ordered =
    positional.length > 0
      ? positional
      : Object.values(variables).map((v) => String(v));

  if (ordered.length > 0) {
    components.push({
      type: "body",
      parameters: ordered.map((text) => ({ type: "text" as const, text })),
    });
  }

  return components;
}

// Suppress unused-import warning — buildTemplateComponents is referenced
// by other call sites, kept here for future template-mapping work.
void buildTemplateComponents;
