import { MessageSquarePlus, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Two empty states, one component: nothing sent yet (offer the action) and nothing
 * matching the active filter (offer the way back). A filtered-empty list that showed
 * "No enquiries yet" would read as data loss.
 */
export function EnquiriesEmptyState({
  variant,
  canEnquire,
  onNewEnquiry,
  onClearFilter,
}: Readonly<{
  variant: "no-enquiries" | "no-matches";
  canEnquire: boolean;
  onNewEnquiry: () => void;
  onClearFilter: () => void;
}>) {
  const filtered = variant === "no-matches";
  const Icon = filtered ? SearchX : MessageSquarePlus;

  return (
    <Card className="items-center gap-2 border border-dashed border-border bg-card/40 px-6 py-14 text-center ring-0">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>

      <p className="mt-1 font-semibold text-foreground">
        {filtered ? "Nothing in this filter" : "No enquiries yet"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "No enquiry has this status right now. Try another filter to see the rest."
          : canEnquire
            ? "Send one about a course you're interested in and matching institutions and agents will reply here."
            : "Complete your profile to start sending enquiries to institutions and agents."}
      </p>

      {filtered ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onClearFilter}>
          Show all enquiries
        </Button>
      ) : (
        canEnquire && (
          <Button className="mt-3" onClick={onNewEnquiry}>
            <Plus className="size-4" aria-hidden />
            New Enquiry
          </Button>
        )
      )}
    </Card>
  );
}
