// Per-user settings: Meta API credentials + defaults.
//
// GET returns the current user's settings with the API token MASKED — the
// raw token is never sent to the browser. The masked form (`EAAR••••••ZDZD`)
// is good enough to confirm "yes a token is set", and the "Test Connection"
// button proves it works.
//
// PUT accepts new values. The api token, if present and non-empty, is
// AES-256-CBC encrypted before being stored. An empty string for the token
// field means "leave it as-is" (don't overwrite); a literal `null` means
// "clear it".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/apiResponse";
import { encrypt, maskToken } from "@/lib/encrypt";
import { DEFAULT_API_VERSION } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

interface UpdateBody {
  whatsappApiToken?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessAccountId?: string | null;
  whatsappApiVersion?: string | null;
  webhookVerifyToken?: string | null;
  defaultCountryCode?: string;
  defaultDelayMs?: number;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({
      ok: true,
      settings: {
        // Status flag — lets the UI show the "Connected" badge without leaking
        // the actual token bytes.
        whatsappConnected: Boolean(
          user.whatsappApiToken && user.whatsappPhoneNumberId
        ),
        whatsappPhoneNumberId: user.whatsappPhoneNumberId ?? "",
        whatsappBusinessAccountId: user.whatsappBusinessAccountId ?? "",
        whatsappApiVersion: user.whatsappApiVersion ?? DEFAULT_API_VERSION,
        webhookVerifyToken: user.webhookVerifyToken ?? "",
        // For display only — show that something is set, not the value.
        whatsappApiTokenMasked: user.whatsappApiToken
          ? maskToken("set") // we don't decrypt for the UI; just show "is set"
          : "",
        defaultCountryCode: user.defaultCountryCode,
        defaultDelayMs: user.defaultDelayMs,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/user/settings");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    let body: UpdateBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const data: Record<string, unknown> = {};

    // Token: undefined → don't touch. "" → don't touch (preserves existing).
    // null → clear. non-empty string → encrypt and store.
    if (body.whatsappApiToken === null) {
      data.whatsappApiToken = null;
    } else if (typeof body.whatsappApiToken === "string" && body.whatsappApiToken.trim() !== "") {
      data.whatsappApiToken = encrypt(body.whatsappApiToken.trim());
    }

    if (body.whatsappPhoneNumberId !== undefined) {
      data.whatsappPhoneNumberId =
        body.whatsappPhoneNumberId === null
          ? null
          : String(body.whatsappPhoneNumberId).trim();
    }
    if (body.whatsappBusinessAccountId !== undefined) {
      data.whatsappBusinessAccountId =
        body.whatsappBusinessAccountId === null
          ? null
          : String(body.whatsappBusinessAccountId).trim();
    }
    if (body.whatsappApiVersion !== undefined) {
      const v = String(body.whatsappApiVersion ?? "").trim();
      data.whatsappApiVersion = v || DEFAULT_API_VERSION;
    }
    if (body.webhookVerifyToken !== undefined) {
      data.webhookVerifyToken =
        body.webhookVerifyToken === null
          ? null
          : String(body.webhookVerifyToken).trim();
    }

    if (body.defaultCountryCode !== undefined) {
      const cc = String(body.defaultCountryCode).replace(/\D/g, "");
      if (!cc) return bad("Default country code must contain digits");
      data.defaultCountryCode = cc;
    }
    if (body.defaultDelayMs !== undefined) {
      const v = Number(body.defaultDelayMs);
      if (!Number.isFinite(v) || v < 500 || v > 60000) {
        return bad("Default delay must be between 500 and 60000 ms");
      }
      data.defaultDelayMs = Math.round(v);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return NextResponse.json({
      ok: true,
      settings: {
        whatsappConnected: Boolean(
          updated.whatsappApiToken && updated.whatsappPhoneNumberId
        ),
        whatsappPhoneNumberId: updated.whatsappPhoneNumberId ?? "",
        whatsappBusinessAccountId: updated.whatsappBusinessAccountId ?? "",
        whatsappApiVersion: updated.whatsappApiVersion ?? DEFAULT_API_VERSION,
        webhookVerifyToken: updated.webhookVerifyToken ?? "",
        whatsappApiTokenMasked: updated.whatsappApiToken ? maskToken("set") : "",
        defaultCountryCode: updated.defaultCountryCode,
        defaultDelayMs: updated.defaultDelayMs,
      },
    });
  } catch (err) {
    return handleApiError(err, "PUT /api/user/settings");
  }
}

// POST is an alias for PUT — same behavior. The onboarding flow specs POST,
// the Settings page uses PUT, both keep working. Keep this thin so the two
// stay identical going forward.
export async function POST(req: NextRequest) {
  return PUT(req);
}
