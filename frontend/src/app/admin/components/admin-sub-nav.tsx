"use client";

// Secondary sticky row — tabs for the active group's items. Hidden when the active
// group only has one item (Overview, Marketing). Ported from V2's PortalGroupSubNav.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { findActiveGroup, isNavPathActive } from "../nav-config";

export function AdminSubNav() {
  const pathname = usePathname();
  const activeGroup = findActiveGroup(pathname);

  if (!activeGroup || activeGroup.items.length <= 1) return null;

  return (
    <div className="hidden md:block sticky top-16 z-40 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <nav className="flex items-center gap-1 -mb-px overflow-x-auto scrollbar-none px-4 md:px-6">
        {activeGroup.items.map((item) => {
          const active = isNavPathActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap flex-shrink-0",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-primary hover:border-border",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
