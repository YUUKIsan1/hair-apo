import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// サロンスタッフ認証用(anonキー + cookieセッション)。
// Server Component / Route Handler から呼ぶ。cookie書き込みは
// Server Component では失敗するため try で握り、更新は middleware に任せる。
export async function createAuthClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            );
          } catch {
            // Server Component からの呼び出しでは cookie を書けない
          }
        },
      },
    }
  );
}
