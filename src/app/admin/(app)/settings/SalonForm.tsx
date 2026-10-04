"use client";

import { useState } from "react";
import { updateSalon } from "./actions";

const input =
  "w-full rounded-lg border hairline bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-mute";

export default function SalonForm({
  initial,
  slug,
}: {
  initial: {
    name: string;
    description: string;
    phone: string;
    postal_code: string;
    address: string;
    notify_email: string;
    cancel_deadline_hours: string;
    cancel_fee_rate_percent: string;
  };
  slug: string;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await updateSalon(form);
    setBusy(false);
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>店舗名 *</label>
          <input required value={form.name} onChange={set("name")} className={input} />
        </div>
        <div>
          <label className={label}>予約ページURL</label>
          <input value={`/s/${slug}`} disabled className={`${input} text-mute`} />
        </div>
      </div>
      <div>
        <label className={label}>紹介文</label>
        <textarea
          value={form.description}
          onChange={set("description")}
          rows={3}
          className={input}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>電話番号</label>
          <input value={form.phone} onChange={set("phone")} className={input} />
        </div>
        <div>
          <label className={label}>郵便番号</label>
          <input
            value={form.postal_code}
            onChange={set("postal_code")}
            className={input}
          />
        </div>
        <div className="sm:col-span-1">
          <label className={label}>住所</label>
          <input value={form.address} onChange={set("address")} className={input} />
        </div>
      </div>
      <div>
        <label className={label}>予約通知メール(新規予約・キャンセルを受け取る)</label>
        <input
          type="email"
          value={form.notify_email}
          onChange={set("notify_email")}
          placeholder="salon@example.jp"
          className={`${input} sm:max-w-md`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>キャンセル期限(予約の何時間前まで / 0=開始時刻まで可)</label>
          <input
            type="number"
            min={0}
            max={720}
            step={1}
            value={form.cancel_deadline_hours}
            onChange={set("cancel_deadline_hours")}
            className={input}
          />
        </div>
        <div>
          <label className={label}>キャンセル料率%(期限後・ノーショー時に事前決済から差引)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={form.cancel_fee_rate_percent}
            onChange={set("cancel_fee_rate_percent")}
            className={input}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm text-paper disabled:opacity-40"
        >
          {busy ? "保存中…" : "保存する"}
        </button>
        {saved && <span className="text-sm text-emerald-700">保存しました</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </form>
  );
}
