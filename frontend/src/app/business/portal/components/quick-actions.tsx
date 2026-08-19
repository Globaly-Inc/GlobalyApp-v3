"use client";

import Link from "next/link";
import { QUICK_ACTIONS } from "../const";

export function QuickActions() {
  return (
    <section className="rounded-xl border border-border bg-background p-4 md:p-5">
      <h2 className="text-sm font-semibold">Quick actions</h2>
      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex items-center gap-3 rounded-lg p-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <action.icon className="size-4 text-muted-foreground" />
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
