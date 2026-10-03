import Image from "next/image";
import Link from "next/link";
import { getSalons } from "@/lib/queries";

export default async function SalonIndexPage() {
  const salons = await getSalons();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">サロンを探す</h1>
      <p className="mt-2 text-sm text-[var(--color-mute)]">
        Web予約 24時間受付
      </p>

      <ul className="mt-8 space-y-4">
        {salons.map((s) => (
          <li key={s.id}>
            <Link
              href={`/s/${s.slug}`}
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
                {s.description && (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[var(--color-mute)]">
                    {s.description}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {salons.length === 0 && (
        <p className="mt-8 text-sm text-[var(--color-mute)]">
          掲載中のサロンはまだありません。
        </p>
      )}
    </main>
  );
}
