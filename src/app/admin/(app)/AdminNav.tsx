"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "予約台帳" },
  { href: "/admin/new", label: "予約登録" },
  { href: "/admin/customers", label: "顧客" },
  { href: "/admin/settings", label: "設定" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {links.map((l) => {
        const active =
          l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-1.5 text-sm ${
              active
                ? "bg-accent-soft font-medium text-accent-dark"
                : "text-mute hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
