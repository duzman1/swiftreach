// Server side of Meta Embedded Signup. Receives the short-lived
// authorization code from the browser, exchanges it for a long-lived
// access token, subscribes the user's WABA to our app's webhooks via
// our SYSTEM USER token (not the user's), and writes the result to
// the User row encrypted at rest. Auth-required.
//
// Critical ordering: the auth code from Meta expires in ~60 seconds —
// the exchange call must run immediately after we receive it. We do
// the verify + WABA-name + DB write AFTER the token exchange because
// those can take an extra second on slow days and we don't want them
// blocking the time-critical handoff.

import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encrypt";
import { successResponse, errorResponse, handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v19.0";

interface Body {
  code?: string;
  phoneNumberId?: string;
  wabaId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body: Body = await request.json().catch(() => ({}));

    const { code, phoneNumberId, wabaId } = body;
    if (!code || !phoneNumberId || !wabaId) {
      return errorResponse(
        "Missing required fields: code, phoneNumberId, wabaId",
        400
      );
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      return errorResponse(
        "Meta app credentials not configured on the server.",
        500
      );
    }

    // ── STEP 1: exchange code → short-lived user token ──────────────
    const exchangeUrl = new URL(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`
    );
    exchangeUrl.searchParams.set("client_id", appId);
    exchangeUrl.searchParams.set("client_secret", appSecret);
    exchangeUrl.searchParams.set("code", code);

    const tokenRes = await fetch(exchangeUrl.toString());
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      // eslint-disable-next-line no-console
      console.error("Token exchange failed:", tokenData);
      return errorResponse(
        tokenData.error?.message ?? "Failed to get access token from Meta.",
        400
      );
    }
    const shortLivedToken: string = tokenData.access_token;

    // ── STEP 2: short-lived → long-lived token ──────────────────────
    // Long-lived tokens last ~60 days. For a TRUE never-expiring token
    // the user would need to use a system-user setup — that's a Phase 9
    // problem. For now: long-lived + a "Reconnect" button when it
    // expires.
    const longLivedUrl = new URL(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`
    );
    longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
    longLivedUrl.searchParams.set("client_id", appId);
    longLivedUrl.searchParams.set("client_secret", appSecret);
    longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    let finalToken = shortLivedToken;
    try {
      const longLivedRes = await fetch(longLivedUrl.toString());
      const longLivedData = await longLivedRes.json();
      if (longLivedData.access_token) {
        finalToken = longLivedData.access_token;
      }
    } catch {
      // Stick with the short-lived token if the upgrade call fails —
      // the user's flow still completes; they'll just need to
      // reconnect sooner.
    }

    // ── STEP 3: subscribe app to WABA webhooks ──────────────────────
    // Uses the SYSTEM USER token (whatsapp_business_management scope),
    // not the user's. This is what enrols the WABA into our app's
    // webhook receiver. Failure is non-fatal — admins can re-subscribe
    // via /api/whatsapp/subscribe-webhooks later.
    let webhookSubscribed = false;
    const systemToken = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (systemToken) {
      try {
        const subRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/subscribed_apps`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${systemToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        const subData = await subRes.json();
        webhookSubscribed = subData.success === true;
        if (!webhookSubscribed) {
          // eslint-disable-next-line no-console
          console.warn("Webhook subscribe response:", subData);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Webhook subscribe error:", err);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn("META_SYSTEM_USER_TOKEN not configured — skipping webhook subscribe.");
    }

    // ── STEP 4: verify the phone number ─────────────────────────────
    const verifyRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}`,
      { headers: { Authorization: `Bearer ${finalToken}` } }
    );
    const verifyData = await verifyRes.json();
    if (verifyData.error) {
      // eslint-disable-next-line no-console
      console.error("Phone verify failed:", verifyData);
      return errorResponse(
        "Could not verify your WhatsApp phone number. Please try connecting again.",
        400
      );
    }

    // ── STEP 5: fetch WABA display name ─────────────────────────────
    let wabaName: string | null = null;
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${wabaId}`,
        { headers: { Authorization: `Bearer ${finalToken}` } }
      );
      const wabaData = await wabaRes.json();
      if (!wabaData.error) wabaName = wabaData.name ?? null;
    } catch {
      // Non-fatal — display name is cosmetic.
    }

    // ── STEP 6: persist to User row ─────────────────────────────────
    await prisma.user.update({
      where: { id: user.id },
      data: {
        whatsappApiToken: encrypt(finalToken),
        whatsappPhoneNumberId: phoneNumberId,
        whatsappBusinessAccountId: wabaId,
        whatsappApiVersion: META_API_VERSION,
        webhookVerifyToken:
          user.webhookVerifyToken ||
          crypto.randomBytes(20).toString("hex"),
        wizardStep: 7,
        wizardCompletedAt: new Date(),
        onboardingCompletedAt: new Date(),
      },
    });

    // ── STEP 7: return everything the success card needs ────────────
    return successResponse({
      phoneNumberId,
      wabaId,
      phoneNumber: verifyData.display_phone_number ?? null,
      verifiedName: verifyData.verified_name ?? wabaName ?? null,
      webhookSubscribed,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/whatsapp/embedded-signup");
  }
}
