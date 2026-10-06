import { NextRequest, NextResponse } from "next/server";
import { sendBookingReminders } from "@/lib/notify";
import { chargeCardCancelFee, refundAppointment } from "@/lib/stripe";
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
  // card_on_fileの請求がpendingのまま残ったもの(成功後のDB保存失敗・
  // 通信喪失)を拾う。冪等キーで同じPaymentIntentが返るので復旧になる
  const { data: stale } = await db
    .from("payments")
    .select("appointment_id, appointments!inner(payment_mode)")
    .eq("status", "pending")
    .eq("appointments.payment_mode", "card_on_file");
  for (const row of stale ?? []) {
    await chargeCardCancelFee(row.appointment_id, 0, 0);
    n++;
  }
  return n;
}
