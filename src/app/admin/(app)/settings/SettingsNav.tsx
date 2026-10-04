"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/settings", label: "店舗情報" },
  { href: "/admin/settings/hours", label: "営業時間" },
  { href: "/admin/settings/staff", label: "スタッフ" },
  { href: "/admin/settings/menus", label: "メニュー" },
  { href: "/admin/settings/shifts", label: "シフト・休み" },
  { href: "/admin/settings/design", label: "ページデザイン" },
  { href: "/admin/settings/billing", label: "決済連携" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4 overflow-x-auto">
      {tabs.map((t) => {
        const active =
          t.href === "/admin/settings"
            ? pathname === t.href
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-1 pb-2.5 text-sm ${
              active
                ? "border-accent font-medium text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
