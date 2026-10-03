"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateCustomer } from "../actions";

interface Props {
  customer: {
    id: string;
    name: string;
    name_kana: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
  };
}

const input =
  "w-full rounded-md border hairline bg-paper px-3 py-1.5 text-sm";
const label = "text-xs text-mute";

export default function CustomerForm({ customer }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: customer.name,
    name_kana: customer.name_kana ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    notes: customer.notes ?? "",
  });

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateCustomer(customer.id, form);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-medium">{customer.name}</div>
            {customer.name_kana && (
              <div className="text-xs text-mute">{customer.name_kana}</div>
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border hairline px-2.5 py-1 text-xs hover:bg-accent-soft"
          >
            編集
          </button>
        </div>
        <dl className="mt-4 space-y-2.5 text-sm">
          <div>
            <dt className={label}>電話番号</dt>
            <dd>{customer.phone || "—"}</dd>
          </div>
          <div>
            <dt className={label}>メール</dt>
            <dd className="break-all">{customer.email || "—"}</dd>
          </div>
          <div>
            <dt className={label}>メモ</dt>
            <dd className="whitespace-pre-wrap">{customer.notes || "—"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>名前 *</label>
        <input
          className={input}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div>
        <label className={label}>ふりがな</label>
        <input
          className={input}
          value={form.name_kana}
          onChange={(e) => setForm({ ...form, name_kana: e.target.value })}
        />
      </div>
      <div>
        <label className={label}>電話番号</label>
        <input
          className={input}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div>
        <label className={label}>メール</label>
        <input
          type="email"
          className={input}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div>
        <label className={label}>メモ</label>
        <textarea
          className={`${input} min-h-20`}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={busy || !form.name.trim()}
          onClick={save}
          className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-40"
        >
          保存
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setError(null);
            setForm({
              name: customer.name,
              name_kana: customer.name_kana ?? "",
              phone: customer.phone ?? "",
              email: customer.email ?? "",
              notes: customer.notes ?? "",
            });
          }}
          className="rounded-md border hairline px-3 py-1.5 text-sm hover:bg-accent-soft"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
