import { MessageSquarePlus, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
  let description = "Complete your profile to start sending enquiries to institutions and agents.";
  if (filtered) description = "No enquiry has this status right now. Try another filter to see the rest.";
  else if (canEnquire)
    description = "Send one about a course you're interested in and matching institutions and agents will reply here.";

  let action: React.ReactNode = null;
  if (filtered) {
    action = (
      <Button variant="outline" size="sm" onClick={onClearFilter}>
        Show all enquiries
      </Button>
    );
  } else if (canEnquire) {
    action = (
      <Button onClick={onNewEnquiry}>
        <Plus className="size-4" aria-hidden />
        New Enquiry
      </Button>
    );
  }

  return (
    <EmptyState
      icon={filtered ? SearchX : MessageSquarePlus}
      title={filtered ? "Nothing in this filter" : "No enquiries yet"}
      description={description}
      action={action}
    />
  );
}
