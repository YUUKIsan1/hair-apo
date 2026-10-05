import Image from "next/image";
import Link from "next/link";
import { getSalonsWithMenus } from "@/lib/queries";

export default async function SalonIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const keyword = (q ?? "").trim().toLowerCase();
  const all = await getSalonsWithMenus();
  // 店舗名・住所・紹介文・メニュー名の部分一致(小文字比較)
  const salons = keyword
    ? all.filter((s) =>
        [s.name, s.address, s.description, s.postal_code, ...s.menuNames]
          .filter((v): v is string => !!v)
          .some((v) => v.toLowerCase().includes(keyword))
      )
    : all;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">サロンを探す</h1>
      <p className="mt-2 text-sm text-[var(--color-mute)]">
        Web予約 24時間受付
      </p>

      <form action="/s" method="get" className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="店舗名・エリア・メニューで検索(例: 渋谷, カット)"
          className="min-w-0 flex-1 rounded-lg border hairline bg-[var(--color-card)] px-4 py-2.5 text-[14px] outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-[var(--color-ink)] px-5 py-2.5 text-[14px] font-medium text-white transition hover:opacity-85"
        >
          検索
        </button>
      </form>

      {keyword && (
        <p className="mt-4 text-[13px] text-[var(--color-mute)]">
          「{q}」の検索結果: {salons.length}件
          <Link href="/s" className="ml-3 underline underline-offset-4">
            条件をクリア
          </Link>
        </p>
      )}

      <ul className="mt-8 space-y-4">
        {salons.map((s) => (
          <li key={s.id}>
            <Link
              href={`/s/${s.slug}?via=mall`}
              className="flex items-center gap-4 rounded-lg border hairline bg-[var(--color-card)] p-4 transition hover:border-[var(--color-mute)]"
            >
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md bg-[var(--color-accent-soft)]">
                {s.hero_image_url && (
                  <Image
                    src={s.hero_image_url}
                    alt={`${s.name} 店内`}
                    fill
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{s.name}</p>
                {s.address && (
                  <p className="mt-1 truncate text-[13px] text-[var(--color-mute)]">
                    {s.address}
                  </p>
                )}
                {s.menuNames.length > 0 && (
                  <p className="mt-1 truncate text-[12px] text-[var(--color-mute)]">
                    {s.menuNames.join(" / ")}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {salons.length === 0 && (
        <p className="mt-8 text-sm text-[var(--color-mute)]">
          {keyword
            ? "条件に合うサロンが見つかりませんでした。別のキーワードでお試しください。"
            : "掲載中のサロンはまだありません。"}
        </p>
      )}
    </main>
  );
}
