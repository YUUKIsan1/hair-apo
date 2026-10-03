"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelButton({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function cancel() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/bookings/${token}/cancel`, { method: "POST" });
    if (res.ok) {
      router.refresh();
      setConfirming(false);
    } else {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "キャンセルに失敗しました");
    }
    setLoading(false);
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border hairline py-3.5 text-[14px] text-[var(--color-mute)] transition hover:bg-[var(--color-accent-soft)]"
      >
        この予約をキャンセルする
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-center">
      <p className="text-[13px] text-red-700">
        本当にキャンセルしますか?この操作は取り消せません。
      </p>
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-lg border hairline bg-white py-3 text-[14px]"
        >
          戻る
        </button>
        <button
          onClick={cancel}
          disabled={loading}
          className="flex-1 rounded-lg bg-red-600 py-3 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {loading ? "処理中…" : "キャンセルする"}
        </button>
      </div>
      {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}
    </div>
  );
}
