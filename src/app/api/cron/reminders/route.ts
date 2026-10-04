import { NextRequest, NextResponse } from "next/server";
import { sendBookingReminders } from "@/lib/notify";
import { refundAppointment } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/cron/reminders — 前日リマインダー+返金リトライ。Vercel Cron等から日1回呼ぶ
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendBookingReminders({
    baseUrl: new URL(req.url).origin,
  });
  const refunds = await retryRefunds();
  return NextResponse.json({ ...result, refunds });
}

// キャンセル済みなのに支払いが残ったままの予約を拾って返金を再試行する
// (キャンセル時の即時返金がStripeエラー等で失敗した場合の保険)
async function retryRefunds(): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("payments")
    .select("appointment_id, appointments!inner(status)")
    .eq("status", "succeeded")
    .eq("appointments.status", "cancelled");
  if (error) {
    console.error(`[cron] refund sweep failed: ${error.message}`);
    return 0;
  }
  let n = 0;
  for (const row of data ?? []) {
    await refundAppointment(row.appointment_id);
    n++;
  }
  return n;
}
