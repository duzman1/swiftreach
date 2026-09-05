// Logo upload — Pro only.
//
// POST accepts a multipart form-data `file` (PNG or JPG, ≤ 2 MB).
// SVG is REJECTED — the PDF renderer needs a raster, and we don't
// ship a rasterizer at runtime (see the sharp/devDeps note in the
// feature spec).
//
// A new upload deletes the previous blob before overwriting the
// user's logoUrl, so orphans never accumulate in the Blob store.
// DELETE removes both the current blob and the DB reference.

import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleApiError, errorResponse } from "@/lib/apiResponse";
import { requireFeature } from "@/lib/planGate";
import { logError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg"]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const gate = await requireFeature(user.id, "whiteLabelReports");
    if (gate) return gate;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return errorResponse("Missing file", 400);
    }
    if (file.size === 0) {
      return errorResponse("File is empty", 400);
    }
    if (file.size > MAX_BYTES) {
      return errorResponse("Logo must be 2 MB or smaller", 413);
    }
    const type = (file.type || "").toLowerCase();
    if (!ALLOWED.has(type)) {
      return errorResponse(
        "Logo must be a PNG or JPG",
        415
      );
    }

    // Delete previous blob before overwriting the pointer, so an
    // orphan can only exist for the length of one failed PUT.
    // Failure to delete is logged but not fatal — the Blob store's
    // TTL policies clean up dangling objects.
    if (user.logoUrl) {
      try {
        await del(user.logoUrl);
      } catch (err) {
        await logError("branding.logo.deletePrevious", err, {
          userId: user.id,
          severity: "warning",
        });
      }
    }

    // Path convention: branding/<userId>/<random>.<ext>. Random
    // suffix is applied by @vercel/blob when addRandomSuffix: true
    // so a re-upload can't be cached under the old URL.
    const ext = type === "image/png" ? "png" : "jpg";
    const key = `branding/${user.id}/logo.${ext}`;
    const uploaded = await put(key, file, {
      access: "public",
      contentType: type,
      addRandomSuffix: true,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { logoUrl: uploaded.url },
    });

    return NextResponse.json({
      ok: true,
      logoUrl: uploaded.url,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/branding/logo");
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    const gate = await requireFeature(user.id, "whiteLabelReports");
    if (gate) return gate;

    if (user.logoUrl) {
      try {
        await del(user.logoUrl);
      } catch (err) {
        await logError("branding.logo.delete", err, {
          userId: user.id,
          severity: "warning",
        });
      }
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { logoUrl: null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/branding/logo");
  }
}
