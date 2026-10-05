import { issueLineLinkCode, unlinkLine } from "./actions";

// LINE通知の連携カード。公式アカウントと友だちになり
// 連携コードをトークへ送ると通知がLINEに届くようになる
export default function LineCard({
  linked,
  code,
}: {
  linked: boolean;
  code: string | null;
}) {
  const addFriendUrl = process.env.LINE_ADD_FRIEND_URL;
  return (
    <section className="rounded-lg border hairline bg-card p-6">
      <h2 className="text-sm font-bold">LINE通知</h2>
      {linked ? (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-emerald-700">連携済み — 通知はLINEに届きます</p>
          <form action={unlinkLine}>
            <button className="rounded-md border hairline px-3 py-1.5 text-xs text-mute hover:bg-accent-soft">
              解除する
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-mute">
            LINE公式アカウントと友だちになり、表示される連携コードをトークに送ると、新規予約やキャンセルの通知がLINEに届きます。
          </p>
          {code ? (
            <div className="rounded-lg border hairline bg-paper p-4 text-center">
              <p className="text-xs text-mute">このコードをLINEトークに送信してください</p>
              <p className="mt-1 text-xl font-bold tracking-widest">S-{code}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {addFriendUrl && (
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-[#06c755] px-3 py-1.5 text-xs font-medium text-white hover:opacity-85"
              >
                LINEで友だち追加
              </a>
            )}
            <form action={issueLineLinkCode}>
              <button className="rounded-md border hairline px-3 py-1.5 text-xs text-mute hover:bg-accent-soft">
                {code ? "コードを再発行" : "連携コードを発行"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
