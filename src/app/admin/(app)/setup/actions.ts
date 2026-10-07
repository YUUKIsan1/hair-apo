"use server";

import { getAdminContext } from "@/lib/admin";
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
