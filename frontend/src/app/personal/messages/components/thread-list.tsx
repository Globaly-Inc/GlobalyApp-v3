"use client";

import { Loader2, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MessageThreadSummary } from "../apis/types";

/** Last activity, falling back to when the business unlocked — a thread with no messages
 * still needs a date, and the unlock is when the conversation became possible. */
const activityDate = (t: MessageThreadSummary) => new Date(t.last_message_at ?? t.unlocked_at);

export function ThreadList({
  threads,
  loading,
  onOpen,
}: Readonly<{
  threads: MessageThreadSummary[];
  loading: boolean;
  onOpen: (distributionId: string) => void;
}>) {
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <MessageSquare className="mx-auto mb-3 size-12 text-muted-foreground/30" aria-hidden />
        <p>No conversations yet.</p>
        <p className="mt-1 text-sm text-muted-foreground/80">
          A conversation opens as soon as a business unlocks one of your enquiries.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((t) => (
        <Card
          key={t.distribution_id}
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => onOpen(t.distribution_id)}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <MessageSquare
              className={cn("size-5 shrink-0", t.is_closed ? "text-muted-foreground" : "text-primary")}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.business_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t.course_name} · {activityDate(t).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={t.is_closed ? "secondary" : "outline"}>{t.is_closed ? "Closed" : "Active"}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
