"use client";

import { createBrowserClient } from "@supabase/ssr";

// ブラウザ用(anonキー + cookieセッション)。ログイン/ログアウトと
// RLSのサロンメンバーポリシーが効く範囲の読み書きに使う。
export function createBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
