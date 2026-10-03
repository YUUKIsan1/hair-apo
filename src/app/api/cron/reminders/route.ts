import { NextRequest, NextResponse } from "next/server";
import { sendBookingReminders } from "@/lib/notify";

// GET /api/cron/reminders — 前日リマインダー。Vercel Cron等から日1回呼ぶ
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendBookingReminders({
    baseUrl: new URL(req.url).origin,
  });
  return NextResponse.json(result);
}
