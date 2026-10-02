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
  const { data } = await db
    .from("time_off")
    .select("*")
    .eq("salon_id", salonId)
    .lt("starts_at", to)
    .gt("ends_at", from);
  return data ?? [];
}

export async function getAppointments(
  salonId: string,
  from: string,
  to: string
): Promise<Appointment[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("appointments")
    .select("*")
    .eq("salon_id", salonId)
    .eq("status", "confirmed")
    .lt("starts_at", to)
    .gt("ends_at", from);
  return data ?? [];
}

export async function getStaffForMenu(
  salonId: string,
  menuId: string
): Promise<Staff[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("staff_menus")
    .select("nominable, staff!inner(*)")
    .eq("menu_id", menuId)
    .eq("staff.is_active", true);
  const staff = (data ?? [])
    .filter((r) => r.nominable)
    .map((r) => r.staff as unknown as Staff)
    .filter((s) => s.salon_id === salonId)
    .sort((a, b) => a.sort_order - b.sort_order);
  return staff;
}
