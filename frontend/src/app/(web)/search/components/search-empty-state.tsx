import Link from "next/link";
import { Search } from "lucide-react";

export function SearchEmptyState({ name }: Readonly<{ name: string }>) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
        <Search className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">No {name.toLowerCase()} found</h3>
      <p className="text-sm text-muted-foreground mb-6">Try removing some filters or searching for something else.</p>
      <Link href="/search" className="text-sm text-primary hover:underline">Clear filters</Link>
    </div>
  );
}
