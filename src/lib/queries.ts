import { supabase } from "@/lib/supabase/client";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  Appointment,
  BusinessHours,
  Menu,
  Salon,
  Shift,
  Staff,
  TimeOff,
} from "@/lib/types";

// 公開読み取り(anon key + RLS公開ポリシー)
export async function getSalons(): Promise<Salon[]> {
  const { data } = await supabase
    .from("salons")
    .select("*")
    .order("name");
  return data ?? [];
}

export async function getSalonBySlug(slug: string): Promise<Salon | null> {
  const { data } = await supabase
    .from("salons")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function getStaffList(salonId: string): Promise<Staff[]> {
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("salon_id", salonId)
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function getMenus(salonId: string): Promise<Menu[]> {
  const { data } = await supabase
    .from("menus")
    .select("*")
    .eq("salon_id", salonId)
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function getBusinessHours(salonId: string): Promise<BusinessHours[]> {
  const { data } = await supabase
    .from("business_hours")
    .select("*")
    .eq("salon_id", salonId);
  return data ?? [];
}

export async function getAllStaffMenuPairs(
  salonId: string
): Promise<{ staff_id: string; menu_id: string; nominable: boolean }[]> {
  const { data } = await supabase
    .from("staff_menus")
    .select("staff_id, menu_id, nominable, staff!inner(salon_id), menus!inner(salon_id)")
    .eq("staff.salon_id", salonId)
    .eq("menus.salon_id", salonId);
  return (data ?? []).map((r) => ({
    staff_id: r.staff_id,
    menu_id: r.menu_id,
    nominable: r.nominable,
  }));
}

export async function getStaffMenus(staffId: string): Promise<Menu[]> {
  const { data } = await supabase
    .from("staff_menus")
    .select("menu_id, menus(*)")
    .eq("staff_id", staffId);
  return (data ?? []).map((r) => r.menus as unknown as Menu).filter(Boolean);
}

// ---- 予約計算用(service role。API routeからのみ呼ぶ) ----

export async function getShifts(staffIds: string[]): Promise<Shift[]> {
  if (staffIds.length === 0) return [];
  const db = createServiceClient();
  const { data } = await db.from("shifts").select("*").in("staff_id", staffIds);
  return data ?? [];
}

export async function getTimeOff(
  salonId: string,
  from: string,
  to: string
): Promise<TimeOff[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("time_off")
    .select("*")
    .eq("salon_id", salonId)
    .lt("starts_at", to)
    .gt("ends_at", from);
  // 休み情報が取れないまま枠を開けると閉店時間帯を予約できてしまうのでfail closed
  if (error) throw new Error(`time_off fetch failed: ${error.message}`);
  return data ?? [];
}

export async function getAppointments(
  salonId: string,
  from: string,
  to: string
): Promise<Appointment[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("salon_id", salonId)
    .in("status", ["confirmed", "completed"])
    .lt("starts_at", to)
    .gt("ends_at", from);
  if (error) throw new Error(`appointments fetch failed: ${error.message}`);
  return data ?? [];
}

/** メニューを担当できるスタッフ(指名可/不可のフラグ付き)。フリー予約は全員が候補 */
export async function getStaffForMenu(
  salonId: string,
  menuId: string
): Promise<{ staff: Staff; nominable: boolean }[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("staff_menus")
    .select("nominable, staff!inner(*)")
    .eq("menu_id", menuId)
    .eq("staff.is_active", true);
  return (data ?? [])
    .map((r) => ({
      staff: r.staff as unknown as Staff,
      nominable: r.nominable,
    }))
    .filter((p) => p.staff.salon_id === salonId)
    .sort((a, b) => a.staff.sort_order - b.staff.sort_order);
}
