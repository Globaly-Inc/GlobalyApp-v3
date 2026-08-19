import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InstitutionCourseSearch({ slug, search }: Readonly<{ slug: string; search?: string }>) {
  return (
    <form method="get" action={`/institution/${slug}`} className="flex items-center gap-2">
      <input
        type="text"
        name="search"
        defaultValue={search}
        placeholder="Search courses at this institution..."
        className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button type="submit" className="h-10 gap-1.5 shrink-0">
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
      </Button>
    </form>
  );
}
