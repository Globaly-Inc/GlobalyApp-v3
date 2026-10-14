import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageBody } from "@/components/ui/page-body";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the loaded layout so the page settles into place instead of reflowing. */
export function EnquiryDetailSkeleton() {
  return (
    <PageBody>
      <div className="flex items-center gap-3 border-b border-border pt-2 pb-5">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-full max-w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-14 w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
