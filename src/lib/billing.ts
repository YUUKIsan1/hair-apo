import { createServiceClient } from "@/lib/supabase/server";

// 月額利用料(JPY)。料率はサロンごとの fee_rate_*_bps を使う
export const MONTHLY_FEE = 10000;

// JST基準の年月 → starts_at比較用のUTC境界(月の初日0:00〜翌月初日0:00)
export function monthRangeUtc(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1, -9));
  const to = new Date(Date.UTC(year, month, 1, -9));
  return { from: from.toISOString(), to: to.toISOString() };
}

// 現在のJST年月(前月などは呼び出し側でずらす)
export function jstYearMonth(d = new Date()): { year: number; month: number } {
  const jst = new Date(d.getTime() + 9 * 3600_000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}

// 対象月の現地払い完了予約から手数料明細を計算する。
// channel=manual(電話・来店の手入力)はプラットフォーム経由の売上ではないので請求対象外
export async function bookingFeeItems(
  salonId: string,
  feeDirectBps: number,
  feeMallBps: number,
  year: number,
  month: number
): Promise<{ appointment_id: string; amount: number }[]> {
  const db = createServiceClient();
  const { from, to } = monthRangeUtc(year, month);
  const { data: appts } = await db
    .from("appointments")
    .select("id, channel, price, menus(price)")
    .eq("salon_id", salonId)
    .eq("status", "completed")
    // card_on_fileも当日は店舗払いなので手数料請求の対象
    .in("payment_mode", ["on_site", "card_on_file"])
    .in("channel", ["direct", "mall"])
    .gte("starts_at", from)
    .lt("starts_at", to);
  return (appts ?? []).map((a) => {
    const menu = a.menus as unknown as { price: number } | null;
    // priceは予約時点のスナップショット。古い予約はメニュー価格にフォールバック
    const unit = (a.price as number | null) ?? menu?.price ?? 0;
    const bps = a.channel === "mall" ? feeMallBps : feeDirectBps;
    return { appointment_id: a.id, amount: Math.floor((unit * bps) / 10000) };
  });
}

// 前月(JST)分の請求書を全サロンに発行する。月1回のcronから呼ぶ。
// unique(salon_id, year, month)で冪等(再実行しても二重発行しない)
export async function generateMonthlyInvoices(): Promise<{
  created: number;
  skipped: number;
}> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { year: jy, month: jm } = jstYearMonth();
  const [py, pm] = jm === 1 ? [jy - 1, 12] : [jy, jm - 1];

  const { data: salons } = await db
    .from("salons")
    .select("id, fee_rate_direct_bps, fee_rate_mall_bps");
  let created = 0;
  let skipped = 0;
  for (const s of salons ?? []) {
    const { data: existing } = await db
      .from("invoices")
      .select("id")
      .eq("salon_id", s.id)
      .eq("period_year", py)
      .eq("period_month", pm)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }
    const items = await bookingFeeItems(
      s.id,
      s.fee_rate_direct_bps,
      s.fee_rate_mall_bps,
      py,
      pm
    );
    const bookingFee = items.reduce((t, i) => t + i.amount, 0);
    const { data: inv, error } = await db
      .from("invoices")
      .insert({
        salon_id: s.id,
        period_year: py,
        period_month: pm,
        subscription_fee: MONTHLY_FEE,
        amount: MONTHLY_FEE + bookingFee,
        status: "open",
        issued_at: now,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`[billing] invoice insert failed for ${s.id}:`, error);
      continue;
    }
    if (items.length > 0) {
      const { error: itemErr } = await db
        .from("invoice_items")
        .insert(items.map((i) => ({ ...i, invoice_id: inv.id })));
      if (itemErr) {
        console.error(`[billing] invoice_items insert failed:`, itemErr);
        // 明細なしの請求書が残ると再実行でスキップされて永久に欠落するので取り消す
        await db.from("invoices").delete().eq("id", inv.id);
        continue;
      }
    }
    created++;
  }
  return { created, skipped };
}
