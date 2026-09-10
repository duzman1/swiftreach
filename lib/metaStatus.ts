// Meta Cloud API status helpers — template approval + phone-number
// quality. Used by the compliance dashboard and the wizard's
// template picker so a template that's been REJECTED or PAUSED
// gets caught at build time, not at send time (per spec).
//
// The two endpoints hit here:
//   GET /{waba-id}/message_templates?fields=name,status,category,
//       language,quality_score,rejected_reason  — template list
//   GET /{waba-id}/phone_numbers?fields=display_phone_number,
//       verified_name,quality_rating,messaging_limit_tier,name_status
//                                                — number quality
//
// Both are available on every Cloud API plan — no extra permission,
// no tier gate. Verified during audit before writing this code.
//
// Errors: Meta timeouts / auth failures / rate limits are caught and
// returned as { ok: false, error, code } so callers can render a
// diagnostic instead of a blank tile. NEVER throw — the compliance
// dashboard falling over just because Meta was slow would be worse
// than showing "temporarily unavailable".

import axios, { AxiosError } from "axios";
import { decrypt } from "./encrypt";
import { DEFAULT_API_VERSION } from "./whatsapp";
import { prisma } from "./prisma";

/** Template approval states as Meta returns them. Documented here
 *  because we branch on the exact strings. */
export type TemplateStatus =
  | "APPROVED"
  | "IN_APPEAL"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "LIMITED"
  | "PENDING_DELETION";

/** Phone-number quality rating from Meta. UNKNOWN means Meta hasn't
 *  scored the number yet (usually a very new number). */
export type QualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

export interface MetaTemplateStatus {
  id: string;
  name: string;
  status: TemplateStatus;
  category: string;
  language: string;
  qualityScore: string | null;   // GREEN | YELLOW | RED | null
  rejectedReason: string | null; // reason string from Meta, or null
}

export interface MetaPhoneStatus {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: QualityRating;
  messagingLimitTier: string; // TIER_50 | TIER_250 | ... | TIER_UNLIMITED
  nameStatus: string;         // APPROVED | AVAILABLE_WITHOUT_REVIEW | ...
}

export interface MetaFetchError {
  ok: false;
  error: string;
  code: number | string | null;
}

export interface MetaCreds {
  apiToken: string; // decrypted, NEVER logged
  wabaId: string;
  apiVersion: string;
}

/** Load + decrypt the caller's Meta creds. Returns null if the user
 *  hasn't connected WhatsApp yet — the caller should render "not
 *  connected" rather than an error in that case. */
export async function loadMetaCreds(userId: string): Promise<MetaCreds | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      whatsappApiToken: true,
      whatsappBusinessAccountId: true,
      whatsappApiVersion: true,
    },
  });
  if (!user?.whatsappApiToken || !user.whatsappBusinessAccountId) return null;
  const token = decrypt(user.whatsappApiToken);
  if (!token) return null;
  return {
    apiToken: token,
    wabaId: user.whatsappBusinessAccountId,
    apiVersion: user.whatsappApiVersion?.trim() || DEFAULT_API_VERSION,
  };
}

/** Fetch every template on the user's WABA with status metadata.
 *  Paginated by Meta; we cap at 100 for the dashboard tile — a user
 *  with more than 100 templates has bigger UX questions than
 *  pagination on a status summary. */
export async function fetchTemplateStatuses(
  creds: MetaCreds
): Promise<MetaTemplateStatus[] | MetaFetchError> {
  const url =
    `https://graph.facebook.com/${creds.apiVersion}/` +
    `${creds.wabaId}/message_templates` +
    // quality_score is documented as {score: GREEN|YELLOW|RED, date}
    // but Meta returns null for templates it hasn't scored — most
    // templates in fact. Include it so we surface the score when it
    // exists, and treat null as "not scored yet".
    `?fields=name,status,category,language,quality_score,rejected_reason&limit=100`;

  try {
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}` },
      timeout: 15_000,
    });
    const raw = (resp.data?.data ?? []) as Array<{
      id: string;
      name: string;
      status: string;
      category: string;
      language: string;
      quality_score?: { score?: string } | null;
      rejected_reason?: string | null;
    }>;
    return raw.map((t) => ({
      id: t.id,
      name: t.name,
      status: (t.status as TemplateStatus) ?? "PENDING",
      category: t.category ?? "",
      language: t.language ?? "",
      qualityScore: t.quality_score?.score ?? null,
      rejectedReason: t.rejected_reason ?? null,
    }));
  } catch (err) {
    return toFetchError(err, "Meta templates fetch");
  }
}

/** Fetch every phone number on the user's WABA with quality rating
 *  + tier. A WABA usually has 1-5 numbers; we cap at 25 defensively. */
export async function fetchPhoneStatuses(
  creds: MetaCreds
): Promise<MetaPhoneStatus[] | MetaFetchError> {
  const url =
    `https://graph.facebook.com/${creds.apiVersion}/` +
    `${creds.wabaId}/phone_numbers` +
    `?fields=display_phone_number,verified_name,quality_rating,messaging_limit,name_status&limit=25`;

  try {
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}` },
      timeout: 15_000,
    });
    const raw = (resp.data?.data ?? []) as Array<{
      id: string;
      display_phone_number: string;
      verified_name: string;
      quality_rating?: string;
      messaging_limit?: string;
      name_status?: string;
    }>;
    return raw.map((p) => ({
      id: p.id,
      displayPhoneNumber: p.display_phone_number ?? "",
      verifiedName: p.verified_name ?? "",
      qualityRating: (p.quality_rating as QualityRating) ?? "UNKNOWN",
      // Meta's field is `messaging_limit`, values look like "TIER_1K"
      // — we surface the raw value so the UI can render it verbatim
      // rather than mis-mapping.
      messagingLimitTier: p.messaging_limit ?? "TIER_UNKNOWN",
      nameStatus: p.name_status ?? "UNKNOWN",
    }));
  } catch (err) {
    return toFetchError(err, "Meta phone numbers fetch");
  }
}

/** Convenience: is this template safe to build a campaign against?
 *  APPROVED = green light; everything else = surface it. LIMITED,
 *  PAUSED, and IN_APPEAL still let sends through (Meta accepts them,
 *  but with restrictions) so we warn rather than block. REJECTED,
 *  DISABLED, PENDING_DELETION would fail at Meta's end — block
 *  the campaign build there. PENDING isn't sendable yet either. */
export function isTemplateSendable(status: TemplateStatus): {
  sendable: boolean;
  severity: "ok" | "warn" | "block";
  message?: string;
} {
  switch (status) {
    case "APPROVED":
      return { sendable: true, severity: "ok" };
    case "PAUSED":
      return {
        sendable: true,
        severity: "warn",
        message: "This template is paused by Meta. Sends may go through but delivery isn't guaranteed.",
      };
    case "LIMITED":
      return {
        sendable: true,
        severity: "warn",
        message: "This template is limited by Meta. Send rate may be throttled.",
      };
    case "IN_APPEAL":
      return {
        sendable: true,
        severity: "warn",
        message: "This template is currently under appeal.",
      };
    case "PENDING":
      return {
        sendable: false,
        severity: "block",
        message: "This template is still awaiting Meta approval. Wait for it to be approved before building a campaign.",
      };
    case "REJECTED":
      return {
        sendable: false,
        severity: "block",
        message: "This template was rejected by Meta. Edit and resubmit before using it.",
      };
    case "DISABLED":
      return {
        sendable: false,
        severity: "block",
        message: "This template is disabled. Meta will not deliver messages built on it.",
      };
    case "PENDING_DELETION":
      return {
        sendable: false,
        severity: "block",
        message: "This template is scheduled for deletion.",
      };
    default:
      return {
        sendable: false,
        severity: "block",
        message: `Template status \"${status}\" isn't recognised as sendable.`,
      };
  }
}

function toFetchError(err: unknown, context: string): MetaFetchError {
  const axiosErr = err as AxiosError<{ error?: { message?: string; code?: number } }>;
  const metaMsg =
    axiosErr.response?.data?.error?.message ??
    (axiosErr.message ? axiosErr.message : "Unknown error");
  return {
    ok: false,
    error: `${context}: ${metaMsg}`,
    code: axiosErr.response?.data?.error?.code ?? axiosErr.response?.status ?? null,
  };
}
