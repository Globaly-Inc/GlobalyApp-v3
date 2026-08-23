"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isBusinessNavGroupActive, isBusinessNavPathActive } from "../utils";
import type { BusinessNavGroup } from "../const";

// Ported from V1's PortalGroupSubNav: a second tab row for the active group's own pages,
// rendered only once that group actually has more than one — otherwise it stays dormant.
export function BusinessSubNav({ groups }: Readonly<{ groups: BusinessNavGroup[] }>) {
  const pathname = usePathname();
  const activeGroup = groups.find((g) => isBusinessNavGroupActive(pathname, g));

  if (!activeGroup || activeGroup.items.length <= 1) return null;

  return (
    <div className="hidden md:block border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-1 px-3 sm:px-4 md:px-6">
        {activeGroup.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors",
              isBusinessNavPathActive(pathname, item.href)
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-primary",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
