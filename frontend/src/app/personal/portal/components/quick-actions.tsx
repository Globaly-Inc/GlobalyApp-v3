"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUICK_ACTIONS } from "../const";

export function QuickActions() {
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
            className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <span className={`inline-flex rounded-md p-1.5 ${action.tint}`}>
              <action.icon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1">{action.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
