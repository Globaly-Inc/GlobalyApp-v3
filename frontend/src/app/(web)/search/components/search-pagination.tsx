import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Paginated } from "../types";

export function SearchPagination({
  meta,
  page,
  query,
  pathname = "/search",
}: Readonly<{ meta: Paginated<unknown>["meta"]; page: number; query: Record<string, string>; pathname?: string }>) {
  if (meta.total === 0) return null;

  return (
    <div className="text-center mt-12 space-y-3">
      {meta.totalPages > 1 && (
        <nav aria-label="Search pagination" className="flex items-center justify-center gap-2 flex-wrap">
          {page > 1 ? (
            <Link href={{ pathname, query: { ...query, page: page - 1 } }}>
              <Button variant="outline" size="sm">← Previous</Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>← Previous</Button>
          )}
          <span className="text-sm text-muted-foreground px-2">Page {page} of {meta.totalPages}</span>
          {page < meta.totalPages ? (
            <Link href={{ pathname, query: { ...query, page: page + 1 } }}>
              <Button variant="outline" size="sm">Next →</Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>Next →</Button>
          )}
        </nav>
      )}
      <p className="text-sm text-muted-foreground">Showing {meta.limit * (page - 1) + 1}–{Math.min(meta.limit * page, meta.total)} of {meta.total} result{meta.total !== 1 ? "s" : ""}</p>
    </div>
  );
}
