import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Gmail-style: once a whole page is ticked, offer to extend the selection to every page. */
export function SelectAllBanner({
  pageCount,
  total,
  allSelected,
  loading,
  onSelectAll,
  onClear,
}: Readonly<{
  pageCount: number;
  total: number;
  allSelected: boolean;
  loading: boolean;
  onSelectAll: () => void;
  onClear: () => void;
}>) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
      {allSelected ? (
        <>
          <span>All <strong>{total}</strong> courses are selected.</span>
          <Button size="sm" variant="link" className="h-auto p-0" onClick={onClear}>Clear selection</Button>
        </>
      ) : (
        <>
          <span>All {pageCount} on this page are selected.</span>
          <Button size="sm" variant="link" className="h-auto p-0" disabled={loading} onClick={onSelectAll}>
            {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Select all {total} courses
          </Button>
        </>
      )}
    </div>
  );
}
