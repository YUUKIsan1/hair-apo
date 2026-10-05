"use client";

import { useState } from "react";

const input =
  "w-full rounded-lg border hairline bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-mute";

export default function ApplyForm() {
  const [salonName, setSalonName] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [slug, setSlug] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [staffCount, setStaffCount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salon_name: salonName,
        slug: slug || null,
        contact_name: contactName,
        email,
        phone: phone || null,
        staff_count: staffCount ? Number(staffCount) : null,
        note: note || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "送信に失敗しました。時間をおいて再度お試しください");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-lg border hairline bg-card p-6 text-center">
        <p className="text-sm font-medium">お申し込みを受け付けました</p>
        <p className="mt-2 text-xs leading-5 text-mute">
          運営が確認のうえ、ログイン情報をメールでお送りします。
          <br />
          数日経っても届かない場合はお問い合わせください。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={label}>店舗名 *</label>
        <input
          className={input}
          value={salonName}
          onChange={(e) => setSalonName(e.target.value)}
          required
          maxLength={100}
        />
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoSlug}
            onChange={(e) => {
              setAutoSlug(e.target.checked);
              if (e.target.checked) setSlug("");
            }}
            className="size-4 accent-[var(--color-ink)]"
          />
          店舗URLは自動で発行する
        </label>
        {!autoSlug && (
          <div className="mt-2">
            <div className="flex items-center gap-1">
              <span className="text-sm text-mute">/s/</span>
              <input
                className={input}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="mystore"
                pattern="[a-z0-9][a-z0-9-]{1,62}"
                maxLength={63}
                required={!autoSlug}
              />
            </div>
            <p className="mt-1 text-xs text-mute">
              半角英数字とハイフン(2〜63文字)
            </p>
          </div>
        )}
      </div>
      <div>
        <label className={label}>担当者名 *</label>
        <input
          className={input}
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          required
          maxLength={100}
        />
      </div>
      <div>
        <label className={label}>メールアドレス *</label>
        <input
          type="email"
          className={input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={254}
        />
        <p className="mt-1 text-xs text-mute">ログイン案内をお送りする宛先です</p>
      </div>
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div>
        <label className={label}>電話番号</label>
        <input
          type="tel"
          className={input}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={20}
        />
      </div>
      <div>
        <label className={label}>スタッフ数</label>
        <select
          className={input}
          value={staffCount}
          onChange={(e) => setStaffCount(e.target.value)}
        >
          <option value="">選択してください</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}名
            </option>
          ))}
          <option value="11">11名以上</option>
        </select>
      </div>
      <div>
        <label className={label}>備考</label>
        <textarea
          className={`${input} min-h-24`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-medium text-paper transition hover:opacity-85 disabled:opacity-50"
      >
        {busy ? "送信中…" : "申し込む"}
      </button>
    </form>
  );
}
