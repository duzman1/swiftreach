// Test the user's WhatsApp credentials against Meta. Two modes:
//   1. POST with body { apiToken, phoneNumberId, apiVersion? } — used by the
//      onboarding form to verify creds BEFORE saving them. Caller is
//      authenticated but we don't touch the DB.
//   2. POST with empty body — uses the user's already-saved credentials.

import { NextRequest, NextResponse } from "next/server";
import { getPhoneNumberInfo, DEFAULT_API_VERSION, type WhatsAppCredentials } from "@/lib/whatsapp";
import { requireUser } from "@/lib/auth";
import { decrypt } from "@/lib/encrypt";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

interface TestBody {
  apiToken?: string;
  phoneNumberId?: string;
  apiVersion?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Auth required either way — only signed-in users can test connections.
    const user = await requireUser();

    let body: TestBody = {};
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      // Empty body or non-JSON — fine, fall through to saved-creds mode.
    }

    let creds: WhatsAppCredentials;

    // Mode 1: caller provided creds in body — test those.
    if (body.apiToken && body.phoneNumberId) {
      creds = {
        apiToken: body.apiToken.trim(),
        phoneNumberId: body.phoneNumberId.trim(),
        apiVersion: body.apiVersion?.trim() || DEFAULT_API_VERSION,
      };
    }
    // Mode 2: use the user's saved creds.
    else if (user.whatsappApiToken && user.whatsappPhoneNumberId) {
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
      creds = {
        apiToken: decrypted,
        phoneNumberId: user.whatsappPhoneNumberId,
        apiVersion: user.whatsappApiVersion ?? DEFAULT_API_VERSION,
      };
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No WhatsApp credentials saved yet. Add them in Settings or pass them in the request body.",
        },
        { status: 200 }
      );
    }

    const info = await getPhoneNumberInfo(creds);
    if (info.ok) {
      return NextResponse.json({
        ok: true,
        phoneNumberId: info.phoneNumberId,
        displayPhoneNumber: info.displayPhoneNumber,
        verifiedName: info.verifiedName,
        qualityRating: info.qualityRating,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: info.error?.message ?? "Unknown error",
        code: info.error?.code,
        httpStatus: info.error?.httpStatus,
      },
      { status: 200 }
    );
  } catch (err) {
    return handleApiError(err, "POST /api/settings/test-connection");
  }
}
