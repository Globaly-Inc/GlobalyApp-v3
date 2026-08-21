"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEnquiryDate } from "@/app/portal/utils";
import type { RecentEnquiry } from "../apis/types";

/**
 * V1's recent-enquiries card: a pb-2 header with a "View all" link, rows on space-y-2 separated by
 * border-b last:border-0, the subject on one truncated line above a text-xs date, and a capitalised status
 * badge on the right.
 *
 * Like V1, the whole card is absent when there are no enquiries — no empty state, because an empty card in
 * the rail is noise. It appears on its own once enquiries exist.
 */
export function RecentEnquiriesCard({ enquiries }: { enquiries: RecentEnquiry[] }) {
  if (enquiries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent enquiries</CardTitle>
          <Link href="/personal/explore" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {enquiries.map((enquiry) => (
          <div key={enquiry.id} className="flex items-center gap-3 py-2 border-b last:border-0">
            <div className="flex-1 min-w-0">
              {/* This endpoint has no free-text message, so the course is the subject line — falling back to
                  the institution, then to a neutral label rather than rendering an empty row. */}
              <p className="text-sm truncate">
                {enquiry.course_name ?? enquiry.institution_name ?? "Enquiry"}
              </p>
              <p className="text-xs text-muted-foreground">{formatEnquiryDate(enquiry.created_at)}</p>
            </div>
            <Badge variant={enquiry.status === "responded" ? "default" : "secondary"} className="capitalize text-xs">
              {enquiry.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
