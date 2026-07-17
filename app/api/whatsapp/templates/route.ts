// GET /{waba_id}/message_templates on the user's connected WABA.
//
// This is the only route that actually exercises the
// `whatsapp_business_management` permission — required to read the
// user's approved WhatsApp template library so we can display it on
// /whatsapp-templates (and, future, offer it as a picker inside the
// send wizard).
//
// The token is decrypted server-side and never returned to the browser.
// Response shape mirrors Meta's Graph response, trimmed to fields we
// actually render.

import { NextResponse } from "next/server";
import axios, { AxiosError } from "axios";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { decrypt } from "@/lib/encrypt";
import { DEFAULT_API_VERSION } from "@/lib/whatsapp";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: unknown;
  }>;
}

export async function GET() {
  try {
    const userId = await requireUserId();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappApiToken: true,
        whatsappBusinessAccountId: true,
        whatsappApiVersion: true,
      },
    });

    if (!user?.whatsappApiToken || !user.whatsappBusinessAccountId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "WhatsApp account not connected. Complete setup in Settings.",
        },
        { status: 400 }
      );
    }

    const token = decrypt(user.whatsappApiToken);
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not decrypt your saved API token. Reconnect WhatsApp in Settings.",
        },
        { status: 500 }
      );
    }

    const apiVersion = user.whatsappApiVersion?.trim() || DEFAULT_API_VERSION;
    const url =
      `https://graph.facebook.com/${apiVersion}/` +
      `${user.whatsappBusinessAccountId}/message_templates` +
      `?fields=name,status,category,language,components&limit=100`;

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      const rawList: MetaTemplate[] = response.data?.data ?? [];

      // Trim to the shape the UI actually needs. Preserve components so
      // the UI can show a body preview + variable count.
      const templates = rawList.map((t) => {
        const body = t.components?.find(
          (c) => c.type?.toUpperCase() === "BODY"
        );
        const header = t.components?.find(
          (c) => c.type?.toUpperCase() === "HEADER"
        );
        const footer = t.components?.find(
          (c) => c.type?.toUpperCase() === "FOOTER"
        );
        const bodyText = body?.text ?? "";
        const variableCount = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          category: t.category,
          language: t.language,
          bodyText,
          headerFormat: header?.format ?? null,
          footerText: footer?.text ?? null,
          variableCount,
        };
      });

      return NextResponse.json({ ok: true, templates });
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { message?: string; code?: number } }>;
      const metaMsg =
        axiosErr.response?.data?.error?.message ??
        axiosErr.message ??
        "Unknown Meta API error";
      const status = axiosErr.response?.status ?? 502;
      return NextResponse.json(
        {
          ok: false,
          error: `Meta API: ${metaMsg}`,
          metaCode: axiosErr.response?.data?.error?.code ?? null,
        },
        { status }
      );
    }
  } catch (err) {
    return handleApiError(err, "GET /api/whatsapp/templates");
  }
}
