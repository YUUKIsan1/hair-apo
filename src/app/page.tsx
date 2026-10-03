import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold">ヘアアポ</h1>
      <p className="mt-6 text-[14px] leading-7 text-[var(--color-mute)]">
        個人〜小規模サロンのための
        <br />
        予約・顧客管理プラットフォーム
      </p>
      <div className="mt-10">
        <Link
          href="/s/theater"
          className="inline-block rounded-lg bg-[var(--color-ink)] px-6 py-3 text-[14px] font-medium text-white transition hover:opacity-85"
        >
          デモ: THEATER の予約ページを見る
        </Link>
      </div>
    </main>
  );
}
