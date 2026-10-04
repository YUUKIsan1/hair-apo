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

// 承認をpending→approvedに先に進めて取り込む。同時実行や二重送信では
// 先に取り込んだ側だけが進む。失敗時は作成物を消してpendingに戻す
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

  const { data: claimed } = await db
    .from("salon_applications")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return;

  // ここから先で失敗したら、作ったものを消してpendingに戻す
  const revert = async (createdUserId: string | null) => {
    if (createdUserId) {
      await db.auth.admin.deleteUser(createdUserId);
    }
    await db
      .from("salon_applications")
      .update({ status: "pending", reviewed_at: null })
      .eq("id", applicationId);
  };

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
    await revert(null);
    fail("サロンの作成に失敗しました。しばらくして再度お試しください");
  }

  // 未登録メールなら招待メールを送ってユーザー作成。
  // 既登録ならそのユーザーをオーナーとして紐付ける(既存パスワードでログイン可)
  let userId: string | null = null;
  let createdUserId: string | null = null;
  const { data: invited, error: inviteErr } =
    await db.auth.admin.inviteUserByEmail(app.email);
  if (!inviteErr && invited?.user) {
    userId = invited.user.id;
    createdUserId = invited.user.id;
  } else {
    // 既登録ユーザーを探す(1000件ごとにページング)
    let found: { id: string } | null = null;
    for (let page = 1; ; page++) {
      const { data: list } = await db.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      const users = list?.users ?? [];
      const hit = users.find(
        (u) => u.email?.toLowerCase() === app.email.toLowerCase()
      );
      if (hit) {
        found = hit;
        break;
      }
      if (users.length < 1000) break;
    }
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
        await revert(null);
        fail("そのメールアドレスはすでに別のサロンのアカウントとして登録されています");
      }
      userId = found.id;
    }
  }
  if (!userId) {
    console.error(`[ops] approveApplication auth user failed:`, inviteErr);
    await db.from("salons").delete().eq("id", salon!.id);
    await revert(null);
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
    await revert(createdUserId);
    fail("アカウントの紐付けに失敗しました。しばらくして再度お試しください");
  }

  const { error: updErr } = await db
    .from("salon_applications")
    .update({ created_salon_id: salon!.id })
    .eq("id", applicationId);
  if (updErr) {
    // statusはapproved済みなので重複承認の恐れはない。
    // リンク欠落のみ残るためログに残して成功扱いにする
    console.error(`[ops] approveApplication salon link failed:`, updErr);
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
