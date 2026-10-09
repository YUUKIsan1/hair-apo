"use server";

import { getAdminContext } from "@/lib/admin";
import { seedUnconfiguredShifts } from "@/lib/shiftDefaults";
import { createServiceClient } from "@/lib/supabase/server";

// ウィザードのメニュー作成で担当者へ全員割り当てるため
// このサロンの有効スタッフ一覧を返す
export async function getActiveStaff(): Promise<
  { id: string; name: string }[]
> {
  const ctx = await getAdminContext();
  if (!ctx) return [];
  const { data } = await createServiceClient()
    .from("staff")
    .select("id, name")
    .eq("salon_id", ctx.salon.id)
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

// シフト未設定(shifts_configured=false)のスタッフに
// 営業時間と同じ週間シフトを入れる。ウィザードの
// 「シフトを自動設定」ボタンから呼ぶ
export async function seedStaffShifts(): Promise<{ error?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "認証されていません" };
  const db = createServiceClient();
  const { data: bh } = await db
    .from("business_hours")
    .select("day_of_week, start_time, end_time")
    .eq("salon_id", ctx.salon.id);
  if (!bh || bh.length === 0) {
    return { error: "先に営業時間を設定してください" };
  }
  const r = await seedUnconfiguredShifts(db, ctx.salon.id, bh);
  if (r.error) return r;
  return {};
}
