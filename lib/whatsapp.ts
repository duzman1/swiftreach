// WhatsApp Cloud API client. Server-side only — the access token must
// never be exposed to the browser.

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

export interface TemplateComponent {
  type: "header" | "body" | "footer" | "button";
  parameters?: Array<{ type: "text"; text: string }>;
  sub_type?: string;
  index?: number;
}

function readEnv(name: string, fallback?: string): string {
  // Trim defensively — common gotcha: stray space after `=` in .env files.
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback ?? "";
}

function getConfig() {
  return {
    token: readEnv("WHATSAPP_API_TOKEN"),
    phoneNumberId: readEnv("WHATSAPP_PHONE_NUMBER_ID"),
    wabaId: readEnv("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    apiVersion: readEnv("WHATSAPP_API_VERSION", "v19.0"),
  };
}

function graphUrl(path: string): string {
  const { apiVersion } = getConfig();
  return `https://graph.facebook.com/${apiVersion}/${path.replace(/^\//, "")}`;
}

function authHeader() {
  const { token } = getConfig();
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

// ── Send free-form text message (Mode A) ─────────────────────────────────────
export async function sendTextMessage(
  phoneNumber: string,
  messageText: string
): Promise<SendResult> {
  const cfg = getConfig();
  if (!cfg.token || !cfg.phoneNumberId) {
    return {
      success: false,
      error: {
        code: "CONFIG_MISSING",
        message:
          "WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set in .env.local.",
      },
    };
  }
  try {
    const response = await axios.post(
      graphUrl(`${cfg.phoneNumberId}/messages`),
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: { body: messageText },
      },
      { headers: authHeader(), timeout: 30000 }
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
  components: TemplateComponent[]
): Promise<SendResult> {
  const cfg = getConfig();
  if (!cfg.token || !cfg.phoneNumberId) {
    return {
      success: false,
      error: {
        code: "CONFIG_MISSING",
        message:
          "WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set in .env.local.",
      },
    };
  }
  try {
    const response = await axios.post(
      graphUrl(`${cfg.phoneNumberId}/messages`),
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components,
        },
      },
      { headers: authHeader(), timeout: 30000 }
    );
    const messageId = response.data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err) {
    return { success: false, error: parseAxiosError(err) };
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
  staticVars: Record<string, string> = {}
): TemplateComponent[] {
  if (variableMap.length === 0) return [];
  // Sort by metaVar number so {{1}} lands first, {{2}} second, etc.
  const ordered = [...variableMap].sort(
    (a, b) => Number(a.metaVar) - Number(b.metaVar)
  );
  const parameters = ordered.map((m) => {
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
  return [{ type: "body", parameters }];
}

// ── Fetch info on the configured phone number — used for Test Connection ─────
export interface ConnectionInfo {
  ok: boolean;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  error?: SendError;
}

export async function getPhoneNumberInfo(): Promise<ConnectionInfo> {
  const cfg = getConfig();
  if (!cfg.token || !cfg.phoneNumberId) {
    return {
      ok: false,
      error: {
        code: "CONFIG_MISSING",
        message:
          "WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set in .env.local.",
      },
    };
  }
  try {
    const response = await axios.get(graphUrl(cfg.phoneNumberId), {
      headers: authHeader(),
      timeout: 15000,
      params: {
        fields: "display_phone_number,verified_name,quality_rating",
      },
    });
    return {
      ok: true,
      phoneNumberId: cfg.phoneNumberId,
      displayPhoneNumber: response.data?.display_phone_number,
      verifiedName: response.data?.verified_name,
      qualityRating: response.data?.quality_rating,
    };
  } catch (err) {
    return { ok: false, error: parseAxiosError(err) };
  }
}
