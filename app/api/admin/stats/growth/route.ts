// 30-day growth series for the overview line charts.
//
// Returns two arrays of {date, value} so the chart can render directly.
// Bucketing is done in JS to keep the SQL portable across Postgres versions
// (no date_trunc string templating).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

interface DayPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function emptySeries(days: number): Map<string, number> {
  const map = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    map.set(ymd(d), 0);
  }
  return map;
}

export async function GET() {
  try {
    await requireAdmin();

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [users, campaigns] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.campaign.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, sentCount: true },
      }),
    ]);

    const signups = emptySeries(30);
    const messages = emptySeries(30);

    for (const u of users) {
      const k = ymd(u.createdAt);
      if (signups.has(k)) signups.set(k, (signups.get(k) ?? 0) + 1);
    }
    for (const c of campaigns) {
      const k = ymd(c.createdAt);
      if (messages.has(k)) {
        messages.set(k, (messages.get(k) ?? 0) + c.sentCount);
      }
    }

    const signupsSeries: DayPoint[] = Array.from(signups, ([date, value]) => ({
      date,
      value,
    }));
    const messagesSeries: DayPoint[] = Array.from(messages, ([date, value]) => ({
      date,
      value,
    }));

    return NextResponse.json({
      ok: true,
      signups: signupsSeries,
      messages: messagesSeries,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/stats/growth");
  }
}
