import { Button } from "@/components/ui/button";

/** Dashed empty box: "no scholarships yet", or "no match" with a Clear filters action. */
export function ScholarshipsEmptyState({ onClear }: Readonly<{ onClear?: () => void }>) {
  return (
    <div className="animate-pop-in grid justify-items-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed p-8 text-center text-sm text-muted-foreground">
      <b className="text-foreground">{onClear ? "No scholarships match these filters" : "No scholarships yet"}</b>
      <span>{onClear ? "Try another search or clear a filter." : "Create a scholarship to list it for students."}</span>
      {onClear && <Button variant="outline" size="sm" className="mt-1.5" onClick={onClear}>Clear filters</Button>}
    </div>
  );
}
