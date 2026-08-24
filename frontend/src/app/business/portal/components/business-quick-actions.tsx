"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { QUICK_ACTIONS } from "../const";

export function BusinessQuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pb-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="group flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-muted"
          >
            <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1", action.tint)}>
              <action.icon className="h-4 w-4" />
            </span>
            <span className="flex-1 font-medium">{action.label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
