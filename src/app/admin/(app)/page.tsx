import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import {
  addDaysJst,
  dateLabelJst,
  timeJst,
  todayJst,
  yen,
} from "@/lib/format";
import { getStaffList } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/server";
import StatusActions from "./StatusActions";

const CHANNEL_LABEL: Record<string, string> = {
  direct: "ネット",
  mall: "モール",
  manual: "手入力",
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  completed: "完了",
  cancelled: "キャンセル",
  no_show: "ノーショー",
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-accent-soft text-accent-dark",
  completed: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-neutral-100 text-neutral-500",
  no_show: "bg-red-50 text-red-700",
};

export default async function AdminLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; staff?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getAdminContext();
  if (!ctx) redirect("/admin/login");

  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayJst();
  const from = new Date(`${date}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const prev = addDaysJst(date, -1);
  const next = addDaysJst(date, 1);

  const db = createServiceClient();
  const [staffList, { data: appointments }] = await Promise.all([
    getStaffList(ctx.salon.id),
    db
      .from("appointments")
      .select(
        "*, customers(name, name_kana, phone), menus(name, price), staff(name)"
      )
      .eq("salon_id", ctx.salon.id)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at"),
  ]);

  const rows = (appointments ?? []).filter(
    (a) => !params.staff || a.staff_id === params.staff
  );
  const live = rows.filter(
    (a) => a.status === "confirmed" || a.status === "completed"
  );
  const expected = live.reduce(
    (sum, a) => sum + (a.menus?.price ?? 0),
    0
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Reservations</p>
          <h1 className="font-display mt-1 text-2xl">{dateLabelJst(date)}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/admin?date=${prev}${params.staff ? `&staff=${params.staff}` : ""}`}
            className="rounded-md border hairline bg-card px-3 py-1.5 hover:bg-accent-soft"
          >
            ← 前日
          </Link>
          <Link
            href={`/admin${params.staff ? `?staff=${params.staff}` : ""}`}
            className="rounded-md border hairline bg-card px-3 py-1.5 hover:bg-accent-soft"
          >
            今日
          </Link>
          <Link
            href={`/admin?date=${next}${params.staff ? `&staff=${params.staff}` : ""}`}
            className="rounded-md border hairline bg-card px-3 py-1.5 hover:bg-accent-soft"
          >
            翌日 →
          </Link>
          <form action="/admin" className="ml-1 flex items-center gap-1">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-md border hairline bg-card px-2 py-1.5 text-sm"
            />
            {params.staff && (
              <input type="hidden" name="staff" value={params.staff} />
            )}
            <button className="rounded-md border hairline bg-card px-3 py-1.5 hover:bg-accent-soft">
              移動
            </button>
          </form>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/admin?date=${date}`}
          className={`rounded-full border hairline px-3 py-1 text-xs ${
            !params.staff ? "bg-ink text-paper" : "bg-card text-mute"
          }`}
        >
          全スタッフ
        </Link>
        {staffList.map((s) => (
          <Link
            key={s.id}
            href={`/admin?date=${date}&staff=${s.id}`}
            className={`rounded-full border hairline px-3 py-1 text-xs ${
              params.staff === s.id ? "bg-ink text-paper" : "bg-card text-mute"
            }`}
          >
            {s.name}
          </Link>
        ))}
        <span className="ml-auto text-xs text-mute">
          {live.length}件 / 予定売上 {yen(expected)}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border hairline bg-card">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-mute">
            この日の予約はありません
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-left text-xs text-mute">
                <th className="px-4 py-2.5 font-medium">時間</th>
                <th className="px-4 py-2.5 font-medium">お客様</th>
                <th className="px-4 py-2.5 font-medium">メニュー</th>
                <th className="px-4 py-2.5 font-medium">担当</th>
                <th className="px-4 py-2.5 font-medium">経路</th>
                <th className="px-4 py-2.5 font-medium">状態</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.id}
                  className={`border-b hairline last:border-0 ${
                    a.status === "cancelled" || a.status === "no_show"
                      ? "opacity-55"
                      : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                    {timeJst(a.starts_at)}–{timeJst(a.ends_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div>{a.customers?.name}</div>
                    {a.customers?.phone && (
                      <div className="text-xs text-mute">
                        {a.customers.phone}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{a.menus?.name}</div>
                    <div className="text-xs text-mute">
                      {a.menus ? yen(a.menus.price) : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {a.staff?.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-mute">
                    {CHANNEL_LABEL[a.channel] ?? a.channel}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[a.status]}`}
                    >
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusActions
                      key={`${a.id}-${a.status}`}
                      id={a.id}
                      status={a.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
