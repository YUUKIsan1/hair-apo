import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { CancelButton } from "./CancelButton";
import { PayButton } from "./PayButton";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createServiceClient();
  const { data: appt } = await db
    .from("appointments")
    .select(
      "id, starts_at, ends_at, status, customer_note, payment_mode, salons(name, slug), staff(name), menus(name, price, duration_minutes), customers(name), payments(status)"
    )
    .eq("manage_token", token)
    .maybeSingle();
  if (!appt) notFound();

  const salon = appt.salons as unknown as { name: string; slug: string };
  const staff = appt.staff as unknown as { name: string };
  const menu = appt.menus as unknown as {
    name: string;
    price: number;
    duration_minutes: number;
  };
  const customer = appt.customers as unknown as { name: string };
  const payment = (appt.payments as unknown as { status: string }[] | null)?.[0];
  const payLabel =
    payment?.status === "succeeded"
      ? "事前決済済み"
      : payment?.status === "pending"
        ? "支払い待ち"
        : payment?.status === "refunded"
          ? "返金済み"
          : appt.payment_mode === "prepaid"
            ? "支払い待ち"
            : "現地払い";

  const start = new Date(appt.starts_at);
  const jst = new Date(start.getTime() + 9 * 3600_000);
  const dateLabel = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日(${DOW[jst.getUTCDay()]})`;
  const timeLabel = `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

  const cancelled = appt.status === "cancelled";

  return (
    <main className="mx-auto max-w-xl px-5 pb-24 pt-10">
      <h1 className="text-xl font-bold">ご予約内容</h1>

      {cancelled ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          この予約はキャンセル済みです。
        </p>
      ) : (
        <p className="mt-6 rounded-lg border hairline bg-[var(--color-accent-soft)] px-4 py-3 text-[13px]">
          予約が確定しています。当日お気をつけてお越しください。
        </p>
      )}

      <dl className="mt-8 divide-y divide-[var(--color-line)] border-y hairline text-[14px]">
        {[
          ["店舗", salon.name],
          ["メニュー", `${menu.name} / ${yen(menu.price)}(税込)`],
          ["担当", staff.name],
          ["日時", `${dateLabel} ${timeLabel} 〜`],
          ["所要時間", `約${menu.duration_minutes}分`],
          ["支払い", payLabel],
          ["お名前", customer.name],
          ...(appt.customer_note
            ? [["ご要望", appt.customer_note] as [string, string]]
            : []),
        ].map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6rem_1fr] gap-4 py-3">
            <dt className="text-[var(--color-mute)]">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {!cancelled && payment?.status === "pending" && <PayButton token={token} />}

      {!cancelled && (
        <div className="mt-10">
          <CancelButton token={token} />
        </div>
      )}

      <div className="mt-8 text-center">
        <Link
          href={`/s/${salon.slug}`}
          className="text-[13px] text-[var(--color-mute)] underline underline-offset-4"
        >
          {salon.name} のページへ
        </Link>
      </div>
    </main>
  );
}
