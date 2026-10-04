"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

type Result = { error?: string };

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v: unknown, max: number) =>
  v === undefined || v === null || (typeof v === "string" && v.length <= max);

// ---- 顧客情報 ----

export async function updateCustomer(
  customerId: string,
  input: {
    name: string;
    name_kana: string;
    phone: string;
    email: string;
    notes: string;
  }
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "認証されていません" };
  if (
    !str(customerId, 64) ||
    !str(input.name, 100) ||
    !optStr(input.name_kana, 100) ||
    !optStr(input.phone, 30) ||
    !optStr(input.email, 254) ||
    !optStr(input.notes, 1000)
  ) {
    return { error: "入力内容が正しくありません" };
  }

  const { error } = await createServiceClient()
    .from("customers")
    .update({
      name: input.name.trim(),
      name_kana: input.name_kana.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      notes: input.notes.trim() || null,
    })
    .eq("id", customerId)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return {};
}

// ---- カルテ ----

interface KarteInput {
  customer_id: string;
  visited_at: string; // ISO or "YYYY-MM-DD"
  staff_id: string | null;
  appointment_id: string | null;
  memo: string;
}

function validateKarte(input: Omit<KarteInput, "customer_id">): string | null {
  if (!str(input.visited_at, 40)) return "来店日時は必須です";
  if (Number.isNaN(new Date(input.visited_at).getTime()))
    return "来店日時の形式が正しくありません";
  if (input.staff_id !== null && !str(input.staff_id, 64))
    return "入力内容が正しくありません";
  if (input.appointment_id !== null && !str(input.appointment_id, 64))
    return "入力内容が正しくありません";
  if (!optStr(input.memo, 4000)) return "メモが長すぎます";
  return null;
}

export async function addKarte(input: KarteInput): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "認証されていません" };
  if (!str(input.customer_id, 64)) return { error: "入力内容が正しくありません" };
  const bad = validateKarte(input);
  if (bad) return { error: bad };

  const db = createServiceClient();
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("id", input.customer_id)
    .eq("salon_id", ctx.salon.id)
    .maybeSingle();
  if (!customer) return { error: "顧客が見つかりません" };

  if (input.staff_id) {
    const { data: staff } = await db
      .from("staff")
      .select("id")
      .eq("id", input.staff_id)
      .eq("salon_id", ctx.salon.id)
      .maybeSingle();
    if (!staff) return { error: "スタッフが見つかりません" };
  }
  if (input.appointment_id) {
    const { data: appt } = await db
      .from("appointments")
      .select("id")
      .eq("id", input.appointment_id)
      .eq("salon_id", ctx.salon.id)
      .eq("customer_id", input.customer_id)
      .maybeSingle();
    if (!appt) return { error: "予約が見つかりません" };
  }

  const { error } = await db.from("karts").insert({
    salon_id: ctx.salon.id,
    customer_id: input.customer_id,
    appointment_id: input.appointment_id,
    staff_id: input.staff_id,
    visited_at: new Date(input.visited_at).toISOString(),
    memo: input.memo.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/customers/${input.customer_id}`);
  return {};
}

export async function updateKarte(
  karteId: string,
  input: Omit<KarteInput, "customer_id">
): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "認証されていません" };
  if (!str(karteId, 64)) return { error: "入力内容が正しくありません" };
  const bad = validateKarte(input);
  if (bad) return { error: bad };

  const db = createServiceClient();
  const { data: karte } = await db
    .from("karts")
    .select("id, customer_id")
    .eq("id", karteId)
    .eq("salon_id", ctx.salon.id)
    .maybeSingle();
  if (!karte) return { error: "カルテが見つかりません" };

  if (input.staff_id) {
    const { data: staff } = await db
      .from("staff")
      .select("id")
      .eq("id", input.staff_id)
      .eq("salon_id", ctx.salon.id)
      .maybeSingle();
    if (!staff) return { error: "スタッフが見つかりません" };
  }
  if (input.appointment_id) {
    const { data: appt } = await db
      .from("appointments")
      .select("id")
      .eq("id", input.appointment_id)
      .eq("salon_id", ctx.salon.id)
      .eq("customer_id", karte.customer_id)
      .maybeSingle();
    if (!appt) return { error: "予約が見つかりません" };
  }

  const { error } = await db
    .from("karts")
    .update({
      visited_at: new Date(input.visited_at).toISOString(),
      staff_id: input.staff_id,
      appointment_id: input.appointment_id,
      memo: input.memo.trim() || null,
    })
    .eq("id", karteId)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/customers/${karte.customer_id}`);
  return {};
}

export async function deleteKarte(karteId: string): Promise<Result> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "認証されていません" };
  if (!str(karteId, 64)) return { error: "入力内容が正しくありません" };

  const db = createServiceClient();
  const { data: karte } = await db
    .from("karts")
    .select("id, customer_id")
    .eq("id", karteId)
    .eq("salon_id", ctx.salon.id)
    .maybeSingle();
  if (!karte) return { error: "カルテが見つかりません" };

  const { error } = await db
    .from("karts")
    .delete()
    .eq("id", karteId)
    .eq("salon_id", ctx.salon.id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/customers/${karte.customer_id}`);
  return {};
}
