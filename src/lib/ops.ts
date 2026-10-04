import type { User } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/supabase/server-auth";
import { createServiceClient } from "@/lib/supabase/server";

// 運営側(/ops)の認可。ログイン中ユーザーがops_usersにいるかを返す。
// salon_membersではなくops_usersを見る点がgetAdminContextとの違い
export async function getOpsUser(): Promise<User | null> {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();
  const { data } = await db
    .from("ops_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return data ? user : null;
}
