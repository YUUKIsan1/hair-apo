"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StatusActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: string) {
    if (next === "cancelled" && !confirm("この予約をキャンセルしますか?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "更新に失敗しました");
      return;
    }
    router.refresh();
  }

  const btn =
    "rounded-md border hairline bg-card px-2.5 py-1 text-xs hover:bg-accent-soft disabled:opacity-40";

  if (status !== "confirmed") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button disabled={busy} onClick={() => update("confirmed")} className={btn}>
          予約に戻す
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button disabled={busy} onClick={() => update("completed")} className={btn}>
          完了
        </button>
        <button disabled={busy} onClick={() => update("no_show")} className={btn}>
          ノーショー
        </button>
        <button disabled={busy} onClick={() => update("cancelled")} className={btn}>
          キャンセル
        </button>
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
