import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// クライアントサイド用(anonキー)。RLSの公開ポリシーで読める範囲のみ。
export const supabase = createClient(url, anonKey);
