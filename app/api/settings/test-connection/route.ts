import { NextResponse } from "next/server";
import { getPhoneNumberInfo } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST() {
  const info = await getPhoneNumberInfo();
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
    { status: 200 } // 200 with ok=false so client can read details easily
  );
}
