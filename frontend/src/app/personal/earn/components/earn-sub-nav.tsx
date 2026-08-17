"use client";

// The Earn module's second-level nav. Rendered by earn/layout.tsx, so it appears on every route the module
// owns — including the sub-pages of My Services (the form, an order, the payment return), which is why the
// active check is a prefix match rather than an equality test.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "My Services", href: "/personal/earn/services", icon: FolderOpen },
  { label: "Ambassadors", href: "/personal/earn/ambassadors", icon: Users },
  { label: "Referrals", href: "/personal/earn/referrals", icon: UserPlus },
] as const;

export function EarnSubNav() {
  const pathname = usePathname() ?? "";

  return (
    // Full-bleed, so the rule under the tabs spans the viewport exactly like the header's border above it.
    // This renders inside the shell's centred max-w-7xl container, so `w-screen` + a negative inline margin
    // of `50% - 50vw` re-centres a viewport-wide box on the same axis. The tabs themselves sit in an inner
    // container matching SHELL_WIDTH, so they stay aligned with the page content.
    // <main> carries `overflow-x-clip` to absorb the scrollbar's width — 100vw counts it, the page doesn't.
    //
    // The negative top margin cancels <main>'s own `pt-4 md:pt-6`. Without it the band floats ~24px below
    // the header with a strip of page background between them; the two bars should read as one stacked nav,
    // as they do in V2.
    <nav className="-mt-4 mx-[calc(50%-50vw)] mb-4 w-screen border-b border-border md:-mt-6">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto px-3 sm:px-4 md:px-6">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
