"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowser } from "@/lib/supabase/browser";
import { confirmApplication } from "./actions";

type State =
  | { kind: "checking" }
  | { kind: "ready"; email: string }
  | { kind: "needLogin" }
  | { kind: "busy" }
  | { kind: "done"; salonName?: string }
  | { kind: "error"; message: string };

export default function AcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    const supabase = createBrowser();
    // メールリンク着地時のcode/#tokenをブラウザ側でセッション化する
    (async () => {
      const code = new URLSearchParams(location.search).get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => {});
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setState({ kind: "ready", email: session.user.email });
      } else {
        setState({ kind: "needLogin" });
      }
    })();
  }, []);

  async function onAccept() {
    setState({ kind: "busy" });
    const res = await confirmApplication(token);
    if (res.error) {
      setState({ kind: "error", message: res.error });
      return;
    }
    setState({ kind: "done", salonName: res.salonName });
    router.refresh();
  }

  if (state.kind === "checking" || state.kind === "busy") {
    return <p className="text-sm text-mute">確認中…</p>;
  }
  if (state.kind === "needLogin") {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-red-700">
          ログインが必要です。申し込みに使ったメールアドレスでログインしてから、このリンクをもう一度開いてください。
        </p>
        <Link
          href={`/admin/login?next=${encodeURIComponent(`/accept?token=${token}`)}`}
          className="inline-block rounded-lg bg-ink px-4 py-2.5 text-paper"
        >
          ログインへ
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return <p className="text-sm text-red-700">{state.message}</p>;
  }
  if (state.kind === "done") {
    return (
      <div className="space-y-3 text-sm">
        <p>
          {state.salonName
            ? `「${state.salonName}」の有効化が完了しました。`
            : "有効化が完了しました。"}
          営業時間・スタッフ・メニューを設定すると予約を受け付けられます。
        </p>
        <Link
          href="/admin/setup"
          className="inline-block rounded-lg bg-ink px-4 py-2.5 text-paper"
        >
          初期設定をはじめる
        </Link>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAccept}
      className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85"
    >
      {state.email} として有効化する
    </button>
  );
}
