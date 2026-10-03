import type { User } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/supabase/server-auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { Salon } from "@/lib/types";

export interface AdminContext {
  user: User;
  salon: Salon;
  role: "owner" | "staff";
  staffId: string | null;
}

// ログイン中ユーザーと所属サロン。未ログイン・メンバー未登録なら null。
export async function getAdminContext(): Promise<AdminContext | null> {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();
  const { data: membership } = await db
    .from("salon_users")
    .select("salon_id, role, staff_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return null;

  const { data: salon } = await db
    .from("salons")
    .select("*")
    .eq("id", membership.salon_id)
    .single();
  if (!salon) return null;

  return { user, salon, role: membership.role, staffId: membership.staff_id };
}
