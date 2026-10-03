"use client";

import { useState } from "react";
import { saveBusinessHours } from "../actions";
import type { BusinessHours } from "@/lib/types";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const input =
  "rounded-lg border hairline bg-paper px-2 py-2 text-sm outline-none focus:border-accent";

interface Row {
  day_of_week: number;
  open: boolean;
  start_time: string;
  end_time: string;
}

export default function HoursForm({
  initial,
}: {
  initial: BusinessHours[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    DOW.map((_, dow) => {
      const h = initial.find((r) => r.day_of_week === dow);
      return {
        day_of_week: dow,
        open: !!h,
        start_time: h?.start_time.slice(0, 5) ?? "10:00",
        end_time: h?.end_time.slice(0, 5) ?? "20:00",
      };
    })
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const patch = (dow: number, p: Partial<Row>) =>
    setRows(rows.map((r) => (r.day_of_week === dow ? { ...r, ...p } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveBusinessHours(
      rows
        .filter((r) => r.open)
        .map((r) => ({
          day_of_week: r.day_of_week,
          start_time: r.start_time,
          end_time: r.end_time,
        }))
    );
    setBusy(false);
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  return (
    <form onSubmit={submit}>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.day_of_week} className="flex items-center gap-3">
            <span className="w-8 text-sm font-medium">
              {DOW[r.day_of_week]}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-mute">
              <input
                type="checkbox"
                checked={!r.open}
                onChange={(e) => patch(r.day_of_week, { open: !e.target.checked })}
                className="accent-neutral-700"
              />
              休み
            </label>
            <input
              type="time"
              value={r.start_time}
              disabled={!r.open}
              onChange={(e) => patch(r.day_of_week, { start_time: e.target.value })}
              className={`${input} disabled:opacity-40`}
            />
            <span className="text-mute">〜</span>
            <input
              type="time"
              value={r.end_time}
              disabled={!r.open}
              onChange={(e) => patch(r.day_of_week, { end_time: e.target.value })}
              className={`${input} disabled:opacity-40`}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-mute">
        営業時間外は予約枠が出ません。祝日・臨時休業は「シフト・休み」から個別に設定してください。
      </p>
      <div className="mt-5 flex items-center gap-3">
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
