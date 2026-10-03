import { NextRequest, NextResponse } from "next/server";
import { notifyBooking } from "@/lib/notify";
import { refundAppointment } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// POST /api/bookings/[token]/cancel — manage_token を持つ人だけがキャンセル可能
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = createServiceClient();

  const { data: appt } = await db
    .from("appointments")
    .select("id, status, starts_at")
    .eq("manage_token", token)
    .maybeSingle();
  if (!appt) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (appt.status === "cancelled") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (new Date(appt.starts_at) < new Date()) {
    return NextResponse.json(
      { error: "開始時刻を過ぎた予約はキャンセルできません" },
      { status: 400 }
    );
  }

  const { error } = await db
    .from("appointments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", appt.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await refundAppointment(appt.id);
  await notifyBooking(appt.id, "cancelled", {
    baseUrl: new URL(req.url).origin,
  });
  return NextResponse.json({ ok: true });
}
