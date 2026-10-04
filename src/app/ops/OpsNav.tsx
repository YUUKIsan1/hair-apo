"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/ops", label: "サロン一覧" },
  { href: "/ops/billing", label: "請求管理" },
];

export default function OpsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {links.map((l) => {
        const active =
          l.href === "/ops" ? pathname === "/ops" : pathname.startsWith(l.href);
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
