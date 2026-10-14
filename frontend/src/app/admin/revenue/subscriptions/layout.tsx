"use client";

// Third nav level for Revenue/Subscriptions — a vertical sidebar nested inside the
// shared admin header + group sub-nav. Ported from V2's SubscriptionsLayout.tsx.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SUBSCRIPTIONS_NAV_ITEMS } from "./nav-config";

export default function SubscriptionsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  const isActive = (item: (typeof SUBSCRIPTIONS_NAV_ITEMS)[number]) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      {/* Phones: the same links as a scrolling pill row, so the section stays navigable below md. */}
      <nav aria-label="Subscriptions" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:hidden">
        {SUBSCRIPTIONS_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              isActive(item) ? "border-primary/30 bg-primary-light font-medium text-primary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <aside className="hidden w-52 shrink-0 md:block">
        <nav aria-label="Subscriptions" className="sticky top-36 flex flex-col gap-0.5">
          {SUBSCRIPTIONS_NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-primary-light font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-primary" />}
                <item.icon className="size-4 shrink-0" />
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
