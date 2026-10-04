"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOpsUser } from "@/lib/ops";
import { createServiceClient } from "@/lib/supabase/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

// 承認失敗を画面に出す。server actionはPromise<void>なので、
// 失敗理由はクエリパラメータで一覧画面に返す
function fail(message: string): never {
  redirect(`/ops/applications?status=pending&error=${encodeURIComponent(message)}`);
}

// 申し込みの承認: サロン作成→オーナーのauthユーザー招待/紐付け→申し込みを完了にする
export async function approveApplication(
  applicationId: string,
  formData: FormData
): Promise<void> {
  const user = await getOpsUser();
  if (!user) return;

  const db = createServiceClient();
  const { data: app } = await db
    .from("salon_applications")
    .select("*")
    .eq("id", applicationId)
    .single();
  if (!app || app.status !== "pending") return;

  // slugはフォーム入力 > 申込時の希望 > 自動発行の順。衝突時も自動発行に倒す
  let slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  if (!slug) slug = (app.slug as string | null) ?? "";
  if (!SLUG_RE.test(slug)) slug = "";
  if (slug) {
    const { data: taken } = await db
      .from("salons")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (taken) slug = "";
  }
  if (!slug) slug = `s-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

  const { data: salon, error: salonErr } = await db
    .from("salons")
    .insert({ slug, name: app.salon_name })
    .select("id")
    .single();
  if (salonErr || !salon) {
    console.error(`[ops] approveApplication salon insert failed:`, salonErr);
    fail("サロンの作成に失敗しました。しばらくして再度お試しください");
  }

  // 未登録メールなら招待メールを送ってユーザー作成。
  // 既登録ならそのユーザーをオーナーとして紐付ける(既存パスワードでログイン可)
  let userId: string | null = null;
  const { data: invited, error: inviteErr } =
    await db.auth.admin.inviteUserByEmail(app.email);
  if (!inviteErr && invited?.user) {
    userId = invited.user.id;
  } else {
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    const found = list?.users?.find(
      (u) => u.email?.toLowerCase() === app.email.toLowerCase()
    );
    if (found) {
      // 1ユーザーが複数サロンに所属すると/adminの判定(maybeSingle)が
      // 壊れてログイン不可になる。別サロン所属のユーザーは承認できない
      const { data: membership } = await db
        .from("salon_users")
        .select("user_id")
        .eq("user_id", found.id)
        .maybeSingle();
      if (membership) {
        await db.from("salons").delete().eq("id", salon!.id);
        fail("そのメールアドレスはすでに別のサロンのアカウントとして登録されています");
      }
      userId = found.id;
    }
  }
  if (!userId) {
    console.error(`[ops] approveApplication auth user failed:`, inviteErr);
    await db.from("salons").delete().eq("id", salon!.id);
    fail("オーナーアカウントの招待に失敗しました。メールアドレスを確認してください");
  }

  const { error: linkErr } = await db.from("salon_users").insert({
    salon_id: salon!.id,
    user_id: userId,
    role: "owner",
  });
  if (linkErr) {
    console.error(`[ops] approveApplication salon_users failed:`, linkErr);
    await db.from("salons").delete().eq("id", salon!.id);
    fail("アカウントの紐付けに失敗しました。しばらくして再度お試しください");
  }

  const { error: updErr } = await db
    .from("salon_applications")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      created_salon_id: salon.id,
    })
    .eq("id", applicationId);
  if (updErr) {
    console.error(`[ops] approveApplication status update failed:`, updErr);
  }
  revalidatePath("/ops/applications");
  revalidatePath("/ops");
}

// 申し込みの却下
export async function rejectApplication(applicationId: string): Promise<void> {
  const user = await getOpsUser();
  if (!user) return;

  const db = createServiceClient();
  const { error } = await db
    .from("salon_applications")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("status", "pending");
  if (error) {
    console.error(`[ops] rejectApplication failed:`, error);
    return;
  }
  revalidatePath("/ops/applications");
}
