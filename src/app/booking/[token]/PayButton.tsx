"use client";

import { useState } from "react";

export function PayButton({ token, card }: { token: string; card?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bookings/${token}/pay`, { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { checkout_url: string };
      window.location.href = data.checkout_url;
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(
      (data as { error?: string }).error ?? "決済ページを開けませんでした"
    );
    setBusy(false);
  }

  return (
    <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-[13px] text-amber-800">
        {card
          ? "この予約はカード登録が必要です。当日のお支払いは店舗で、キャンセル料のみ登録カードへ請求されます。"
          : "この予約は事前決済です。まだお支払いが完了していません。"}
      </p>
      <button
        onClick={pay}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-ink px-4 py-2.5 text-sm text-paper disabled:opacity-40"
      >
        {busy
          ? card
            ? "登録ページへ移動中…"
            : "決済ページへ移動中…"
          : card
            ? "カードを登録する"
            : "支払いを完了する"}
      </button>
      {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}
