import { Badge } from "@/components/ui/badge";

// ponytail: fixed cap + native title tooltip for the overflow — swap for ui/tooltip if design
// wants a styled hover (same call as chat-sidebar.tsx).
const MAX_CHIPS = 4;

/**
 * The campus cities of an institution, as chips — `campus_locations`, aggregated per extraction
 * job by the search repositories, so a course shows the campuses of the institution teaching it.
 */
export function CampusChips({ locations }: Readonly<{ locations: string[] }>) {
  if (locations.length === 0) return null;
  const overflow = locations.slice(MAX_CHIPS);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Location:</span>
      {locations.slice(0, MAX_CHIPS).map((city) => (
        <Badge key={city} variant="secondary" className="font-normal text-slate-700">{city}</Badge>
      ))}
      {overflow.length > 0 && (
        // pointer-events-auto so the title tooltip fires: the card's overlay Link leaves the
        // whole block pointer-events-none, which would swallow the hover.
        <Badge
          variant="secondary"
          className="pointer-events-auto relative z-10 font-normal text-slate-700"
          title={overflow.join(", ")}
        >
          +{overflow.length} More
        </Badge>
      )}
    </div>
  );
}
