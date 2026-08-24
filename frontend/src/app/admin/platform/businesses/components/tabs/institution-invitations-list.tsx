"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  cancelInstitutionInvitation, fetchInstitutionInvitations, resendInstitutionInvitation,
} from "../../store/institution-detail-slice";

const PAGE_SIZE = 10;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function InstitutionInvitationsList({ institutionId }: Readonly<{ institutionId: number }>) {
  const dispatch = useAppDispatch();
  const { items: invitations, status, total } = useAppSelector((state) => state.platformInstitutionDetail.invitations);
  const [page, setPage] = useState(1);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchInstitutionInvitations({ id: institutionId, params: { page: 1, limit: PAGE_SIZE } }));
  }, [dispatch, institutionId]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchInstitutionInvitations({ id: institutionId, params: { page: p, limit: PAGE_SIZE } }));
  };

  const handleCancel = async (invitationId: string) => {
    try {
      await dispatch(cancelInstitutionInvitation({ id: institutionId, invitationId })).unwrap();
      toast.success("Invitation deleted");
    } catch (e) {
      toast.error("Couldn't delete invitation", { description: (e as Error).message });
    }
  };

  const handleResend = async (invitationId: string) => {
    try {
      await dispatch(resendInstitutionInvitation({ id: institutionId, invitationId })).unwrap();
      toast.success("Invitation re-sent");
    } catch (e) {
      toast.error("Couldn't re-send invitation", { description: (e as Error).message });
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Mail className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No pending invitations</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {invitations.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{[i.first_name, i.last_name].filter(Boolean).join(" ") || i.email}</span>
                {i.role && <span className="text-xs capitalize text-muted-foreground">{i.role}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                {i.email} · Invited {formatDate(i.invited_at)} · Expires {formatDate(i.expires_at)}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => handleResend(i.id)} aria-label="Re-invite">
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleCancel(i.id)} aria-label="Delete invitation">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </div>
  );
}
