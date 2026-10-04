import { Suspense } from "react";
import AcceptClient from "./AcceptClient";

// 申込者本人の有効化ページ。メール内リンクから着地し、
// ログイン済みの本人だけが「有効化する」でオーナー権限を得る
export default async function AcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="mb-2 text-xl font-medium">サロンの有効化</h1>
      <p className="mb-6 text-sm text-mute">
        お申し込みが承認されました。ボタンを押すと管理画面が使えるようになります。
      </p>
      {token ? (
        <Suspense>
          <AcceptClient token={token} />
        </Suspense>
      ) : (
        <p className="text-sm text-red-700">このリンクは無効です</p>
      )}
    </main>
  );
}
