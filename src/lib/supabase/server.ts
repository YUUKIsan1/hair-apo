import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// サーバーサイド用(service role)。RLSをバイパスするため
// 予約作成・スロット計算・決済・通知など信頼境界の内側でのみ使う。
// Route Handler / Server Action からのみ呼ぶこと。クライアントへ渡さない。
export function createServiceClient() {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
