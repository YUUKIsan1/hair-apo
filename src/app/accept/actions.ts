"use server";

import { createAuthClient } from "@/lib/supabase/server-auth";
import { createServiceClient } from "@/lib/supabase/server";

// 有効化リンクを開いた本人の操作で、承認済みサロンとログイン中
// アカウントを紐付ける。メールアドレス一致+未所属のときだけ通す
export async function confirmApplication(
  token: string
): Promise<{ ok?: true; salonName?: string; error?: string }> {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: "ログインしてください" };

  const db = createServiceClient();
  const { data: app } = await db
    .from("salon_applications")
    .select("id, email, status, created_salon_id")
    .eq("accept_token", token)
    .maybeSingle();
  if (!app || app.status !== "approved" || !app.created_salon_id) {
    return { error: "このリンクは無効か、すでに使用済みです" };
  }
  if (user.email?.toLowerCase() !== app.email.toLowerCase()) {
    return { error: "申し込みに使われたメールアドレスのアカウントでログインしてください" };
  }
  const { data: membership } = await db
    .from("salon_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership) {
    return { error: "このアカウントはすでにサロンに所属しています" };
  }
  const { error: insertErr } = await db.from("salon_users").insert({
    salon_id: app.created_salon_id,
    user_id: user.id,
    role: "owner",
  });
  // 同時クリック等の一意制約違反は紐付け済みと同義なので成功扱い
  if (insertErr && insertErr.code !== "23505") {
    console.error(`[accept] salon_users insert failed:`, insertErr);
    return { error: "サロンの有効化に失敗しました。しばらくして再度お試しください" };
  }
  await db
    .from("salon_applications")
    .update({ accept_token: null })
    .eq("id", app.id);

  const { data: salon } = await db
    .from("salons")
    .select("name")
    .eq("id", app.created_salon_id)
    .maybeSingle();
  return { ok: true, salonName: salon?.name ?? undefined };
}
