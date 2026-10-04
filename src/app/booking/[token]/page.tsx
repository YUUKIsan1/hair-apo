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
      "id, starts_at, ends_at, status, customer_note, payment_mode, salons(name, slug, cancel_deadline_hours, cancel_fee_rate_bps), staff(name), menus(name, price, duration_minutes), customers(name), payments(status, cancel_fee_amount)"
    )
    .eq("manage_token", token)
    .maybeSingle();
  if (!appt) notFound();

  const salon = appt.salons as unknown as {
    name: string;
    slug: string;
    cancel_deadline_hours: number;
    cancel_fee_rate_bps: number;
  };
  const staff = appt.staff as unknown as { name: string };
  const menu = appt.menus as unknown as {
    name: string;
    price: number;
    duration_minutes: number;
  };
  const customer = appt.customers as unknown as { name: string };
  const payment = (
    appt.payments as unknown as
      | { status: string; cancel_fee_amount: number }[]
      | null
  )?.[0];
  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
  const payLabel =
    payment?.status === "succeeded"
      ? "事前決済済み"
      : payment?.status === "pending"
        ? "支払い待ち"
        : payment?.status === "refunded"
          ? payment.cancel_fee_amount > 0
            ? payment.cancel_fee_amount >= menu.price
              ? "キャンセル料として全額充当"
              : `返金済み(キャンセル料 ${yen(payment.cancel_fee_amount)} を差引)`
            : "返金済み"
          : appt.payment_mode === "prepaid"
            ? "支払い待ち"
            : "現地払い";

  const start = new Date(appt.starts_at);
  const jst = new Date(start.getTime() + 9 * 3600_000);
  const dateLabel = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日(${DOW[jst.getUTCDay()]})`;
  const timeLabel = `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
  const cancelled = appt.status === "cancelled";

  const deadlineH = salon.cancel_deadline_hours;
  const feePct = salon.cancel_fee_rate_bps / 100;
  const pastDeadline =
    deadlineH > 0 && Date.now() > start.getTime() - deadlineH * 3600_000;
  const chargeableCancel =
    appt.payment_mode === "prepaid" && feePct > 0;
  const policyText =
    deadlineH === 0
      ? "予約開始時刻までキャンセルできます。"
      : pastDeadline
        ? chargeableCancel
          ? `キャンセル期限(${deadlineH}時間前)を過ぎています。キャンセルすると料金の${feePct}%がキャンセル料として差し引かれます。`
          : `キャンセル期限(${deadlineH}時間前)を過ぎています。キャンセルは店舗へ直接ご連絡ください。`
        : chargeableCancel
          ? `${deadlineH}時間前までは無料でキャンセルできます。以降は料金の${feePct}%のキャンセル料がかかります。`
          : `${deadlineH}時間前までキャンセルできます。以降のキャンセルは店舗へ直接ご連絡ください。`;
  const feeWarning =
    pastDeadline && chargeableCancel
      ? `キャンセル料として ${yen(Math.floor((menu.price * salon.cancel_fee_rate_bps) / 10000))} が差し引かれます。`
      : undefined;

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
          <p className="mb-3 text-center text-[12px] text-[var(--color-mute)]">
            {policyText}
          </p>
          {(!pastDeadline || chargeableCancel) && (
            <CancelButton token={token} feeWarning={feeWarning} />
          )}
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
