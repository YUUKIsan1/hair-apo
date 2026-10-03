"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setMenuActive, upsertMenu } from "../actions";
import { yen } from "@/lib/format";
import type { Menu } from "@/lib/types";

const input =
  "w-full rounded-lg border hairline bg-paper px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-mute";

interface StaffPick {
  staff_id: string;
  checked: boolean;
  nominable: boolean;
}

function MenuEditor({
  menu,
  picks,
  staffList,
  onDone,
}: {
  menu: Menu | null;
  picks: StaffPick[];
  staffList: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(menu?.name ?? "");
  const [description, setDescription] = useState(menu?.description ?? "");
  const [price, setPrice] = useState(menu?.price ?? 0);
  const [duration, setDuration] = useState(menu?.duration_minutes ?? 60);
  const [buffer, setBuffer] = useState(menu?.buffer_minutes ?? 15);
  const [sortOrder, setSortOrder] = useState(menu?.sort_order ?? 0);
  const [paymentMode, setPaymentMode] = useState<"on_site" | "prepaid">(
    menu?.payment_mode === "prepaid" ? "prepaid" : "on_site"
  );
  const [staff, setStaff] = useState<StaffPick[]>(picks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchStaff = (id: string, p: Partial<StaffPick>) =>
    setStaff(staff.map((s) => (s.staff_id === id ? { ...s, ...p } : s)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await upsertMenu({
      id: menu?.id,
      name,
      description,
      price,
      duration_minutes: duration,
      buffer_minutes: buffer,
      sort_order: sortOrder,
      payment_mode: paymentMode,
      staff: staff
        .filter((s) => s.checked)
        .map((s) => ({ staff_id: s.staff_id, nominable: s.nominable })),
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border hairline bg-accent-soft/50 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>メニュー名 *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>説明</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={label}>価格(円)</label>
          <input
            type="number"
            min={0}
            required
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className={input}
          />
        </div>
        <div>
          <label className={label}>所要時間(分)</label>
          <input
            type="number"
            min={1}
            required
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={input}
          />
        </div>
        <div>
          <label className={label}>バッファ(分)</label>
          <input
            type="number"
            min={0}
            required
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            className={input}
          />
        </div>
        <div>
          <label className={label}>決済方法</label>
          <select
            value={paymentMode}
            onChange={(e) =>
              setPaymentMode(e.target.value as "on_site" | "prepaid")
            }
            className={input}
          >
            <option value="on_site">現地払い</option>
            <option value="prepaid">事前カード決済</option>
          </select>
        </div>
        <div>
          <label className={label}>表示順</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className={input}
          />
        </div>
      </div>

      <div>
        <p className={label}>担当スタッフ(チェック=担当可 / 指名可で予約者が選べる)</p>
        <div className="space-y-1.5">
          {staffList.map((s) => {
            const pick = staff.find((p) => p.staff_id === s.id);
            return (
              <div key={s.id} className="flex items-center gap-4 text-sm">
                <label className="flex w-40 items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={pick?.checked ?? false}
                    onChange={(e) =>
                      patchStaff(s.id, {
                        checked: e.target.checked,
                        nominable: e.target.checked
                          ? (pick?.nominable ?? true)
                          : false,
                      })
                    }
                    className="accent-neutral-700"
                  />
                  {s.name}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-mute">
                  <input
                    type="checkbox"
                    checked={pick?.nominable ?? false}
                    disabled={!pick?.checked}
                    onChange={(e) =>
                      patchStaff(s.id, { nominable: e.target.checked })
                    }
                    className="accent-neutral-700"
                  />
                  指名可
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40"
        >
          {busy ? "保存中…" : menu ? "保存する" : "追加する"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-mute hover:text-ink"
        >
          やめる
        </button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </form>
  );
}

export default function MenuList({
  initial,
  staffList,
  staffByMenu,
}: {
  initial: Menu[];
  staffList: { id: string; name: string }[];
  staffByMenu: Record<string, { staff_id: string; nominable: boolean }[]>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const picksFor = (menuId?: string): StaffPick[] =>
    staffList.map((s) => {
      const p = menuId
        ? staffByMenu[menuId]?.find((x) => x.staff_id === s.id)
        : undefined;
      return {
        staff_id: s.id,
        checked: menuId ? !!p : true,
        nominable: p?.nominable ?? true,
      };
    });

  async function toggle(m: Menu) {
    await setMenuActive(m.id, !m.is_active);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {initial.map((m) => (
        <div key={m.id} className="rounded-lg border hairline bg-card p-4">
          {editing === m.id ? (
            <MenuEditor
              menu={m}
              picks={picksFor(m.id)}
              staffList={staffList}
              onDone={() => setEditing(null)}
            />
          ) : (
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  {!m.is_active && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                      非表示
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-mute">
                  {yen(m.price)} / {m.duration_minutes}分
                  {m.buffer_minutes > 0 && `(+バッファ${m.buffer_minutes}分)`}
                  {m.payment_mode === "prepaid" && "・事前決済"}
                </p>
              </div>
              <button
                onClick={() => setEditing(m.id)}
                className="rounded-md border hairline px-3 py-1.5 text-xs hover:bg-accent-soft"
              >
                編集
              </button>
              <button
                onClick={() => toggle(m)}
                className="rounded-md border hairline px-3 py-1.5 text-xs text-mute hover:bg-accent-soft"
              >
                {m.is_active ? "非表示にする" : "表示する"}
              </button>
            </div>
          )}
        </div>
      ))}

      {editing === "new" ? (
        <MenuEditor
          menu={null}
          picks={picksFor()}
          staffList={staffList}
          onDone={() => setEditing(null)}
        />
      ) : (
        <button
          onClick={() => setEditing("new")}
          className="w-full rounded-lg border border-dashed hairline py-3 text-sm text-mute hover:bg-accent-soft/50 hover:text-ink"
        >
          + メニューを追加
        </button>
      )}
    </div>
  );
}
