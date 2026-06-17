"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Chia team" },
  { href: "/history", label: "Lịch sử đấu" },
  { href: "/stats", label: "Thống kê" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center gap-1 h-14 overflow-x-auto">
          <span className="font-bold text-gray-900 mr-4 whitespace-nowrap">
            ⚔️ AOE Tnex
          </span>
          {ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
