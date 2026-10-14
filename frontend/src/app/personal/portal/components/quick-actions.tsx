"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUICK_ACTIONS } from "../const";

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex min-w-0 flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`inline-flex rounded-md p-1.5 ${action.tint}`}>
              <action.icon className="size-4" aria-hidden />
            </span>
            <span className="leading-snug">{action.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
