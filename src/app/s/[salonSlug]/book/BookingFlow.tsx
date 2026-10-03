"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Menu, Staff } from "@/lib/types";

type Step = "menu" | "staff" | "datetime" | "form" | "done";

interface Slot {
  start: string;
  label: string;
  staffIds: string[];
}

interface Props {
  salon: { id: string; slug: string; name: string };
  menus: Menu[];
  staffByMenu: Record<string, Staff[]>;
  initialMenuId: string | null;
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const STEPS: { key: Step; label: string }[] = [
  { key: "menu", label: "メニュー" },
  { key: "staff", label: "担当" },
  { key: "datetime", label: "日時" },
  { key: "form", label: "情報" },
];

function jstDate(offsetDays: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export function BookingFlow({ salon, menus, staffByMenu, initialMenuId }: Props) {
  const [step, setStep] = useState<Step>(initialMenuId ? "staff" : "menu");
  const [menu, setMenu] = useState<Menu | null>(
    menus.find((m) => m.id === initialMenuId) ?? null
  );
  const [staffId, setStaffId] = useState<string | "free">("free");
  const [date, setDate] = useState<string>(jstDate(0));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    name_kana: "",
    phone: "",
    email: "",
    notes: "",
  });

  const staffList = menu ? (staffByMenu[menu.id] ?? []) : [];
  const dates = useMemo(
    () => Array.from({ length: 14 }, (_, i) => jstDate(i)),
    []
  );

  // 日付選択時に空き枠を取得
  useEffect(() => {
    if (step !== "datetime" || !menu) return;
    let cancelled = false;
    setSlots(null);
    setSlotsError(null);
    setSlot(null);
    const staffParam = staffId === "free" ? "free" : staffId;
    fetch(
      `/api/availability?salon=${salon.slug}&menu=${menu.id}&staff=${staffParam}&date=${date}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { slots: Slot[] }) => {
        if (!cancelled) setSlots(d.slots);
      })
      .catch(() => {
        if (!cancelled) setSlotsError("空き状況を取得できませんでした");
      });
    return () => {
      cancelled = true;
    };
  }, [step, menu, staffId, date, salon.slug]);

  const selectedStaff =
    staffId === "free" ? null : staffList.find((s) => s.id === staffId) ?? null;

  async function submit() {
    if (!menu || !slot) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salon: salon.slug,
        menu_id: menu.id,
        staff_id: staffId === "free" ? null : staffId,
        starts_at: slot.start,
        customer: form,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { manage_url: string };
      setManageUrl(data.manage_url);
      setStep("done");
    } else {
      const data = await res.json().catch(() => ({}));
      setSubmitError(
        (data as { error?: string }).error ?? "予約に失敗しました"
      );
      if (res.status === 409) setStep("datetime"); // 空き枠を取り直す
    }
    setSubmitting(false);
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const fmtDateLabel = (d: string) => {
    const dt = new Date(`${d}T12:00:00+09:00`);
    return `${dt.getMonth() + 1}/${dt.getDate()}(${DOW[dt.getDay()]})`;
  };
  const fmtLong = (d: string) => {
    const dt = new Date(`${d}T12:00:00+09:00`);
    return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日(${DOW[dt.getDay()]})`;
  };

  return (
    <main className="mx-auto max-w-2xl px-5 pb-24 pt-8">
      {/* ヘッダ */}
      <div className="flex items-center justify-between">
        <Link href={`/s/${salon.slug}`} className="text-[13px] text-[var(--color-mute)]">
          ← {salon.name}
        </Link>
        <span className="eyebrow">reservation</span>
      </div>
      <h1 className="font-display mt-4 text-2xl">ご予約</h1>

      {step !== "done" && (
        <ol className="mt-6 flex items-center gap-2 text-[11px]">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border hairline ${
                  i <= stepIndex
                    ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                    : "text-[var(--color-mute)]"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={
                  i === stepIndex ? "font-medium" : "text-[var(--color-mute)]"
                }
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="mx-1 h-px w-6 bg-[var(--color-line)]" />
              )}
            </li>
          ))}
        </ol>
      )}

      {/* STEP: メニュー */}
      {step === "menu" && (
        <ul className="mt-8 divide-y divide-[var(--color-line)] border-y hairline">
          {menus.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => {
                  setMenu(m);
                  setStaffId("free");
                  setStep("staff");
                }}
                className="flex w-full items-center gap-4 py-5 text-left transition hover:bg-[var(--color-accent-soft)]/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{m.name}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-mute)]">
                    {m.duration_minutes}分
                    {m.description && ` / ${m.description}`}
                  </p>
                </div>
                <p className="font-display text-lg">{yen(m.price)}</p>
                <span className="text-[var(--color-mute)]">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* STEP: 担当 */}
      {step === "staff" && menu && (
        <div className="mt-8">
          <BackButton onClick={() => setStep("menu")} label="メニューを変更" />
          <ul className="mt-4 space-y-3">
            <li>
              <SelectCard
                selected={staffId === "free"}
                onClick={() => setStaffId("free")}
                title="指名なし(おまかせ)"
                sub="空いているスタッフが担当します"
              />
            </li>
            {staffList.map((s) => (
              <li key={s.id}>
                <SelectCard
                  selected={staffId === s.id}
                  onClick={() => setStaffId(s.id)}
                  title={s.name}
                  sub={s.bio ?? undefined}
                />
              </li>
            ))}
          </ul>
          <PrimaryButton onClick={() => setStep("datetime")}>
            日時を選ぶ
          </PrimaryButton>
        </div>
      )}

      {/* STEP: 日時 */}
      {step === "datetime" && menu && (
        <div className="mt-8">
          <BackButton onClick={() => setStep("staff")} label="担当を変更" />
          <p className="mt-4 text-[13px] font-medium">日付</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDate(d);
                  setSlot(null);
                }}
                className={`shrink-0 rounded-full border px-4 py-2 text-[13px] transition ${
                  date === d
                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                    : "hairline text-[var(--color-mute)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {fmtDateLabel(d)}
              </button>
            ))}
          </div>

          <p className="mt-6 text-[13px] font-medium">開始時間</p>
          {slotsError && (
            <p className="mt-3 text-[13px] text-red-700">{slotsError}</p>
          )}
          {slots === null && !slotsError && (
            <p className="mt-3 text-[13px] text-[var(--color-mute)]">読み込み中…</p>
          )}
          {slots !== null && slots.length === 0 && (
            <p className="mt-3 text-[13px] text-[var(--color-mute)]">
              この日は空きがありません。別の日を選んでください。
            </p>
          )}
          {slots && slots.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {slots.map((s) => (
                <button
                  key={s.start}
                  onClick={() => setSlot(s)}
                  className={`rounded-lg border py-2.5 text-center text-[14px] transition ${
                    slot?.start === s.start
                      ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                      : "hairline hover:bg-[var(--color-accent-soft)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <PrimaryButton disabled={!slot} onClick={() => setStep("form")}>
            お客様情報へ
          </PrimaryButton>
        </div>
      )}

      {/* STEP: 情報入力+確認 */}
      {step === "form" && menu && slot && (
        <div className="mt-8">
          <BackButton onClick={() => setStep("datetime")} label="日時を変更" />

          <div className="mt-4 rounded-xl border hairline bg-[var(--color-card)] p-5 text-[14px]">
            <dl className="space-y-2">
              <Row k="店舗" v={salon.name} />
              <Row k="メニュー" v={`${menu.name} / ${yen(menu.price)}(税込)`} />
              <Row
                k="担当"
                v={selectedStaff ? selectedStaff.name : "指名なし(おまかせ)"}
              />
              <Row
                k="日時"
                v={`${fmtLong(date)} ${slot.label} 〜 (約${menu.duration_minutes}分)`}
              />
            </dl>
          </div>

          <div className="mt-6 space-y-4">
            <Field
              label="お名前"
              required
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="山田 花子"
            />
            <Field
              label="フリガナ"
              value={form.name_kana}
              onChange={(v) => setForm({ ...form, name_kana: v })}
              placeholder="ヤマダ ハナコ"
            />
            <Field
              label="電話番号"
              required
              type="tel"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
              placeholder="090-1234-5678"
            />
            <Field
              label="メールアドレス"
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="予約確認用(任意)"
            />
            <div>
              <label className="text-[13px] font-medium">ご要望・メモ</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border hairline bg-[var(--color-card)] px-3 py-2 text-[14px] outline-none focus:border-[var(--color-accent)]"
                placeholder="例: 初めての来店です"
              />
            </div>
          </div>

          {submitError && (
            <p className="mt-4 text-[13px] text-red-700">{submitError}</p>
          )}
          <PrimaryButton
            disabled={!form.name || !form.phone || submitting}
            onClick={submit}
          >
            {submitting ? "予約を確定しています…" : "この内容で予約を確定する"}
          </PrimaryButton>
          <p className="mt-3 text-[11px] leading-5 text-[var(--color-mute)]">
            お支払いは当日店舗にて。無断キャンセルはご遠慮ください。
          </p>
        </div>
      )}

      {/* 完了 */}
      {step === "done" && (
        <div className="mt-10 text-center">
          <p className="font-display text-2xl">ご予約ありがとうございます</p>
          <p className="mt-4 text-[14px] leading-7 text-[var(--color-mute)]">
            予約が確定しました。確認・キャンセルは以下のリンクから行えます。
          </p>
          {manageUrl && (
            <Link
              href={manageUrl}
              className="mt-6 inline-block rounded-full border border-[var(--color-accent)] px-6 py-3 text-[14px] text-[var(--color-accent-dark)] hover:bg-[var(--color-accent-soft)]"
            >
              予約内容を確認する
            </Link>
          )}
          <div className="mt-8">
            <Link
              href={`/s/${salon.slug}`}
              className="text-[13px] text-[var(--color-mute)] underline underline-offset-4"
            >
              店舗ページへ戻る
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="text-[13px] text-[var(--color-mute)]">
      ← {label}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-8 w-full rounded-full bg-[var(--color-ink)] py-4 text-[15px] font-medium text-[var(--color-paper)] transition enabled:hover:opacity-85 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SelectCard({
  title,
  sub,
  selected,
  onClick,
}: {
  title: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? "border-[var(--color-ink)] bg-[var(--color-accent-soft)]"
          : "hairline bg-[var(--color-card)] hover:bg-[var(--color-accent-soft)]/50"
      }`}
    >
      <p className="text-[14px] font-medium">{title}</p>
      {sub && (
        <p className="mt-1 text-[12px] text-[var(--color-mute)]">{sub}</p>
      )}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-16 shrink-0 text-[var(--color-mute)]">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[13px] font-medium">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border hairline bg-[var(--color-card)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--color-accent)]"
      />
    </div>
  );
}
