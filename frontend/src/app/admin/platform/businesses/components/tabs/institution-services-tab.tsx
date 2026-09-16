"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  deleteInstitutionServiceThunk, fetchInstitutionServices, toggleInstitutionServicePublished,
} from "../../store/institution-detail-slice";
import type { BusinessService } from "../../apis/types";
import { CourseDetailsLinkButton } from "../services/course-details-link-button";
import { DeleteServiceDialog } from "../services/delete-service-dialog";

const PAGE_SIZE = 10;

// Institution twin of services-tab.tsx — same business_services tenant table, only the owning
// entity and route prefix (/admin/platform/institutions) differ. Pre-seeded (unclaimed, never
// provisioned) institutions fall back to their extracted courses server-side — see
// business-services.service.ts's searchInstitutionServices — so this list and Add Service button
// work unchanged either way; `readOnly` hides mutation controls for that pre-seeded case.
export function InstitutionServicesTab({
  institutionId,
  readOnly = false,
}: Readonly<{ institutionId: number; readOnly?: boolean }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { items: services, status, total } = useAppSelector((state) => state.platformInstitutionDetail.services);
  const [deletingService, setDeletingService] = useState<BusinessService | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchPage = (p: number) => {
    dispatch(fetchInstitutionServices({ id: institutionId, params: { search: search || undefined, page: p, limit: PAGE_SIZE } }));
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

  const handleTogglePublish = async (serviceId: string, next: boolean) => {
    try {
      await dispatch(toggleInstitutionServicePublished({ id: institutionId, serviceId, is_published: next })).unwrap();
      toast.success(next ? "Service published" : "Service unpublished");
    } catch (e) {
      toast.error("Couldn't update service", { description: (e as Error).message });
    }
  };

  const handleDelete = async () => {
    if (!deletingService) return;
    setDeleting(true);
    try {
      await dispatch(deleteInstitutionServiceThunk({ id: institutionId, serviceId: deletingService.id })).unwrap();
      toast.success("Service deleted");
      setDeletingService(null);
    } catch (e) {
      toast.error("Couldn't delete service", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  let list: React.ReactNode;
  if (status === "loading") {
    list = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (services.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Package className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No services yet</p>
      </div>
    );
  } else {
    list = (
      <div className="space-y-2">
        {services.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Package className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant={s.is_published ? "default" : "secondary"} className="text-[10px]">
                    {s.is_published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.category_name ?? "Uncategorised"}
                  {s.price ? ` · $${s.price}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleTogglePublish(s.id, !s.is_published)}
                aria-label={s.is_published ? "Unpublish service" : "Publish service"}
              >
                {s.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              {!readOnly && (
                <>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => router.push(`/admin/platform/institutions/${institutionId}/services/${s.id}/edit`)}
                    aria-label="Edit service"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <CourseDetailsLinkButton onClick={() => router.push(`/admin/platform/institutions/${institutionId}/services/${s.id}/edit`)} />
                  <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeletingService(s)} aria-label="Delete service">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Services</span>
          <Badge variant="secondary">{total}</Badge>
        </div>
        {!readOnly && (
          <Button className="h-10" onClick={() => router.push(`/admin/platform/institutions/${institutionId}/services/add`)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Service
          </Button>
        )}
      </div>

      <div className="relative mb-3 w-1/3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-10 pl-9"
          placeholder="Search services by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {list}

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}

      <DeleteServiceDialog
        service={deletingService}
        onOpenChange={(open) => { if (!open) setDeletingService(null); }}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
