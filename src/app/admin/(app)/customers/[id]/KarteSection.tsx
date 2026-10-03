"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dateLabelJst, dateOnlyJst, timeJst, todayJst } from "@/lib/format";
import type { Kart } from "@/lib/types";
import { addKarte, deleteKarte, updateKarte } from "../actions";

interface ApptOption {
  id: string;
  label: string;
  starts_at: string;
  staff_name: string | null;
}

interface Props {
  customerId: string;
  kartes: Kart[];
  appointments: ApptOption[];
  staffList: { id: string; name: string }[];
  prefillAppointmentId: string | null;
}

const input = "w-full rounded-md border hairline bg-paper px-3 py-1.5 text-sm";
const label = "text-xs text-mute";

function KarteForm({
  appointments,
  staffList,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  appointments: ApptOption[];
  staffList: { id: string; name: string }[];
  initial: {
    appointment_id: string | null;
    visited_date: string;
    staff_id: string | null;
    memo: string;
  };
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: {
    appointment_id: string | null;
    visited_at: string;
    staff_id: string | null;
    memo: string;
  }) => void;
  onCancel?: () => void;
}) {
  const [appointmentId, setAppointmentId] = useState(initial.appointment_id);
  const [visitedDate, setVisitedDate] = useState(initial.visited_date);
  const [staffId, setStaffId] = useState(initial.staff_id);
  const [memo, setMemo] = useState(initial.memo);

  const linked = appointments.find((a) => a.id === appointmentId);

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>関連する予約</label>
        <select
          className={input}
          value={appointmentId ?? ""}
          onChange={(e) => setAppointmentId(e.target.value || null)}
        >
          <option value="">関連付けない</option>
          {appointments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      {!linked && (
        <div>
          <label className={label}>来店日 *</label>
          <input
            type="date"
            className={input}
            value={visitedDate}
            onChange={(e) => setVisitedDate(e.target.value)}
          />
        </div>
      )}
      <div>
        <label className={label}>担当スタッフ</label>
        <select
          className={input}
          value={staffId ?? ""}
          onChange={(e) => setStaffId(e.target.value || null)}
        >
          <option value="">未選択</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>メモ *</label>
        <textarea
          className={`${input} min-h-24`}
          placeholder="施術内容・使用した薬剤・お客様の希望など"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={busy || !memo.trim() || (!linked && !visitedDate)}
          onClick={() =>
            onSubmit({
              appointment_id: appointmentId,
              visited_at: linked
                ? linked.starts_at
                : `${visitedDate}T12:00:00+09:00`,
              staff_id: staffId,
              memo: memo.trim(),
            })
          }
          className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-40"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            disabled={busy}
            onClick={onCancel}
            className="rounded-md border hairline px-3 py-1.5 text-sm hover:bg-accent-soft"
          >
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}

export default function KarteSection({
  customerId,
  kartes,
  appointments,
  staffList,
  prefillAppointmentId,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(Boolean(prefillAppointmentId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefill = appointments.find((a) => a.id === prefillAppointmentId);

  // 「カルテを書く」リンクで同一ページ内遷移しても追加フォームを開き直す
  useEffect(() => {
    if (prefillAppointmentId) setAdding(true);
  }, [prefillAppointmentId]);

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return false;
    }
    return true;
  }

  return (
    <section className="rounded-lg border hairline bg-card">
      <div className="flex items-center justify-between border-b hairline px-5 py-3">
        <h2 className="text-sm font-medium">カルテ({kartes.length})</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border hairline px-2.5 py-1 text-xs hover:bg-accent-soft"
          >
            + 追加
          </button>
        )}
      </div>

      <div className="space-y-4 p-5">
        {adding && (
          <div className="rounded-lg border hairline bg-accent-soft/40 p-4">
            <KarteForm
              key={prefill?.id ?? "new"}
              appointments={appointments}
              staffList={staffList}
              initial={{
                appointment_id: prefill?.id ?? null,
                visited_date: todayJst(),
                staff_id:
                  staffList.find((s) => s.name === prefill?.staff_name)?.id ??
                  null,
                memo: "",
              }}
              submitLabel="追加する"
              busy={busy}
              onSubmit={async (v) => {
                const ok = await run(() =>
                  addKarte({ customer_id: customerId, ...v })
                );
                if (ok) {
                  setAdding(false);
                  router.refresh();
                }
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        {error && <p className="text-xs text-red-700">{error}</p>}

        {kartes.length === 0 && !adding ? (
          <p className="py-4 text-center text-sm text-mute">
            カルテはまだありません
          </p>
        ) : (
          kartes.map((k) =>
            editingId === k.id ? (
              <div key={k.id} className="rounded-lg border hairline p-4">
                <KarteForm
                  appointments={appointments}
                  staffList={staffList}
                  initial={{
                    appointment_id: k.appointment_id,
                    visited_date: dateOnlyJst(k.visited_at),
                    staff_id: k.staff_id,
                    memo: k.memo ?? "",
                  }}
                  submitLabel="保存する"
                  busy={busy}
                  onSubmit={async (v) => {
                    const ok = await run(() => updateKarte(k.id, v));
                    if (ok) {
                      setEditingId(null);
                      router.refresh();
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <div key={k.id} className="rounded-lg border hairline p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">
                      {dateLabelJst(dateOnlyJst(k.visited_at))}
                    </span>
                    <span className="ml-2 text-xs text-mute">
                      {timeJst(k.visited_at)}
                      {(() => {
                        const appt = appointments.find(
                          (a) => a.id === k.appointment_id
                        );
                        const staffName =
                          staffList.find((s) => s.id === k.staff_id)?.name ??
                          appt?.staff_name;
                        return staffName ? ` · ${staffName}` : "";
                      })()}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => setEditingId(k.id)}
                      className="rounded-md border hairline px-2.5 py-1 text-xs hover:bg-accent-soft"
                    >
                      編集
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm("このカルテを削除しますか?")) return;
                        const ok = await run(() => deleteKarte(k.id));
                        if (ok) router.refresh();
                      }}
                      className="rounded-md border hairline px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{k.memo}</p>
              </div>
            )
          )
        )}
      </div>
    </section>
  );
}
