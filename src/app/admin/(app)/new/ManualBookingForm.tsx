"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { todayJst } from "@/lib/format";

interface Slot {
  start: string;
  label: string;
}

const input =
  "w-full rounded-lg border hairline bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-mute";

export default function ManualBookingForm({
  salonSlug,
  menus,
  staffList,
  staffByMenu,
}: {
  salonSlug: string;
  menus: { id: string; name: string; price: number; duration_minutes: number }[];
  staffList: { id: string; name: string }[];
  staffByMenu: Record<string, string[]>;
}) {
  const router = useRouter();
  const [menuId, setMenuId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayJst());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const availableStaff = useMemo(
    () =>
      menuId
        ? staffList.filter((s) => (staffByMenu[menuId] ?? []).includes(s.id))
        : [],
    [menuId, staffList, staffByMenu]
  );

  useEffect(() => {
    setSlot("");
    setSlots(null);
    if (!menuId || !date) return;
    const staffParam = staffId || "free";
    let cancelled = false;
    fetch(
      `/api/availability?salon=${salonSlug}&menu=${menuId}&staff=${staffParam}&date=${date}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSlots(d.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [menuId, staffId, date, salonSlug]);

  useEffect(() => {
    if (staffId && !availableStaff.some((s) => s.id === staffId)) {
      setStaffId("");
    }
  }, [availableStaff, staffId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_id: menuId,
        staff_id: staffId || null,
        starts_at: slot,
        customer: {
          name,
          name_kana: nameKana || undefined,
          phone,
          email: email || undefined,
        },
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "登録に失敗しました");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <p className="font-display text-lg">予約を登録しました</p>
        <p className="mt-2 text-sm text-mute">
          {name} 様 / {slot.slice(11, 16)}〜
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => router.push(`/admin?date=${date}`)}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm text-paper"
          >
            台帳で確認
          </button>
          <button
            onClick={() => {
              setDone(false);
              setSlot("");
              setName("");
              setNameKana("");
              setPhone("");
              setEmail("");
            }}
            className="rounded-lg border hairline px-5 py-2.5 text-sm"
          >
            続けて登録
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>メニュー *</label>
          <select
            required
            value={menuId}
            onChange={(e) => setMenuId(e.target.value)}
            className={input}
          >
            <option value="">選択してください</option>
            {menus.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}(¥{m.price.toLocaleString()} / {m.duration_minutes}分)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>担当スタッフ *</label>
          <select
            required
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            disabled={!menuId}
            className={input}
          >
            <option value="">
              {menuId ? "選択してください" : "先にメニューを選択"}
            </option>
            {availableStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>日付 *</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={label}>開始時間 *</label>
          <select
            required
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            disabled={!menuId || !staffId || !date}
            className={input}
          >
            <option value="">
              {slots === null
                ? "読み込み中…"
                : slots.length === 0
                  ? "この日は空きがありません"
                  : "選択してください"}
            </option>
            {(slots ?? []).map((s) => (
              <option key={s.start} value={s.start}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t hairline pt-5">
        <p className="mb-3 text-xs font-medium text-mute">お客様情報</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>お名前 *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 花子"
              className={input}
            />
          </div>
          <div>
            <label className={label}>フリガナ</label>
            <input
              value={nameKana}
              onChange={(e) => setNameKana(e.target.value)}
              placeholder="ヤマダ ハナコ"
              className={input}
            />
          </div>
          <div>
            <label className={label}>電話番号 *</label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="090-1234-5678"
              className={input}
            />
          </div>
          <div>
            <label className={label}>メール</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !slot}
        className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        {busy ? "登録中…" : "この内容で予約を登録する"}
      </button>
    </form>
  );
}
