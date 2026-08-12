"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ENQUIRY_STATUS_STYLES } from "../const";
import { formatEnquiryDate } from "../utils";
import type { RecentEnquiriesCardProps } from "../types";

/**
 * Empty by design until the enquiry epic ships a writer — nothing in this scope creates an enquiry. The
 * empty state is therefore the state most users will see, so it carries the gate explanation rather than
 * being a placeholder.
 */
export function RecentEnquiriesCard({ enquiries }: RecentEnquiriesCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Recent enquiries</CardTitle>
        {enquiries.length > 0 && (
          <Link href="/personal/explore" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        )}
      </CardHeader>
      <CardContent className="pb-4">
        {enquiries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              No enquiries yet. Once your profile is complete you can reach agents and institutions directly.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {enquiries.map((enquiry) => (
              <li key={enquiry.id} className="space-y-1">
                <p className="line-clamp-2 text-xs text-foreground">{enquiry.message}</p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                      ENQUIRY_STATUS_STYLES[enquiry.status] ?? ENQUIRY_STATUS_STYLES.closed,
                    )}
                  >
                    {enquiry.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatEnquiryDate(enquiry.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
