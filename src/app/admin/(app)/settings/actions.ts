"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

type Result = { error?: string };

async function requireCtx() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  return ctx;
}

const TIME_RE = /^\d{2}:\d{2}$/;

// ---- 店舗情報 ----

export async function updateSalon(input: {
  name: string;
  description: string;
  phone: string;
  postal_code: string;
  address: string;
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  if (!input.name.trim()) return { error: "店舗名は必須です" };

  const { error } = await createServiceClient()
    .from("salons")
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      phone: input.phone.trim() || null,
      postal_code: input.postal_code.trim() || null,
      address: input.address.trim() || null,
    })
    .eq("id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- 営業時間 ----

export async function saveBusinessHours(
  rows: { day_of_week: number; start_time: string; end_time: string }[]
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  for (const r of rows) {
    if (!TIME_RE.test(r.start_time) || !TIME_RE.test(r.end_time)) {
      return { error: "時刻の形式が正しくありません" };
    }
    if (r.end_time <= r.start_time) {
      return { error: "終了時刻は開始時刻より後にしてください" };
    }
  }

  const db = createServiceClient();
  const { error: delErr } = await db
    .from("business_hours")
    .delete()
    .eq("salon_id", ctx.salon.id);
  if (delErr) return { error: delErr.message };
  if (rows.length > 0) {
    const { error } = await db
      .from("business_hours")
      .insert(rows.map((r) => ({ ...r, salon_id: ctx.salon.id })));
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/settings/hours");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- スタッフ ----

export async function upsertStaff(input: {
  id?: string;
  name: string;
  role: "owner" | "stylist" | "assistant";
  bio: string;
  sort_order: number;
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  if (!input.name.trim()) return { error: "名前は必須です" };

  const db = createServiceClient();
  if (input.id) {
    const { error } = await db
      .from("staff")
      .update({
        name: input.name.trim(),
        role: input.role,
        bio: input.bio.trim() || null,
        sort_order: input.sort_order,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("salon_id", ctx.salon.id);
    if (error) return { error: error.message };
  } else {
    const { data: created, error } = await db
      .from("staff")
      .insert({
        salon_id: ctx.salon.id,
        name: input.name.trim(),
        role: input.role,
        bio: input.bio.trim() || null,
        sort_order: input.sort_order,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    // 新規スタッフは全メニュー担当可・指名可で作成(メニュー画面で調整)
    const { data: menus } = await db
      .from("menus")
      .select("id")
      .eq("salon_id", ctx.salon.id);
    if (menus && menus.length > 0) {
      await db.from("staff_menus").insert(
        menus.map((m) => ({
          staff_id: created.id,
          menu_id: m.id,
          nominable: true,
        }))
      );
    }
  }
  revalidatePath("/admin/settings/staff");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

export async function setStaffActive(
  staffId: string,
  active: boolean
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  const { error } = await createServiceClient()
    .from("staff")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", staffId)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/staff");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- メニュー ----

export async function upsertMenu(input: {
  id?: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  buffer_minutes: number;
  sort_order: number;
  staff: { staff_id: string; nominable: boolean }[];
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  if (!input.name.trim()) return { error: "メニュー名は必須です" };
  if (input.price < 0 || input.duration_minutes <= 0 || input.buffer_minutes < 0) {
    return { error: "価格・所要時間が不正です" };
  }
  if (input.staff.length === 0) {
    return { error: "担当スタッフを1人以上選んでください" };
  }

  const db = createServiceClient();
  let menuId = input.id;
  const fields = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    price: input.price,
    duration_minutes: input.duration_minutes,
    buffer_minutes: input.buffer_minutes,
    sort_order: input.sort_order,
  };
  if (menuId) {
    const { error } = await db
      .from("menus")
      .update(fields)
      .eq("id", menuId)
      .eq("salon_id", ctx.salon.id);
    if (error) return { error: error.message };
  } else {
    const { data: created, error } = await db
      .from("menus")
      .insert({
        ...fields,
        salon_id: ctx.salon.id,
        // 決済未実装のため any で作成。Stripe導入後に payment_mode を編集可能にする
        payment_mode: "any",
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    menuId = created.id;
  }

  // staff_menus は選択状態で置き換え
  const { error: delErr } = await db
    .from("staff_menus")
    .delete()
    .eq("menu_id", menuId);
  if (delErr) return { error: delErr.message };
  const { error: insErr } = await db.from("staff_menus").insert(
    input.staff.map((s) => ({
      menu_id: menuId,
      staff_id: s.staff_id,
      nominable: s.nominable,
    }))
  );
  if (insErr) return { error: insErr.message };

  revalidatePath("/admin/settings/menus");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

export async function setMenuActive(
  menuId: string,
  active: boolean
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  const { error } = await createServiceClient()
    .from("menus")
    .update({ is_active: active })
    .eq("id", menuId)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/menus");
  revalidatePath(`/s/${ctx.salon.slug}`);
  return {};
}

// ---- シフト ----

// 曜日繰り返しシフトを保存(特定日のシフトは消さない)
export async function saveShifts(
  staffId: string,
  rows: { day_of_week: number; start_time: string; end_time: string }[]
): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  for (const r of rows) {
    if (!TIME_RE.test(r.start_time) || !TIME_RE.test(r.end_time)) {
      return { error: "時刻の形式が正しくありません" };
    }
    if (r.end_time <= r.start_time) {
      return { error: "終了時刻は開始時刻より後にしてください" };
    }
  }

  const db = createServiceClient();
  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("salon_id", ctx.salon.id)
    .maybeSingle();
  if (!staff) return { error: "staff not found" };

  const { error: delErr } = await db
    .from("shifts")
    .delete()
    .eq("staff_id", staffId)
    .not("day_of_week", "is", null);
  if (delErr) return { error: delErr.message };
  if (rows.length > 0) {
    const { error } = await db
      .from("shifts")
      .insert(rows.map((r) => ({ ...r, staff_id: staffId })));
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/settings/shifts");
  return {};
}

// ---- 休み(特定日時) ----

export async function addTimeOff(input: {
  staff_id: string | null; // null = 店休
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
}): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: "日付が不正です" };
  }
  if (!TIME_RE.test(input.start_time) || !TIME_RE.test(input.end_time)) {
    return { error: "時刻の形式が正しくありません" };
  }
  if (input.end_time <= input.start_time) {
    return { error: "終了時刻は開始時刻より後にしてください" };
  }

  const { error } = await createServiceClient().from("time_off").insert({
    salon_id: ctx.salon.id,
    staff_id: input.staff_id,
    starts_at: `${input.date}T${input.start_time}:00+09:00`,
    ends_at: `${input.date}T${input.end_time}:00+09:00`,
    reason: input.reason.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/shifts");
  return {};
}

export async function deleteTimeOff(id: string): Promise<Result> {
  const ctx = await requireCtx();
  if (!ctx) return { error: "unauthorized" };
  const { error } = await createServiceClient()
    .from("time_off")
    .delete()
    .eq("id", id)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings/shifts");
  return {};
}
