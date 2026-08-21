"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuickAction } from "../types";

/**
 * V1's quick actions: a pb-2 header, rows on space-y-1, each row p-2.5 with a gap-3 plain coloured icon.
 * No tinted icon squares and no chevrons — V1 has neither.
 *
 * The rows come from the caller because the two portals link to different places; the card itself is the
 * same in both.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted text-sm"
          >
            <action.icon className={`h-4 w-4 ${action.color}`} />
            <span className="font-medium">{action.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
