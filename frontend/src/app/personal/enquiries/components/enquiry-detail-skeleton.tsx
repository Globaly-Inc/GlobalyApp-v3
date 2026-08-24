import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the loaded layout so the page settles into place instead of reflowing. */
export function EnquiryDetailSkeleton() {
  return (
    <div className="space-y-4 md:space-y-5">
      <Skeleton className="h-8 w-36 rounded-lg" />

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </Card>

      <Card className="p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </Card>
    </div>
  );
}
