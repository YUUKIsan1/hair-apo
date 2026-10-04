"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOpsUser } from "@/lib/ops";
import { createServiceClient } from "@/lib/supabase/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

// 承認失敗を画面に出す。server actionはPromise<void>なので、
// 失敗理由はクエリパラメータで一覧画面に返す
function fail(message: string): never {
  redirect(`/ops/applications?status=pending&error=${encodeURIComponent(message)}`);
}

// 有効化リンクのベースURL。Stripeのreturn_urlと同じ組み立て方
async function origin(): Promise<string> {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

// 承認をpending→approvedに先に進めて取り込む。同時実行や二重送信では
// 先に取り込んだ側だけが進む。失敗時は作成物を消してpendingに戻す。
//
// オーナー権限の紐付けはここでは行わない。承認されたサロンのみ作成し、
// 申込者本人がメール内リンク(/accept)をログイン済みで開いた時点で
// confirmApplicationが紐付ける(本人同意フロー)
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

  const acceptUrl = `${await origin()}/accept?token=${app.accept_token}`;

  // 既登録ユーザーかを先に調べる(招待APIは既登録だとエラーになる)
  let existingUserId: string | null = null;
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
      existingUserId = hit.id;
      break;
    }
    if (users.length < 1000) break;
  }

  if (existingUserId) {
    // 1ユーザーが複数サロンに所属すると/adminの判定(maybeSingle)が
    // 壊れてログイン不可になる。別サロン所属のユーザーは承認できない
    const { data: membership } = await db
      .from("salon_users")
      .select("user_id")
      .eq("user_id", existingUserId)
      .maybeSingle();
    if (membership) {
      await db.from("salons").delete().eq("id", salon!.id);
      await revert(null);
      fail("そのメールアドレスはすでに別のサロンのアカウントとして登録されています");
    }
    // 既存アカウントにはマジックリンクを送る。リンクを開くと
    // ログイン済み状態で /accept に着地し、本人の操作で紐付く
    const { error: otpErr } = await db.auth.signInWithOtp({
      email: app.email,
      options: { shouldCreateUser: false, emailRedirectTo: acceptUrl },
    });
    if (otpErr) {
      console.error(`[ops] approveApplication otp failed:`, otpErr);
      await db.from("salons").delete().eq("id", salon!.id);
      await revert(null);
      fail("有効化メールの送信に失敗しました。メールアドレスを確認してください");
    }
  } else {
    // 未登録ならSupabaseの招待メール。パスワード設定後 /accept に着地する
    const { data: invited, error: inviteErr } =
      await db.auth.admin.inviteUserByEmail(app.email, {
        redirectTo: acceptUrl,
      });
    if (inviteErr || !invited?.user) {
      console.error(`[ops] approveApplication invite failed:`, inviteErr);
      await db.from("salons").delete().eq("id", salon!.id);
      await revert(invited?.user?.id ?? null);
      fail("オーナーアカウントの招待に失敗しました。メールアドレスを確認してください");
    }
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
