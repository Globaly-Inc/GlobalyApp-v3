"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isBusinessNavGroupActive } from "../utils";
import type { BusinessNavGroup } from "../const";

// Ported from V1's Navbar group-tab row — one pill per section, highlighting whichever
// section the current route belongs to. Desktop only, matching V1's `hidden md:flex`.
export function BusinessGroupTabs({ groups }: Readonly<{ groups: BusinessNavGroup[] }>) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex flex-1 items-center gap-1 overflow-x-auto">
      {groups.map((group) => (
        <Link
          key={group.label}
          href={group.items[0]!.href}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            isBusinessNavGroupActive(pathname, group)
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <group.icon className="h-3.5 w-3.5" />
          {group.label}
        </Link>
      ))}
    </nav>
  );
}
