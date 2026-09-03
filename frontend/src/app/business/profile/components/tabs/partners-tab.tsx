"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, Eye, Handshake, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { BusinessRelation } from "../../apis/types";
import { deleteRelation, fetchRelations } from "../../store/business-profile-detail-slice";
import { LinkConsultancyDialog } from "../partners/link-consultancy-dialog";
import { ViewInstitutionDrawer } from "../partners/view-institution-drawer";

const PAGE_SIZE = 10;

export function PartnersTab({ businessId, businessName }: Readonly<{ businessId: number; businessName?: string }>) {
  const dispatch = useAppDispatch();
  const { items: partners, status, total: relationsTotal } = useAppSelector((state) => state.businessProfileDetail.relations);
  const [addOpen, setAddOpen] = useState(false);
  const [editingRelation, setEditingRelation] = useState<BusinessRelation | null>(null);
  const [viewingInstitutionId, setViewingInstitutionId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const fetchedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedIdRef.current === businessId) return;
    fetchedIdRef.current = businessId;
    dispatch(fetchRelations({ id: businessId, params: { page: 1, limit: PAGE_SIZE } }));
  }, [dispatch, businessId]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchRelations({ id: businessId, params: { page: p, limit: PAGE_SIZE } }));
  };

  const handleRemove = async (relationId: string) => {
    try {
      await dispatch(deleteRelation({ id: businessId, relationId })).unwrap();
      toast.success("Partner removed");
    } catch (e) {
      toast.error("Couldn't remove partner", { description: (e as Error).message });
    }
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
        <p className="text-sm font-medium">No consultancies linked yet</p>
        <p className="text-xs text-muted-foreground">Link a consultancy authorised to represent this institution.</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {partners.map((p) => (
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
              <div>
                <p className="text-sm font-medium">{p.partner_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {p.partner_kind === "institution" && (
                <Button size="icon-sm" variant="ghost" onClick={() => setViewingInstitutionId(p.partner_id)} aria-label="View institution">
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon-sm" variant="ghost" onClick={() => setEditingRelation(p)} aria-label="Edit partner">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleRemove(p.id)} aria-label="Remove partner">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Partnerships</span>
            <Badge variant="secondary">{partners.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Educational consultancies authorised to represent this institution.</p>
        </div>
        <Button className="h-10" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Link consultancy
        </Button>
      </div>

      {list}

      {relationsTotal > 0 && <Pagination page={page} total={relationsTotal} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <LinkConsultancyDialog open={addOpen} onOpenChange={setAddOpen} businessId={businessId} businessName={businessName} />
      <LinkConsultancyDialog
        open={!!editingRelation}
        onOpenChange={(open) => { if (!open) setEditingRelation(null); }}
        businessId={businessId}
        businessName={businessName}
        editRelation={editingRelation}
      />
      <ViewInstitutionDrawer
        open={viewingInstitutionId != null}
        onOpenChange={(open) => { if (!open) setViewingInstitutionId(null); }}
        institutionId={viewingInstitutionId}
      />
    </div>
  );
}
