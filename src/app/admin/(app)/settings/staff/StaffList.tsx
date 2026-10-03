"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setStaffActive, upsertStaff } from "../actions";
import type { Staff } from "@/lib/types";

const input =
  "w-full rounded-lg border hairline bg-paper px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-mute";
const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  stylist: "スタイリスト",
  assistant: "アシスタント",
};

function StaffEditor({
  staff,
  onDone,
}: {
  staff: Staff | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(staff?.name ?? "");
  const [role, setRole] = useState<Staff["role"]>(staff?.role ?? "stylist");
  const [bio, setBio] = useState(staff?.bio ?? "");
  const [sortOrder, setSortOrder] = useState(staff?.sort_order ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await upsertStaff({
      id: staff?.id,
      name,
      role,
      bio,
      sort_order: sortOrder,
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>名前 *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>役職</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Staff["role"])}
            className={input}
          >
            {Object.entries(ROLE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
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
        <label className={label}>紹介文</label>
        <input value={bio} onChange={(e) => setBio(e.target.value)} className={input} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-ink px-4 py-2 text-sm text-paper disabled:opacity-40"
        >
          {busy ? "保存中…" : staff ? "保存する" : "追加する"}
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

export default function StaffList({ initial }: { initial: Staff[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  async function toggle(s: Staff) {
    await setStaffActive(s.id, !s.is_active);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {initial.map((s) => (
        <div key={s.id} className="rounded-xl border hairline bg-card p-4">
          {editing === s.id ? (
            <StaffEditor staff={s} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft font-display text-accent-dark">
                {s.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-mute">{ROLE_LABEL[s.role]}</span>
                  {!s.is_active && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                      非表示
                    </span>
                  )}
                </div>
                {s.bio && (
                  <p className="mt-0.5 truncate text-xs text-mute">{s.bio}</p>
                )}
              </div>
              <button
                onClick={() => setEditing(s.id)}
                className="rounded-md border hairline px-3 py-1.5 text-xs hover:bg-accent-soft"
              >
                編集
              </button>
              <button
                onClick={() => toggle(s)}
                className="rounded-md border hairline px-3 py-1.5 text-xs text-mute hover:bg-accent-soft"
              >
                {s.is_active ? "非表示にする" : "表示する"}
              </button>
            </div>
          )}
        </div>
      ))}

      {editing === "new" ? (
        <StaffEditor staff={null} onDone={() => setEditing(null)} />
      ) : (
        <button
          onClick={() => setEditing("new")}
          className="w-full rounded-xl border border-dashed hairline py-3 text-sm text-mute hover:bg-accent-soft/50 hover:text-ink"
        >
          + スタッフを追加
        </button>
      )}
      <p className="text-xs text-mute">
        非表示にすると予約ページ・空き枠に出なくなります(既存予約は残ります)。
      </p>
    </div>
  );
}
