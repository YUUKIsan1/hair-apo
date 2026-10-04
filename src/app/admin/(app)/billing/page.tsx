import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { MONTHLY_FEE, bookingFeeItems, jstYearMonth } from "@/lib/billing";
import { dateLabelJst, dateOnlyJst, yen } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";

interface ItemRow {
  amount: number;
  appointments:
    | {
        starts_at: string;
        menus: { name: string } | null;
        customers: { name: string } | null;
      }
    | null;
}

interface InvoiceRow {
  id: string;
  period_year: number;
  period_month: number;
  amount: number;
  subscription_fee: number;
  status: "open" | "paid" | "void";
  issued_at: string | null;
  paid_at: string | null;
  invoice_items: ItemRow[];
}

const STATUS_LABEL: Record<InvoiceRow["status"], string> = {
  open: "未払い",
  paid: "支払済み",
  void: "取消",
};

export default async function BillingPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const db = createServiceClient();
  const { year, month } = jstYearMonth();

  const [{ data: invoices }, items] = await Promise.all([
    db
      .from("invoices")
      .select(
        "id, period_year, period_month, amount, subscription_fee, status, issued_at, paid_at, invoice_items(amount, appointments(starts_at, menus(name), customers(name)))"
      )
      .eq("salon_id", ctx.salon.id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false }),
    bookingFeeItems(
      ctx.salon.id,
      ctx.salon.fee_rate_direct_bps,
      ctx.salon.fee_rate_mall_bps,
      year,
      month
    ),
  ]);

  const accrualFee = items.reduce((t, i) => t + i.amount, 0);
  const accrualTotal = MONTHLY_FEE + accrualFee;
  const rows = (invoices ?? []) as unknown as InvoiceRow[];

  return (
    <div>
      <h1 className="text-xl font-bold">請求・手数料</h1>
      <p className="mt-1 text-sm text-mute">
        月額利用料と現地払い予約の手数料を月末締めで請求します。事前決済分の手数料は決済時に差引済みです。
      </p>

      <section className="mt-6 rounded-lg border hairline bg-card p-5">
        <h2 className="text-sm font-medium text-mute">
          {year}年{month}月分(見込み)
        </h2>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span>月額利用料</span>
            <span className="tabular-nums">{yen(MONTHLY_FEE)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              現地払い手数料
              <span className="ml-1 text-xs text-mute">
                ({items.length}件・
                {(ctx.salon.fee_rate_direct_bps / 100).toString()}%)
              </span>
            </span>
            <span className="tabular-nums">{yen(accrualFee)}</span>
          </div>
          <div className="flex justify-between border-t hairline pt-1.5 font-medium">
            <span>合計見込</span>
            <span className="tabular-nums">{yen(accrualTotal)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-mute">
          月末時点で確定し、翌月1日に請求書として発行されます。
        </p>
      </section>

      <h2 className="mt-8 text-sm font-medium">請求履歴</h2>
      <div className="mt-3 space-y-3">
        {rows.length === 0 && (
          <p className="rounded-lg border hairline bg-card px-6 py-10 text-center text-sm text-mute">
            請求書はまだありません
          </p>
        )}
        {rows.map((inv) => {
          const bookingFee = inv.amount - inv.subscription_fee;
          return (
            <section
              key={inv.id}
              className="rounded-lg border hairline bg-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">
                  {inv.period_year}年{inv.period_month}月分
                </h3>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    inv.status === "paid"
                      ? "bg-green-100 text-green-800"
                      : inv.status === "void"
                        ? "bg-black/5 text-mute"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {STATUS_LABEL[inv.status]}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>月額利用料</span>
                  <span className="tabular-nums">{yen(inv.subscription_fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>現地払い手数料</span>
                  <span className="tabular-nums">{yen(bookingFee)}</span>
                </div>
                <div className="flex justify-between border-t hairline pt-1 font-medium">
                  <span>請求額</span>
                  <span className="tabular-nums">{yen(inv.amount)}</span>
                </div>
              </div>
              {inv.invoice_items.length > 0 && (
                <div className="mt-3 border-t hairline pt-3">
                  <div className="text-xs font-medium text-mute">
                    手数料明細({inv.invoice_items.length}件)
                  </div>
                  <ul className="mt-1 space-y-1 text-xs">
                    {inv.invoice_items.map((it, i) => {
                      const a = it.appointments;
                      return (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">
                            {a ? dateLabelJst(dateOnlyJst(a.starts_at)) : ""}{" "}
                            {a?.customers?.name ?? ""}・{a?.menus?.name ?? ""}
                          </span>
                          <span className="tabular-nums">{yen(it.amount)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="mt-3 text-xs text-mute">
                発行:{" "}
                {inv.issued_at ? dateLabelJst(dateOnlyJst(inv.issued_at)) : "—"}
                {inv.paid_at &&
                  ` / 支払: ${dateLabelJst(dateOnlyJst(inv.paid_at))}`}
              </div>
              {inv.status === "open" && (
                <p className="mt-2 text-xs text-mute">
                  振込先・支払期限は運営から個別にご案内します。
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
