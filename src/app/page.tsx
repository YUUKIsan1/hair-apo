import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="eyebrow">hair salon booking</p>
      <h1 className="font-display mt-4 text-4xl">ヘアアポ</h1>
      <p className="mt-6 text-[14px] leading-7 text-[var(--color-mute)]">
        個人〜小規模サロンのための
        <br />
        予約・顧客管理プラットフォーム
      </p>
      <div className="mt-10">
        <Link
          href="/s/theater"
          className="inline-block rounded-full border border-[var(--color-accent)] px-6 py-3 text-[14px] text-[var(--color-accent-dark)] transition hover:bg-[var(--color-accent-soft)]"
        >
          デモ: THEATER の予約ページを見る
        </Link>
      </div>
    </main>
  );
}
