import Link from "next/link";
import { Building2, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
 *
 * Segment shape (Card + p-6 + an h3) follows the admin add-business panels, e.g.
 * admin/platform/businesses/components/add-business/basic-info-card.tsx.
 */
export function UnlockedBusinessesList({ businesses }: Readonly<{ businesses: UnlockedBusiness[] }>) {
  return (
    <Card className="space-y-4 p-6">
      <h3 className="text-sm font-semibold text-foreground">
        Unlocked by
        {businesses.length > 0 && <span className="ml-1 text-muted-foreground">({businesses.length})</span>}
      </h3>

      {businesses.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No one has unlocked this enquiry yet. Businesses appear here once they unlock
          your details to get in touch.
        </p>
      ) : (
        <ul className="space-y-2">
          {businesses.map((b) => (
            <li key={b.distribution_id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <Avatar className="size-9">
                {b.logo_url && <AvatarImage src={b.logo_url} alt={b.business_name} />}
                <AvatarFallback>
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.business_name}</p>
                <p className="text-xs text-muted-foreground">
                  {b.city ? `${b.city} · ` : ""}
                  Unlocked {new Date(b.unlocked_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                render={<Link href={`/personal/messages?thread=${b.distribution_id}`} />}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                {b.is_closed ? "View chat" : "Message"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
