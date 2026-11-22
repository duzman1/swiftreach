// WhatsApp Cloud API client. Server-side only — the access token must
// never be exposed to the browser.
//
// Every function takes a `creds` argument so credentials can be loaded per
// user from the encrypted DB column. Passing `null` falls back to the
// process env vars (legacy single-tenant mode), so internal call sites that
// haven't migrated yet keep working until they do.

import axios, { AxiosError } from "axios";

export interface SendError {
  code: string | number;
  message: string;
  httpStatus?: number;
  raw?: unknown;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: SendError;
}

// Meta's template-component parameter shape covers several kinds.
// Text is still the common body-variable case; the three media
// variants wrap the URL in a type-specific object as Meta's API
// requires. Everything optional on the union lives at the top level
// so TS narrowing on `type` gives the right suggestion.
export type TemplateParameter =
  | { type: "text"; text: string }
  | { type: "image"; image: { link: string } }
  | { type: "video"; video: { link: string } }
  | { type: "document"; document: { link: string; filename?: string } };

export interface TemplateComponent {
  type: "header" | "body" | "footer" | "button";
  parameters?: TemplateParameter[];
  sub_type?: string;
  index?: number;
}

// Campaign-level media header config. One header per campaign — same
// media sent to every contact. Image/video require just link;
// document additionally accepts a filename Meta shows on the receiver.
export type HeaderMediaType = "image" | "video" | "document";
export interface HeaderMedia {
  type: HeaderMediaType;
  link: string;      // https:// URL; validated at the API boundary
  filename?: string; // only used for type:"document"
}

/**
 * Single source of truth for the default Meta Graph API version. When Meta
 * releases a new version, change it here and every fallback in the codebase
 * picks it up automatically. A user's saved `whatsappApiVersion` (set in
 * Settings) always overrides this default.
 */
export const DEFAULT_API_VERSION = "v25.0";

/**
 * Per-call WhatsApp credentials. Pass `null` to use the legacy env-based
 * config; pass a populated object to use a specific user's credentials.
 */
export interface WhatsAppCredentials {
  apiToken: string;
  phoneNumberId: string;
  apiVersion?: string;
}

function readEnv(name: string, fallback?: string): string {
  // Trim defensively — common gotcha: stray space after `=` in .env files.
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback ?? "";
}

function envCreds(): WhatsAppCredentials {
  return {
    apiToken: readEnv("WHATSAPP_API_TOKEN"),
    phoneNumberId: readEnv("WHATSAPP_PHONE_NUMBER_ID"),
    apiVersion: readEnv("WHATSAPP_API_VERSION", DEFAULT_API_VERSION),
  };
}

function resolveCreds(creds?: WhatsAppCredentials | null): WhatsAppCredentials {
  if (creds) {
    return {
      apiToken: creds.apiToken,
      phoneNumberId: creds.phoneNumberId,
      apiVersion: creds.apiVersion?.trim() || DEFAULT_API_VERSION,
    };
  }
  return envCreds();
}

function graphUrl(apiVersion: string, path: string): string {
  return `https://graph.facebook.com/${apiVersion}/${path.replace(/^\//, "")}`;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function parseAxiosError(err: unknown): SendError {
  if (err instanceof AxiosError) {
    const data = err.response?.data;
    const metaErr = data?.error;
    return {
      code: metaErr?.code ?? err.code ?? "unknown",
      message: metaErr?.message ?? err.message ?? "Unknown error",
      httpStatus: err.response?.status,
      raw: data,
    };
  }
  return {
    code: "unknown",
    message: err instanceof Error ? err.message : String(err),
  };
}

function configMissingError(): SendError {
  return {
    code: "CONFIG_MISSING",
    message:
      "WhatsApp API credentials are not configured. Add them in Settings.",
  };
}

// ── Send free-form text message (Mode A) ─────────────────────────────────────
export async function sendTextMessage(
  phoneNumber: string,
  messageText: string,
  creds?: WhatsAppCredentials | null
): Promise<SendResult> {
  const c = resolveCreds(creds);
  if (!c.apiToken || !c.phoneNumberId) {
    return { success: false, error: configMissingError() };
  }
  try {
    const response = await axios.post(
      graphUrl(c.apiVersion!, `${c.phoneNumberId}/messages`),
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: { body: messageText },
      },
      { headers: authHeader(c.apiToken), timeout: 30000 }
    );
    const messageId = response.data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err) {
    return { success: false, error: parseAxiosError(err) };
  }
}

// ── Send Meta-approved template (Mode B) ─────────────────────────────────────
export async function sendTemplateMessage(
  phoneNumber: string,
  templateName: string,
  language: string,
  components: TemplateComponent[],
  creds?: WhatsAppCredentials | null
): Promise<SendResult> {
  const c = resolveCreds(creds);
  if (!c.apiToken || !c.phoneNumberId) {
    return { success: false, error: configMissingError() };
  }
  const url = graphUrl(c.apiVersion!, `${c.phoneNumberId}/messages`);
  const body = {
    messaging_product: "whatsapp",
    to: phoneNumber,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };
  // DEBUG: log the exact URL + body we're about to POST so we can see
  // what Meta actually receives. The matching log in the campaign send
  // route shows the caller-side view — both are tagged so they're easy
  // to grep in Vercel logs.
  // eslint-disable-next-line no-console
  console.log(
    "META API PAYLOAD:",
    JSON.stringify(
      {
        url,
        apiVersion: c.apiVersion,
        phoneNumberId: c.phoneNumberId,
        body,
      },
      null,
      2
    )
  );
  try {
    const response = await axios.post(url, body, {
      headers: authHeader(c.apiToken),
      timeout: 30000,
    });
    const messageId = response.data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err) {
    const parsed = parseAxiosError(err);
    // DEBUG: surface Meta's error response so we can see exactly what
    // they complained about (often more detail than the parsed code).
    // eslint-disable-next-line no-console
    console.log(
      "META API ERROR:",
      JSON.stringify(
        {
          template: templateName,
          to: phoneNumber,
          httpStatus: parsed.httpStatus,
          code: parsed.code,
          message: parsed.message,
        },
        null,
        2
      )
    );
    return { success: false, error: parsed };
  }
}

// ── Retry wrapper: exponential backoff on 429/5xx, no retry on 4xx ───────────
export async function sendWithRetry(
  send: () => Promise<SendResult>,
  maxRetries = 3
): Promise<SendResult> {
  let attempt = 0;
  while (true) {
    const result = await send();
    if (result.success) return result;

    const status = result.error?.httpStatus;
    const retriable =
      status === 429 || (status !== undefined && status >= 500 && status < 600);

    if (!retriable || attempt >= maxRetries - 1) return result;

    const delayMs = 1000 * Math.pow(2, attempt); // 1s → 2s → 4s
    await new Promise((r) => setTimeout(r, delayMs));
    attempt++;
  }
}

// ── Build Meta template components from variable map + row ───────────────────
export interface VariableMapping {
  metaVar: string; // "1", "2", etc.
  source: "column" | "static";
  column?: string;
  value?: string;
}

export function buildTemplateComponents(
  variableMap: VariableMapping[],
  rowData: Record<string, string>,
  staticVars: Record<string, string> = {},
  headerMedia?: HeaderMedia | null
): TemplateComponent[] {
  const components: TemplateComponent[] = [];

  // Header component if the template declares one. Media wrap shape
  // follows Meta's API exactly — see
  // developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
  // under "message template object → header parameters". Document
  // supports an optional filename field; image + video do not.
  if (headerMedia && headerMedia.link) {
    let param: TemplateParameter;
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

  if (variableMap.length > 0) {
    // Sort by metaVar number so {{1}} lands first, {{2}} second, etc.
    const ordered = [...variableMap].sort(
      (a, b) => Number(a.metaVar) - Number(b.metaVar)
    );
    const parameters: TemplateParameter[] = ordered.map((m) => {
      let text = "";
      if (m.source === "column" && m.column) {
        text = rowData[m.column] ?? "";
      } else if (m.source === "static") {
        text = m.value ?? "";
      }
      // staticVars override (matches the spec's precedence)
      if (m.column && rowData[m.column] === undefined && staticVars[m.column]) {
        text = staticVars[m.column];
      }
      return { type: "text" as const, text: text === "" ? " " : text };
    });
    components.push({ type: "body", parameters });
  }

  return components;
}

// ── Validate a user-supplied header media config ─────────────────────────
// Used at every API boundary that accepts headerMedia — campaigns,
// scheduled, single-send, trigger. Centralised so the rules stay in one
// place. Returns the normalised object or an error string.
export function validateHeaderMedia(
  raw: unknown
): { ok: true; value: HeaderMedia | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object") {
    return { ok: false, error: "headerMedia must be an object" };
  }
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (type !== "image" && type !== "video" && type !== "document") {
    return {
      ok: false,
      error: "headerMedia.type must be 'image', 'video', or 'document'",
    };
  }
  if (typeof r.link !== "string" || r.link.trim().length === 0) {
    return { ok: false, error: "headerMedia.link is required" };
  }
  const link = r.link.trim();
  if (link.length > 2048) {
    return { ok: false, error: "headerMedia.link is too long (max 2048)" };
  }
  try {
    const u = new URL(link);
    if (u.protocol !== "https:") {
      return { ok: false, error: "headerMedia.link must use https://" };
    }
  } catch {
    return { ok: false, error: "headerMedia.link is not a valid URL" };
  }
  let filename: string | undefined;
  if (type === "document") {
    if (r.filename !== undefined) {
      if (typeof r.filename !== "string") {
        return {
          ok: false,
          error: "headerMedia.filename must be a string",
        };
      }
      const f = r.filename.trim();
      if (f.length > 240) {
        return {
          ok: false,
          error: "headerMedia.filename is too long (max 240)",
        };
      }
      if (f.length > 0) filename = f;
    }
  }
  return {
    ok: true,
    value: { type, link, ...(filename ? { filename } : {}) },
  };
}

// ── Fetch info on the configured phone number — used for Test Connection ─────
export interface ConnectionInfo {
  ok: boolean;
  phoneNumberId?: string;
  /**
   * Meta only returns display_phone_number for fully-provisioned numbers.
   * Test/sandbox numbers and some WABA configurations omit it — we no
   * longer request it explicitly (caused [100] "nonexisting field"
   * errors), so this is optional and may be undefined even on success.
   */
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  platformType?: string;
  error?: SendError;
}

export async function getPhoneNumberInfo(
  creds?: WhatsAppCredentials | null
): Promise<ConnectionInfo> {
  const c = resolveCreds(creds);
  if (!c.apiToken || !c.phoneNumberId) {
    return { ok: false, error: configMissingError() };
  }
  try {
    // Safe field set — Meta rejects display_phone_number on some
    // accounts with [100] (#100) Tried accessing nonexisting field.
    // id, verified_name, quality_rating, platform_type all work
    // across Cloud API, On-Premises, sandbox, and live numbers.
    const verifyUrl = new URL(graphUrl(c.apiVersion!, c.phoneNumberId));
    verifyUrl.searchParams.set(
      "fields",
      "id,verified_name,quality_rating,platform_type"
    );
    const response = await axios.get(verifyUrl.toString(), {
      headers: authHeader(c.apiToken),
      timeout: 15000,
    });
    return {
      ok: true,
      phoneNumberId: c.phoneNumberId,
      // Meta no longer returns this in the safe field set; keep the
      // key in the response shape so callers don't break.
      displayPhoneNumber: response.data?.display_phone_number,
      verifiedName: response.data?.verified_name,
      qualityRating: response.data?.quality_rating,
      platformType: response.data?.platform_type,
    };
  } catch (err) {
    return { ok: false, error: parseAxiosError(err) };
  }
}
