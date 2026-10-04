import { NextRequest, NextResponse } from "next/server";
import { notifyBooking } from "@/lib/notify";
import { expirePendingCheckout, refundAppointment } from "@/lib/stripe";
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
    .select(
      "id, status, starts_at, payment_mode, salons(cancel_deadline_hours, cancel_fee_rate_bps), payments(status)"
    )
    .eq("manage_token", token)
    .maybeSingle();
  if (!appt) return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
  if (appt.status === "cancelled") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (new Date(appt.starts_at) < new Date()) {
    return NextResponse.json(
      { error: "開始時刻を過ぎた予約はキャンセルできません" },
      { status: 400 }
    );
  }

  const salon = appt.salons as unknown as {
    cancel_deadline_hours: number;
    cancel_fee_rate_bps: number;
  } | null;
  const deadlineMs = (salon?.cancel_deadline_hours ?? 0) * 3600_000;
  const pastDeadline =
    deadlineMs > 0 &&
    Date.now() > new Date(appt.starts_at).getTime() - deadlineMs;
  const feeBps = pastDeadline ? (salon?.cancel_fee_rate_bps ?? 0) : 0;
  const hasPaid = (
    appt.payments as unknown as { status: string }[] | null
  )?.some((p) => p.status === "succeeded");
  // 期限切れ後は「入金済みの事前決済でキャンセル料を引ける」場合だけ
  // セルフキャンセル可。未入金では料を取れないので店舗連絡を促してブロック
  if (
    pastDeadline &&
    !(appt.payment_mode === "prepaid" && feeBps > 0 && hasPaid)
  ) {
    return NextResponse.json(
      {
        error: `キャンセル期限(予約の${salon?.cancel_deadline_hours}時間前)を過ぎています。店舗へ直接ご連絡ください`,
      },
      { status: 400 }
    );
  }

  const { error } = await db
    .from("appointments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", appt.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await expirePendingCheckout(appt.id);
  await refundAppointment(appt.id, feeBps);
  await notifyBooking(appt.id, "cancelled", {
    baseUrl: new URL(req.url).origin,
  });
  return NextResponse.json({ ok: true });
}
