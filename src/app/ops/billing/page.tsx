import Link from "next/link";
import { redirect } from "next/navigation";
import { dateLabelJst, dateOnlyJst, yen } from "@/lib/format";
import { getOpsUser } from "@/lib/ops";
import { createServiceClient } from "@/lib/supabase/server";
import { setInvoiceStatus } from "./actions";

type Status = "open" | "paid" | "void";

const STATUS_LABEL: Record<Status, string> = {
  open: "未払い",
  paid: "支払済み",
  void: "取消",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "すべて" },
  { key: "open", label: "未払い" },
  { key: "paid", label: "支払済み" },
  { key: "void", label: "取消" },
];

interface InvoiceRow {
  id: string;
  period_year: number;
  period_month: number;
  amount: number;
  subscription_fee: number;
  status: Status;
  issued_at: string | null;
  paid_at: string | null;
  salons: { name: string } | null;
  invoice_items: { count: number }[];
}

export default async function OpsBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getOpsUser();
  if (!user) redirect("/admin/login");

  const params = await searchParams;
  const status = params.status as Status | undefined;

  const db = createServiceClient();
  let query = db
    .from("invoices")
    .select(
      "id, period_year, period_month, amount, subscription_fee, status, issued_at, paid_at, salons(name), invoice_items(count)"
    )
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  if (status === "open" || status === "paid" || status === "void") {
    query = query.eq("status", status);
  }
  const { data } = await query;
  const rows = (data ?? []) as unknown as InvoiceRow[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">請求管理</h1>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key ? `/ops/billing?status=${f.key}` : "/ops/billing"}
              className={`rounded-md px-3 py-1.5 text-sm ${
                (status ?? "") === f.key
                  ? "bg-accent-soft font-medium text-accent-dark"
                  : "text-mute hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border hairline bg-card">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-mute">
            請求書がありません
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs text-mute">
                <th className="px-4 py-2.5 font-medium">サロン</th>
                <th className="px-4 py-2.5 font-medium">対象月</th>
                <th className="px-4 py-2.5 font-medium">内訳</th>
                <th className="px-4 py-2.5 font-medium">請求額</th>
                <th className="px-4 py-2.5 font-medium">発行日</th>
                <th className="px-4 py-2.5 font-medium">状態</th>
                <th className="px-4 py-2.5 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-b hairline last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {inv.salons?.name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {inv.period_year}年{inv.period_month}月
                  </td>
                  <td className="px-4 py-3 text-xs text-mute">
                    月額 {yen(inv.subscription_fee)} + 手数料{" "}
                    {yen(inv.amount - inv.subscription_fee)}(
                    {inv.invoice_items?.[0]?.count ?? 0}件)
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {yen(inv.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {inv.issued_at
                      ? dateLabelJst(dateOnlyJst(inv.issued_at))
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {inv.status === "open" && (
                        <>
                          <form
                            action={setInvoiceStatus.bind(null, inv.id, "paid")}
                          >
                            <button className="rounded-md border hairline px-2.5 py-1 text-xs hover:bg-accent-soft">
                              支払済み
                            </button>
                          </form>
                          <form
                            action={setInvoiceStatus.bind(null, inv.id, "void")}
                          >
                            <button className="rounded-md px-2.5 py-1 text-xs text-mute hover:text-ink">
                              取消
                            </button>
                          </form>
                        </>
                      )}
                      {inv.status !== "open" && (
                        <form
                          action={setInvoiceStatus.bind(null, inv.id, "open")}
                        >
                          <button className="rounded-md px-2.5 py-1 text-xs text-mute hover:text-ink">
                            未払いに戻す
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-mute">{rows.length}件</p>
    </div>
  );
}
