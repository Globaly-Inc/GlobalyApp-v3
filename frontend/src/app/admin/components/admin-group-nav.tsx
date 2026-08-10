"use client";

// Desktop top-bar group tabs — one tab per nav group, links to the group's first item.
// Ported from V2's Navbar.tsx portal-mode group tabs.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { getVisibleNavGroups, isNavPathActive } from "../nav-config";

export function AdminGroupNav() {
  const pathname = usePathname();
  const { user } = useAuthState();
  const groups = getVisibleNavGroups(user?.role);

  return (
    <nav className="hidden md:flex items-center gap-1 overflow-x-auto">
      {groups.map((group) => {
        const active = group.items.some((item) => isNavPathActive(pathname, item.href));
        return (
          <Link
            key={group.label}
            href={group.items[0]!.href}
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors rounded-md flex-shrink-0 px-3 py-2",
              active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <group.icon className="h-3.5 w-3.5" />
            {group.label}
          </Link>
        );
      })}
    </nav>
  );
}
