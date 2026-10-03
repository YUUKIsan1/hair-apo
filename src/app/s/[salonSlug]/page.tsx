import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  getBusinessHours,
  getMenus,
  getSalonBySlug,
  getStaffList,
} from "@/lib/queries";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

const ROLE_LABEL: Record<string, string> = {
  owner: "オーナー",
  stylist: "スタイリスト",
  assistant: "アシスタント",
};

export default async function SalonPage({
  params,
}: {
  params: Promise<{ salonSlug: string }>;
}) {
  const { salonSlug } = await params;
  const salon = await getSalonBySlug(salonSlug);
  if (!salon) notFound();

  const [staff, menus, hours] = await Promise.all([
    getStaffList(salon.id),
    getMenus(salon.id),
    getBusinessHours(salon.id),
  ]);
  const hoursByDow = new Map(hours.map((h) => [h.day_of_week, h]));

  const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
  const heroSrc = salon.hero_image_url ?? "/images/salon-hero.jpg";
  // 0005未適用のDBでは undefined になるので既定値にフォールバック
  const template = salon.template ?? "photo";
  const accent = salon.theme_color ?? "#1c1917";

  return (
    <main
      className="pb-28"
      style={{ "--salon-accent": accent } as CSSProperties}
    >
      {template === "photo" && (
        <div className="relative h-[52vh] min-h-[340px] w-full">
          <Image
            src={heroSrc}
            alt={`${salon.name} 店内`}
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-6 pb-8">
            <h1 className="text-3xl font-bold tracking-wide text-white sm:text-4xl">
              {salon.name}
            </h1>
            {salon.address && (
              <p className="mt-2 text-sm text-white/80">{salon.address}</p>
            )}
          </div>
        </div>
      )}

      {template === "card" && (
        <div className="mx-auto max-w-3xl px-6 pt-8">
          <div className="relative h-[38vh] min-h-[240px] w-full overflow-hidden rounded-xl">
            <Image
              src={heroSrc}
              alt={`${salon.name} 店内`}
              fill
              priority
              className="object-cover"
            />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-wide sm:text-4xl">
            {salon.name}
          </h1>
          {salon.address && (
            <p className="mt-2 text-sm text-[var(--color-mute)]">
              {salon.address}
            </p>
          )}
        </div>
      )}

      {template === "simple" && (
        <div className="mx-auto max-w-3xl border-b hairline px-6 py-12">
          <h1 className="text-3xl font-bold tracking-wide sm:text-4xl">
            {salon.name}
          </h1>
          {salon.address && (
            <p className="mt-3 text-sm text-[var(--color-mute)]">
              {salon.address}
            </p>
          )}
        </div>
      )}

      <div className="mx-auto max-w-3xl px-6">
        {/* 紹介文 */}
        {salon.description && (
          <section className="border-b hairline py-10">
            <p className="whitespace-pre-line leading-8 text-[15px]">
              {salon.description}
            </p>
          </section>
        )}

        {/* メニュー */}
        <section className="border-b hairline py-10">
          <h2 className="text-lg font-bold">メニュー</h2>
          <ul className="mt-6 divide-y divide-[var(--color-line)]">
            {menus.map((m) => (
              <li key={m.id} className="flex items-center gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{m.name}</p>
                  {m.description && (
                    <p className="mt-1 text-[13px] text-[var(--color-mute)]">
                      {m.description}
                    </p>
                  )}
                  <p className="mt-1 text-[12px] text-[var(--color-mute)]">
                    {m.duration_minutes}分
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold tabular-nums">
                  {yen(m.price)}
                  <span className="ml-1 text-[11px] text-[var(--color-mute)]">
                    税込
                  </span>
                </p>
                <Link
                  href={`/s/${salon.slug}/book?menu=${m.id}`}
                  className="shrink-0 rounded-md bg-[var(--salon-accent)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:opacity-85"
                >
                  予約
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* スタッフ */}
        <section className="border-b hairline py-10">
          <h2 className="text-lg font-bold">スタッフ</h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2">
            {staff.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-4 rounded-lg border hairline bg-[var(--color-card)] p-5"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-lg font-semibold text-[var(--color-accent-dark)]">
                  {s.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.name}
                    <span className="ml-2 text-[11px] text-[var(--color-mute)]">
                      {ROLE_LABEL[s.role] ?? s.role}
                    </span>
                  </p>
                  {s.bio && (
                    <p className="mt-1 text-[13px] leading-6 text-[var(--color-mute)]">
                      {s.bio}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 店舗情報 */}
        <section className="py-10">
          <h2 className="text-lg font-bold">店舗情報</h2>
          <dl className="mt-6 divide-y divide-[var(--color-line)] border-y hairline text-[14px]">
            <div className="grid grid-cols-[6rem_1fr] gap-4 py-3">
              <dt className="text-[var(--color-mute)]">住所</dt>
              <dd>
                {salon.postal_code && `〒${salon.postal_code}`}
                <br />
                {salon.address}
              </dd>
            </div>
            {salon.phone && (
              <div className="grid grid-cols-[6rem_1fr] gap-4 py-3">
                <dt className="text-[var(--color-mute)]">電話</dt>
                <dd>
                  <a href={`tel:${salon.phone}`} className="underline underline-offset-4">
                    {salon.phone}
                  </a>
                </dd>
              </div>
            )}
            <div className="grid grid-cols-[6rem_1fr] gap-4 py-3">
              <dt className="text-[var(--color-mute)]">営業時間</dt>
              <dd>
                <ul className="space-y-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const h = hoursByDow.get(d);
                    return (
                      <li key={d} className="flex gap-3">
                        <span className="w-6 text-[var(--color-mute)]">
                          {DOW[d]}
                        </span>
                        {h ? (
                          <span>
                            {h.start_time.slice(0, 5)} 〜 {h.end_time.slice(0, 5)}
                          </span>
                        ) : (
                          <span className="text-[var(--color-mute)]">休み</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* 固定CTA */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t hairline bg-[var(--color-paper)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{salon.name}</p>
            <p className="text-[11px] text-[var(--color-mute)]">Web予約 24時間受付</p>
          </div>
          <Link
            href={`/s/${salon.slug}/book`}
            className="rounded-lg bg-[var(--salon-accent)] px-6 py-3 text-[14px] font-medium text-white transition hover:opacity-85"
          >
            予約する
          </Link>
        </div>
      </div>
    </main>
  );
}
