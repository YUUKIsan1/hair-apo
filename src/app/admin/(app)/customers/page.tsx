import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { dateLabelJst, dateOnlyJst } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";

interface CustomerRow {
  id: string;
  name: string;
  name_kana: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  appointments: {
    status: string;
    starts_at: string;
  }[];
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const db = createServiceClient();
  let query = db
    .from("customers")
    .select("id, name, name_kana, phone, email, notes, appointments(status, starts_at)")
    .eq("salon_id", ctx.salon.id);

  const q = params.q?.trim() ?? "";
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "")}%`;
    query = query.or(
      `name.ilike.${like},name_kana.ilike.${like},phone.ilike.${like}`
    );
  }

  const { data } = await query.order("name");
  const customers = (data ?? []) as CustomerRow[];

  const rows = customers
    .map((c) => {
      const done = c.appointments.filter((a) => a.status === "completed");
      const lastVisit = done
        .map((a) => a.starts_at)
        .sort()
        .at(-1);
      const upcoming = c.appointments
        .filter((a) => a.status === "confirmed")
        .map((a) => a.starts_at)
        .sort()[0];
      return { ...c, visits: done.length, lastVisit, upcoming };
    })
    .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Customers</p>
          <h1 className="font-display mt-1 text-2xl">顧客一覧</h1>
        </div>
        <form action="/admin/customers" className="flex items-center gap-1">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="名前・かな・電話番号"
            className="w-56 rounded-md border hairline bg-card px-3 py-1.5 text-sm"
          />
          <button className="rounded-md border hairline bg-card px-3 py-1.5 text-sm hover:bg-accent-soft">
            検索
          </button>
        </form>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border hairline bg-card">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-mute">
            {q ? "該当する顧客がいません" : "顧客がまだ登録されていません"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs text-mute">
                <th className="px-4 py-2.5 font-medium">お客様</th>
                <th className="px-4 py-2.5 font-medium">連絡先</th>
                <th className="px-4 py-2.5 font-medium">来店</th>
                <th className="px-4 py-2.5 font-medium">最終来店</th>
                <th className="px-4 py-2.5 font-medium">次回予約</th>
                <th className="px-4 py-2.5 font-medium">メモ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b hairline last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.name_kana && (
                      <div className="text-xs text-mute">{c.name_kana}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.phone && <div>{c.phone}</div>}
                    {c.email && <div className="text-mute">{c.email}</div>}
                    {!c.phone && !c.email && (
                      <span className="text-mute">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.visits}回</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {c.lastVisit ? dateLabelJst(dateOnlyJst(c.lastVisit)) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {c.upcoming ? dateLabelJst(dateOnlyJst(c.upcoming)) : "—"}
                  </td>
                  <td className="max-w-48 truncate px-4 py-3 text-xs text-mute">
                    {c.notes ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-mute">{rows.length}名</p>
    </div>
  );
}
