"use server";

import { revalidatePath } from "next/cache";
import { getOpsUser } from "@/lib/ops";
import { createServiceClient } from "@/lib/supabase/server";

// 請求書のステータス変更(運営のみ)。支払済みはpaid_atを記録する
export async function setInvoiceStatus(
  invoiceId: string,
  status: "open" | "paid" | "void"
): Promise<void> {
  const user = await getOpsUser();
  if (!user) return;

  const db = createServiceClient();
  const { error } = await db
    .from("invoices")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", invoiceId);
  if (error) {
    console.error(`[ops] setInvoiceStatus failed:`, error);
    return;
  }
  revalidatePath("/ops/billing");
}
