"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMembers, removeMember } from "../../store/business-profile-detail-slice";
import type { Member } from "../../apis/types";

const PAGE_SIZE = 10;

export function AcceptedMembersList({
  businessId,
  onEdit,
}: Readonly<{ businessId: number; onEdit: (member: Member) => void }>) {
  const dispatch = useAppDispatch();
  const { items: members, status, total } = useAppSelector((state) => state.businessProfileDetail.members);
  const [page, setPage] = useState(1);

  const fetchedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedIdRef.current === businessId) return;
    fetchedIdRef.current = businessId;
    dispatch(fetchMembers({ id: businessId, params: { page: 1, limit: PAGE_SIZE } }));
  }, [dispatch, businessId]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchMembers({ id: businessId, params: { page: p, limit: PAGE_SIZE } }));
  };

  const handleDelete = async (memberId: number) => {
    try {
      await dispatch(removeMember({ id: businessId, memberId })).unwrap();
      toast.success("Member removed");
    } catch (e) {
      toast.error("Couldn't remove member", { description: (e as Error).message });
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Users className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No members yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                {(m.first_name ?? "?").slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.first_name ? `${m.first_name} ${m.last_name}` : "—"}</span>
                  {m.role_display && <span className="text-xs text-muted-foreground">{m.role_display}</span>}
                  {m.admin_point_of_contact && <Badge variant="outline">POC</Badge>}
                  {m.account_status !== 1 && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{[m.email, m.phone].filter(Boolean).join(" • ") || "—"}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => onEdit(m)} aria-label="Edit member">
                <Pencil className="h-4 w-4" />
              </Button>
              {!m.is_owner && (
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(m.id)} aria-label="Remove member">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </>
  );
}
