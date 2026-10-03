"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dateLabelJst, dateOnlyJst, timeJst } from "@/lib/format";
import type { Shift } from "@/lib/types";
import { addTimeOff, deleteTimeOff, saveShifts } from "../actions";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const input =
  "rounded-lg border hairline bg-paper px-2 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-mute";

interface Row {
  day_of_week: number;
  work: boolean;
  start_time: string;
  end_time: string;
}

interface TimeOffRow {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export default function ShiftEditor({
  staffList,
  selectedStaffId,
  shifts,
  timeOffs,
}: {
  staffList: { id: string; name: string }[];
  selectedStaffId: string | null;
  shifts: Shift[];
  timeOffs: TimeOffRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ブラウザの戻る/進むでスタッフが切り替わった時も編集中の行を破棄する
  useEffect(() => setRows(null), [selectedStaffId]);

  // 時間休フォーム
  const [offStaff, setOffStaff] = useState<string>("");
  const [offDate, setOffDate] = useState("");
  const [offStart, setOffStart] = useState("10:00");
  const [offEnd, setOffEnd] = useState("20:00");
  const [offReason, setOffReason] = useState("");
  const [offBusy, setOffBusy] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);

  const current: Row[] =
    rows ??
    DOW.map((_, dow) => {
      const s = shifts.find((x) => x.day_of_week === dow);
      return {
        day_of_week: dow,
        work: !!s,
        start_time: s?.start_time.slice(0, 5) ?? "10:00",
        end_time: s?.end_time.slice(0, 5) ?? "20:00",
      };
    });

  const patch = (dow: number, p: Partial<Row>) =>
    setRows(
      current.map((r) => (r.day_of_week === dow ? { ...r, ...p } : r))
    );

  async function submitShifts(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStaffId) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveShifts(
      selectedStaffId,
      current
        .filter((r) => r.work)
        .map((r) => ({
          day_of_week: r.day_of_week,
          start_time: r.start_time,
          end_time: r.end_time,
        }))
    );
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setSaved(true);
      router.refresh();
    }
  }

  async function submitTimeOff(e: React.FormEvent) {
    e.preventDefault();
    setOffBusy(true);
    setOffError(null);
    const res = await addTimeOff({
      staff_id: offStaff || null,
      date: offDate,
      start_time: offStart,
      end_time: offEnd,
      reason: offReason,
    });
    setOffBusy(false);
    if (res.error) setOffError(res.error);
    else {
      setOffDate("");
      setOffReason("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border hairline bg-card p-6">
        <h2 className="text-sm font-medium">曜日ごとのシフト</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {staffList.map((s) => (
            <Link
              key={s.id}
              href={`/admin/settings/shifts?staff=${s.id}`}
              onClick={() => setRows(null)}
              className={`rounded-full border hairline px-3 py-1 text-xs ${
                s.id === selectedStaffId
                  ? "bg-ink text-paper"
                  : "bg-card text-mute"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
        {selectedStaffId && (
          <form onSubmit={submitShifts} className="mt-4">
            <div className="space-y-3">
              {current.map((r) => (
                <div key={r.day_of_week} className="flex items-center gap-3">
                  <span className="w-8 text-sm font-medium">
                    {DOW[r.day_of_week]}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-mute">
                    <input
                      type="checkbox"
                      checked={!r.work}
                      onChange={(e) =>
                        patch(r.day_of_week, { work: !e.target.checked })
                      }
                      className="accent-[#9a7b4f]"
                    />
                    休み
                  </label>
                  <input
                    type="time"
                    value={r.start_time}
                    disabled={!r.work}
                    onChange={(e) =>
                      patch(r.day_of_week, { start_time: e.target.value })
                    }
                    className={`${input} disabled:opacity-40`}
                  />
                  <span className="text-mute">〜</span>
                  <input
                    type="time"
                    value={r.end_time}
                    disabled={!r.work}
                    onChange={(e) =>
                      patch(r.day_of_week, { end_time: e.target.value })
                    }
                    className={`${input} disabled:opacity-40`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-ink px-5 py-2.5 text-sm text-paper disabled:opacity-40"
              >
                {busy ? "保存中…" : "保存する"}
              </button>
              {saved && (
                <span className="text-sm text-emerald-700">保存しました</span>
              )}
              {error && <span className="text-sm text-red-700">{error}</span>}
            </div>
          </form>
        )}
      </section>

      <section className="rounded-xl border hairline bg-card p-6">
        <h2 className="text-sm font-medium">休み・時間外の設定</h2>
        <p className="mt-1 text-xs text-mute">
          特定の日時を予約不可にします。スタッフ未選択なら店舗全体の休みです。
        </p>
        {timeOffs.length > 0 && (
          <ul className="mt-3 divide-y divide-[#e6ded0]">
            {timeOffs.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="font-medium">
                  {dateLabelJst(dateOnlyJst(t.starts_at))}
                </span>
                <span className="tabular-nums text-mute">
                  {timeJst(t.starts_at)}〜{timeJst(t.ends_at)}
                </span>
                <span className="text-mute">
                  {t.staff_name ?? "店舗全体"}
                  {t.reason && `(${t.reason})`}
                </span>
                <button
                  onClick={async () => {
                    await deleteTimeOff(t.id);
                    router.refresh();
                  }}
                  className="ml-auto text-xs text-mute underline-offset-2 hover:text-red-700 hover:underline"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={submitTimeOff}
          className="mt-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-6"
        >
          <div className="sm:col-span-1">
            <label className={label}>対象</label>
            <select
              value={offStaff}
              onChange={(e) => setOffStaff(e.target.value)}
              className={`${input} w-full`}
            >
              <option value="">店舗全体</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>日付</label>
            <input
              type="date"
              required
              value={offDate}
              onChange={(e) => setOffDate(e.target.value)}
              className={`${input} w-full`}
            />
          </div>
          <div>
            <label className={label}>開始</label>
            <input
              type="time"
              required
              value={offStart}
              onChange={(e) => setOffStart(e.target.value)}
              className={`${input} w-full`}
            />
          </div>
          <div>
            <label className={label}>終了</label>
            <input
              type="time"
              required
              value={offEnd}
              onChange={(e) => setOffEnd(e.target.value)}
              className={`${input} w-full`}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={label}>理由</label>
            <input
              value={offReason}
              onChange={(e) => setOffReason(e.target.value)}
              placeholder="任意"
              className={`${input} w-full`}
            />
          </div>
          <button
            type="submit"
            disabled={offBusy}
            className="col-span-2 rounded-lg bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40 sm:col-span-1"
          >
            {offBusy ? "追加中…" : "追加"}
          </button>
          {offError && (
            <p className="col-span-2 text-sm text-red-700 sm:col-span-6">
              {offError}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
