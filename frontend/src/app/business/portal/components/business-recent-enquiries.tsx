"use client";

import Link from "next/link";
import { Lock, MailOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DistributionListItem } from "@/app/business/enquiries/apis/types";

const RECENT_COUNT = 5;
const PREVIEW_LENGTH = 50;

export function BusinessRecentEnquiries({ items }: { items: DistributionListItem[] }) {
  if (items.length === 0) return null;
  const recent = items.slice(0, RECENT_COUNT);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Recent enquiries</CardTitle>
          <Link href="/business/enquiries" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {recent.map((item) => (
          <div
            key={item.distribution_id}
            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                item.is_unlocked ? "bg-success/12 text-success" : "bg-warning/12 text-warning",
              )}
            >
              {item.is_unlocked ? <MailOpen className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {item.is_unlocked
                  ? `${(item.message ?? "").slice(0, PREVIEW_LENGTH)}…`
                  : "Locked — unlock with credits"}
              </p>
              <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
            </div>
            <Badge variant={item.is_unlocked ? "default" : "secondary"} className="shrink-0">
              {item.is_unlocked ? "Unlocked" : "Locked"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
