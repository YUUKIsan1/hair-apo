"use client";

import { useRouter } from "next/navigation";
import { createBrowser } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createBrowser().auth.signOut();
        router.push("/admin/login");
        router.refresh();
      }}
      className="rounded-md border hairline px-3 py-1.5 text-xs text-mute hover:text-ink"
    >
      ログアウト
    </button>
  );
}
