"use client";

import { useState } from "react";
import { startStripeConnect } from "./actions";

export default function BillingPanel({
  configured,
  accountId,
  onboarded,
  feeBps,
}: {
  configured: boolean;
  accountId: string | null;
  onboarded: boolean;
  feeBps: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await startStripeConnect();
    if (res.url) {
      window.location.href = res.url;
      return;
    }
    setError(res.error ?? "連携を開始できませんでした");
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-xs text-mute">Stripe連携(事前決済・入金)</p>
        {!configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            サーバーにSTRIPE_SECRET_KEYが設定されていません。設定後に連携できるようになります。
          </p>
        ) : onboarded ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            連携済みです。事前決済の売上はこのアカウントに入金されます。
            <span className="mt-1 block text-xs opacity-70">{accountId}</span>
          </div>
        ) : accountId ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            連携手続きが途中です。オンボーディングを完了してください。
            <span className="mt-1 block text-xs opacity-70">{accountId}</span>
          </div>
        ) : (
          <p className="text-sm text-mute">
            まだ連携されていません。Stripe Expressアカウントを作成して、売上の入金先を登録してください。
          </p>
        )}
      </div>

      <div className="rounded-lg border hairline p-4 text-sm">
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt className="text-mute">プラットフォーム手数料(自前導線)</dt>
            <dd>{(feeBps / 100).toFixed(1)}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">決済方法</dt>
            <dd>クレジットカード(Stripe Checkout)</dd>
          </div>
        </dl>
      </div>

      {configured && !onboarded && (
        <button
          onClick={connect}
          disabled={busy}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm text-paper disabled:opacity-40"
        >
          {busy ? "Stripeへ移動中…" : accountId ? "連携手続きを続ける" : "Stripeと連携する"}
        </button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
