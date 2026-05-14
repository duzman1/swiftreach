// Re-subscribe the caller's WABA to our app's webhooks. Used when:
//   - the embedded-signup auto-subscribe at connection time failed
//     for any reason (e.g. transient Meta error)
//   - the user disconnected webhooks in their Meta UI and wants them
//     back without redoing the whole connection flow
//
// Uses our system-user token (whatsapp_business_management scope),
// NOT the per-user token. That's intentional — the system user owns
// the subscription on Meta's side.

import { requireUser } from "@/lib/auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const META_API_VERSION = "v19.0";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user.whatsappBusinessAccountId) {
      return errorResponse("No WhatsApp account connected", 400);
    }

    const systemToken = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (!systemToken) {
      return errorResponse(
        "META_SYSTEM_USER_TOKEN not configured on the server.",
        500
      );
    }

    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${user.whatsappBusinessAccountId}/subscribed_apps`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${systemToken}` },
      }
    );
    const data = await res.json();

    if (data.success === true) {
      return successResponse({ subscribed: true });
    }
    return errorResponse(
      `Failed to subscribe webhooks: ${
        data?.error?.message ?? JSON.stringify(data)
      }`,
      502
    );
  } catch (err) {
    return handleApiError(err, "POST /api/whatsapp/subscribe-webhooks");
  }
}
