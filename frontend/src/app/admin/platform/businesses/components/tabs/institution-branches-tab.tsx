"use client";

import { useEffect, useState } from "react";
import { Building2, ExternalLink, Loader2, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchInstitutionBranches } from "../../store/institution-detail-slice";

const PAGE_SIZE = 10;

// Read-only: these rows come from extraction_campuses via the institution's source_job_id —
// editing them happens on the extraction job's own admin screen, not here.
export function InstitutionBranchesTab({ institutionId }: Readonly<{ institutionId: number }>) {
  const dispatch = useAppDispatch();
  const { items: branches, status, total } = useAppSelector((state) => state.platformInstitutionDetail.branches);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchInstitutionBranches({ id: institutionId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }));
  };

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
  }, [dispatch, institutionId, search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (branches.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No branches yet</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {branches.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{b.name ?? "Unnamed campus"}</span>
                {b.source_url && (
                  <a href={b.source_url} target="_blank" rel="noreferrer" aria-label="Open source">
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                )}
              </div>
              {(b.address || b.city || b.state || b.country) && (
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  {[b.address, b.city, b.state, b.country].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Branches</span>
        <Badge variant="secondary">{total}</Badge>
      </div>

      <div className="relative mb-3 w-1/3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-10 pl-9" placeholder="Search branches..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {list}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </div>
  );
}
