"use client";

// Third nav level for Revenue/Subscriptions — a vertical sidebar nested inside the
// shared admin header + group sub-nav. Ported from V2's SubscriptionsLayout.tsx.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SUBSCRIPTIONS_NAV_ITEMS } from "./nav-config";

export default function SubscriptionsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6">
      <aside className="w-52 shrink-0 hidden md:block">
        <nav className="sticky top-36 space-y-1">
          {SUBSCRIPTIONS_NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
