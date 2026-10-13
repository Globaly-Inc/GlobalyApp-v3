import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function BranchesTabEmptyState({ search }: Readonly<{ search: string }>) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center text-muted-foreground">
        <Building2 className="mx-auto mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">{search.trim() ? "No branches match your search" : "No branches yet"}</p>
        {!search.trim() && (
          <p className="mt-1 text-xs">Add one manually, or run the branches extraction above.</p>
        )}
      </CardContent>
    </Card>
  );
}
