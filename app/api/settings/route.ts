import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const SINGLETON_ID = "singleton";

async function getOrCreate() {
  const existing = await prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      id: SINGLETON_ID,
      defaultCountryCode: "1",
      defaultDelayMs: 2000,
    },
  });
}

export async function GET() {
  try {
    const settings = await getOrCreate();
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return handleApiError(err, "/api/settings");
  }
}

interface UpdateBody {
  defaultCountryCode?: string;
  defaultDelayMs?: number;
}

export async function PUT(req: NextRequest) {
  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.defaultCountryCode !== undefined) {
    const cc = String(body.defaultCountryCode).replace(/\D/g, "");
    if (!cc) {
      return NextResponse.json(
        { ok: false, error: "Default country code must contain digits" },
        { status: 400 }
      );
    }
    data.defaultCountryCode = cc;
  }
  if (body.defaultDelayMs !== undefined) {
    const v = Number(body.defaultDelayMs);
    if (!Number.isFinite(v) || v < 500 || v > 60000) {
      return NextResponse.json(
        { ok: false, error: "Default delay must be between 500 and 60000 ms" },
        { status: 400 }
      );
    }
    data.defaultDelayMs = Math.round(v);
  }

  try {
    await getOrCreate();
    const settings = await prisma.settings.update({
      where: { id: SINGLETON_ID },
      data,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return handleApiError(err, "/api/settings");
  }
}
