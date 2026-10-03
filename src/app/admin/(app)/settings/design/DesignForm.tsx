"use client";

import { useRef, useState } from "react";
import { updateSalonDesign, uploadHeroImage } from "../actions";
import type { SalonTemplate } from "@/lib/types";

const TEMPLATES: { id: SalonTemplate; name: string; desc: string }[] = [
  {
    id: "photo",
    name: "フォト",
    desc: "写真を画面いっぱいに使ったビジュアル重視のページ",
  },
  {
    id: "card",
    name: "カード",
    desc: "写真をカード内に収めた、すっきりしたページ",
  },
  {
    id: "simple",
    name: "シンプル",
    desc: "写真なし。店名と情報中心の軽いページ",
  },
];

const COLORS = [
  { id: "#1c1917", name: "ブラック" },
  { id: "#334155", name: "ネイビー" },
  { id: "#7c5a3a", name: "ブラウン" },
  { id: "#3f6212", name: "グリーン" },
  { id: "#c2410c", name: "テラコッタ" },
  { id: "#881337", name: "ボルドー" },
  { id: "#0e7490", name: "シアン" },
  { id: "#525252", name: "グレー" },
];

export default function DesignForm({
  initialTemplate,
  initialColor,
  heroImageUrl,
  slug,
}: {
  initialTemplate: SalonTemplate;
  initialColor: string;
  heroImageUrl: string | null;
  slug: string;
}) {
  const [template, setTemplate] = useState<SalonTemplate>(initialTemplate);
  const [color, setColor] = useState(initialColor);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await updateSalonDesign({ template, theme_color: color });
    setBusy(false);
    if (res.error) setError(res.error);
    else setSaved(true);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadHeroImage(fd);
    setUploading(false);
    if (res.error) setError(res.error);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <p className="mb-2 text-xs text-mute">ページテンプレート</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              className={`rounded-lg border p-4 text-left ${
                template === t.id
                  ? "border-ink bg-card"
                  : "hairline bg-card hover:border-mute"
              }`}
            >
              <p className="text-sm font-semibold text-ink">{t.name}</p>
              <p className="mt-1 text-xs leading-5 text-mute">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-mute">キーカラー(予約ボタンなどに反映)</p>
        <div className="flex flex-wrap gap-2.5">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.name}
              onClick={() => setColor(c.id)}
              className={`size-9 rounded-full border-2 ${
                color === c.id ? "border-ink" : "border-transparent"
              }`}
              style={{ backgroundColor: c.id }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-mute">
          メイン画像(フォト/カードテンプレの上部に表示・5MBまで)
        </p>
        {heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt="現在のメイン画像"
            className="mb-3 h-32 w-full max-w-md rounded-lg object-cover"
          />
        ) : (
          <p className="mb-3 text-sm text-mute">
            未設定(デフォルト画像が使われます)
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
          disabled={uploading}
          className="text-sm text-mute file:mr-3 file:rounded-lg file:border hairline file:bg-card file:px-4 file:py-2 file:text-sm file:text-ink"
        />
        {uploading && <p className="mt-2 text-sm text-mute">アップロード中…</p>}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm text-paper disabled:opacity-40"
        >
          {busy ? "保存中…" : "保存する"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-700">
            保存しました。<a className="underline" href={`/s/${slug}`} target="_blank" rel="noreferrer">公開ページを見る</a>
          </span>
        )}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </form>
  );
}
