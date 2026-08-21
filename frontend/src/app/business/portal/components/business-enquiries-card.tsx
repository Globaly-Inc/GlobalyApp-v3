"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatEnquiryDate } from "@/app/portal/utils";
import type { DistributionListItem } from "@/app/business/enquiries/apis/types";

/**
 * V1's business recent-enquiries card: a pb-2 header with "View all", rows separated by border-b
 * last:border-0, an unlocked/locked status dot, and the matching badge on the right.
 *
 * Locked rows deliberately show no student detail — the API already truncates `message` for them, and the
 * card must not be the place that leaks what credits are meant to buy.
 *
 * Absent entirely when there are no enquiries, exactly as the personal rail's equivalent is.
 */
export function BusinessEnquiriesCard({ enquiries }: { enquiries: DistributionListItem[] }) {
  if (enquiries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent enquiries</CardTitle>
          <Link href="/business/enquiries" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {enquiries.map((enquiry) => (
          <div key={enquiry.distribution_id} className="flex items-center gap-3 py-2 border-b last:border-0">
            <div
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                enquiry.is_unlocked ? "bg-emerald-500" : "bg-amber-400",
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">
                {enquiry.is_unlocked
                  ? (enquiry.message ?? enquiry.course_name ?? "Enquiry")
                  : "🔒 Locked — unlock with credits"}
              </p>
              <p className="text-xs text-muted-foreground">{formatEnquiryDate(enquiry.created_at)}</p>
            </div>
            <Badge variant={enquiry.is_unlocked ? "default" : "secondary"} className="text-xs">
              {enquiry.is_unlocked ? "Unlocked" : "Locked"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
