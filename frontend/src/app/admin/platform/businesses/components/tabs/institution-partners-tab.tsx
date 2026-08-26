"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, ExternalLink, Handshake, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { BusinessRelation, InstitutionPartnerRow } from "../../apis/types";
import { deleteInstitutionPartner, fetchInstitutionPartners } from "../../store/institution-detail-slice";
import { InstitutionLinkConsultancyDialog } from "../partners/institution-link-consultancy-dialog";
import { DeletePartnerDialog } from "../partners/delete-partner-dialog";

const PAGE_SIZE = 10;

// Merges manually-linked consultancies (real CRUD, business_representations) with read-only
// extraction_agents scraped for this institution's source job — `source` says which; only
// manual rows get edit/delete.
export function InstitutionPartnersTab({ institutionId }: Readonly<{ institutionId: number }>) {
  const dispatch = useAppDispatch();
  const { items: partners, status, total } = useAppSelector((state) => state.platformInstitutionDetail.partners);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editingRelation, setEditingRelation] = useState<BusinessRelation | null>(null);
  const [deletingRelation, setDeletingRelation] = useState<BusinessRelation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchInstitutionPartners({ id: institutionId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }));
  };

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => fetchPage(1), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, institutionId, search]);

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchPage(p);
  };

  const handleDelete = async () => {
    if (!deletingRelation) return;
    setDeleting(true);
    try {
      await dispatch(deleteInstitutionPartner({ id: institutionId, partnerId: deletingRelation.id })).unwrap();
      toast.success("Partner removed");
      setDeletingRelation(null);
    } catch (e) {
      toast.error("Couldn't remove partner", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  const renderRow = (p: InstitutionPartnerRow) => {
    if (p.source === "manual") {
      return (
        <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              {p.partner_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.partner_logo_url} alt="" className="h-full w-full rounded-lg object-contain p-1" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm font-medium">{p.partner_name}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => { setEditingRelation(p); setLinkOpen(true); }} aria-label="Edit partner">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeletingRelation(p)} aria-label="Remove partner">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }
    return (
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
          <p className="truncate text-xs text-muted-foreground">{[p.country, p.email, p.phone].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
    );
  };

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
    list = <div className="space-y-2">{partners.map(renderRow)}</div>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Partners</span>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <Button className="h-10" onClick={() => { setEditingRelation(null); setLinkOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Link consultancy
        </Button>
      </div>

      <div className="relative mb-3 w-1/3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-10 pl-9" placeholder="Search partners..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {list}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <InstitutionLinkConsultancyDialog
        open={linkOpen}
        onOpenChange={(open) => { setLinkOpen(open); if (!open) setEditingRelation(null); }}
        institutionId={institutionId}
        editRelation={editingRelation}
      />
      <DeletePartnerDialog
        partner={deletingRelation}
        onOpenChange={(open) => { if (!open) setDeletingRelation(null); }}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
