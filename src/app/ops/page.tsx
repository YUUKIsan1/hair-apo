import Link from "next/link";
import { redirect } from "next/navigation";
import { dateLabelJst, dateOnlyJst, yen } from "@/lib/format";
import { getOpsUser } from "@/lib/ops";
import { createServiceClient } from "@/lib/supabase/server";

// PostgRESTの行数上限(既定1000)をまたいで全件取る
const PAGE = 1000;
async function fetchAll<T>(
  fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await fetch(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export default async function OpsPage() {
  const user = await getOpsUser();
  if (!user) redirect("/admin/login");

  const db = createServiceClient();
  const [{ data: salons }, staff, members, appts, openInvoices] =
    await Promise.all([
      db
        .from("salons")
        .select("id, name, slug, created_at, stripe_onboarded, notify_email")
        .order("created_at", { ascending: false }),
      fetchAll<{ salon_id: string }>((f, t) =>
        db.from("staff").select("salon_id").range(f, t)
      ),
      fetchAll<{ salon_id: string }>((f, t) =>
        db.from("salon_users").select("salon_id").range(f, t)
      ),
      fetchAll<{ salon_id: string }>((f, t) =>
        db.from("appointments").select("salon_id").range(f, t)
      ),
      fetchAll<{ salon_id: string; amount: number }>((f, t) =>
        db
          .from("invoices")
          .select("salon_id, amount")
          .eq("status", "open")
          .range(f, t)
      ),
    ]);

  const count = (rows: { salon_id: string }[], id: string) =>
    rows.filter((r) => r.salon_id === id).length;
  const receivable = (id: string) =>
    openInvoices
      .filter((r) => r.salon_id === id)
      .reduce((t, r) => t + r.amount, 0);

  return (
    <div>
      <h1 className="text-xl font-bold">サロン一覧</h1>
      <div className="mt-4 overflow-x-auto rounded-lg border hairline bg-card">
        {!salons || salons.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-mute">
            サロンがありません
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs text-mute">
                <th className="px-4 py-2.5 font-medium">サロン</th>
                <th className="px-4 py-2.5 font-medium">登録日</th>
                <th className="px-4 py-2.5 font-medium">スタッフ</th>
                <th className="px-4 py-2.5 font-medium">メンバー</th>
                <th className="px-4 py-2.5 font-medium">累計予約</th>
                <th className="px-4 py-2.5 font-medium">Stripe連携</th>
                <th className="px-4 py-2.5 font-medium">未払い請求</th>
              </tr>
            </thead>
            <tbody>
              {salons.map((s) => (
                <tr key={s.id} className="border-b hairline last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name}</div>
                    <Link
                      href={`/s/${s.slug}`}
                      target="_blank"
                      className="text-xs text-mute underline-offset-2 hover:underline"
                    >
                      /s/{s.slug}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {dateLabelJst(dateOnlyJst(s.created_at))}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {count(staff, s.id)}名
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {count(members, s.id)}名
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {count(appts, s.id)}件
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.stripe_onboarded ? (
                      "連携済み"
                    ) : (
                      <span className="text-mute">未連携</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {receivable(s.id) > 0 ? yen(receivable(s.id)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-mute">{salons?.length ?? 0}店舗</p>
    </div>
  );
}
