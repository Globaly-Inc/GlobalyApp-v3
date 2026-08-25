"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, Handshake, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchInstitutionPartners } from "../../store/institution-detail-slice";

// Read-only: these rows come from extraction_agents via the institution's source_job_id —
// editing them happens on the extraction job's own admin screen, not here.
export function InstitutionPartnersTab({ institutionId }: Readonly<{ institutionId: number }>) {
  const dispatch = useAppDispatch();
  const { items: partners, status, total } = useAppSelector((state) => state.platformInstitutionDetail.partners);

  const fetchedRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedRef.current === institutionId) return;
    fetchedRef.current = institutionId;
    dispatch(fetchInstitutionPartners(institutionId));
  }, [dispatch, institutionId]);

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (partners.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Handshake className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No partners yet</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {partners.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Handshake className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{p.name ?? "Unnamed agent"}</span>
                {p.website && (
                  <a href={p.website} target="_blank" rel="noreferrer" aria-label="Open website">
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[p.country, p.email, p.phone].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Handshake className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Partners</span>
        <Badge variant="secondary">{total}</Badge>
      </div>
      {list}
    </div>
  );
}
