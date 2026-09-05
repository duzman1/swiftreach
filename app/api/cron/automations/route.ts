// Daily automation cron. Fires at 13:00 UTC per vercel.json —
// that's 5am PT, 6am MT, 7am CT, 8am ET, 9am AT. Chosen so US
// recipients receive their birthday/anniversary WhatsApp between
// 5am and 9am local, comfortably in the "morning" window without
// being obnoxiously early.
//
// Cron users in other time zones will see messages arrive earlier
// or later — this is documented in the UI ("Messages send between
// 5am–9am your local time") to set expectations.
//
// SECURITY: matches the existing send-scheduled cron pattern —
// x-cron-secret header must equal CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { runDailyAutomations } from "@/lib/automationEngine";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
// 900s (Vercel Pro) — needed for holiday-season days when a single
// automation might have hundreds of contacts on the same date.
export const maxDuration = 900;

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-cron-secret");
  if (provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await runDailyAutomations();
    return NextResponse.json({
      ok: true,
      ...result,
      runAt: new Date().toISOString(),
    });
  } catch (err) {
    await logError("cron.automations", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
