import { NextRequest, NextResponse } from "next/server";
import { generateMonthlyInvoices } from "@/lib/billing";

// GET /api/cron/invoices — 前月分の請求書発行。Vercel Cronから毎月1日に呼ぶ
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "認証されていません" }, { status: 401 });
  }
  const result = await generateMonthlyInvoices();
  return NextResponse.json(result);
}
