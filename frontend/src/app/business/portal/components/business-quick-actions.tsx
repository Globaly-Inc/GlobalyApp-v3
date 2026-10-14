"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUICK_ACTIONS } from "../const";

export function BusinessQuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 pb-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/objects/${action.object}.webp`} alt="" aria-hidden className="size-9 shrink-0 object-contain" />
            <span className="flex-1 font-medium">{action.label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
