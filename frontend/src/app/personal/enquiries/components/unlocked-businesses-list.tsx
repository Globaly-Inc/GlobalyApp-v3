import Link from "next/link";
import { Inbox, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, initials } from "../utils";

import type { UnlockedBusiness } from "../apis/types";

/**
 * The businesses that paid to unlock this enquiry.
 *
 * This is the ONLY recipient information a student may see — the API deliberately
 * withholds the full matched-business list, so an enquiry sent to six businesses shows
 * only those who actually committed.
 *
 * The chat itself lives at /personal/messages; each row deep-links into its thread rather
 * than embedding one, so a conversation is read in one place no matter how it was reached.
 */
export function UnlockedBusinessesList({ businesses }: Readonly<{ businesses: UnlockedBusiness[] }>) {
  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          Unlocked by
          {businesses.length > 0 && (
            <Badge variant="secondary" className="font-normal tabular-nums">
              {businesses.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {businesses.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <Inbox className="size-5 text-muted-foreground/60" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              No one has unlocked this enquiry yet. Businesses appear here once they unlock your
              details to get in touch.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {businesses.map((b) => (
              <li
                key={b.distribution_id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <Avatar className="size-9 rounded-lg">
                  {b.logo_url && <AvatarImage src={b.logo_url} alt="" className="bg-white object-contain p-0.5" />}
                  <AvatarFallback className="rounded-lg bg-muted text-xs text-muted-foreground">
                    {initials(b.business_name)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{b.business_name}</p>
                    {b.is_closed && (
                      <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                        Closed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {b.city ? `${b.city} · ` : ""}
                    Unlocked {formatDate(b.unlocked_at)}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  render={<Link href={`/personal/messages?thread=${b.distribution_id}`} />}
                >
                  <MessageSquare className="size-3.5" aria-hidden />
                  {b.is_closed ? "View chat" : "Message"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
