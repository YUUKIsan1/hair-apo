import { NextRequest, NextResponse } from "next/server";
import { sendBookingReminders } from "@/lib/notify";
import { refundAppointment } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/cron/reminders — 前日リマインダー+返金リトライ。Vercel Cron等から日1回呼ぶ
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "認証されていません" }, { status: 401 });
  }
  const result = await sendBookingReminders({
    baseUrl: new URL(req.url).origin,
  });
  const refunds = await retryRefunds();
  return NextResponse.json({ ...result, refunds });
}

// キャンセル・ノーショーなのに支払いが残ったままの予約を拾って返金を再試行する
// (即時返金がStripeエラー等で失敗した場合の保険。キャンセル料は
// payments.cancel_fee_amountに保存済みの額が使われる)
async function retryRefunds(): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("payments")
    .select("appointment_id, appointments!inner(status)")
    .eq("status", "succeeded")
    .in("appointments.status", ["cancelled", "no_show"]);
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
