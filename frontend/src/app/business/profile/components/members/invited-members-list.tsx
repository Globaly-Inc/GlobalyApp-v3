"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cancelInvitation, fetchInvitations, resendInvitation } from "../../store/business-profile-detail-slice";

const PAGE_SIZE = 10;

export function InvitedMembersList({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { items: invitations, status, total } = useAppSelector((state) => state.businessProfileDetail.invitations);
  const [page, setPage] = useState(1);

  const fetchedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedIdRef.current === businessId) return;
    fetchedIdRef.current = businessId;
    dispatch(fetchInvitations({ id: businessId, params: { page: 1, limit: PAGE_SIZE } }));
  }, [dispatch, businessId]);

  const handlePageChange = (p: number) => {
    setPage(p);
    dispatch(fetchInvitations({ id: businessId, params: { page: p, limit: PAGE_SIZE } }));
  };

  const handleCancel = async (invitationId: string) => {
    try {
      await dispatch(cancelInvitation({ id: businessId, invitationId })).unwrap();
      toast.success("Invitation cancelled");
    } catch (e) {
      toast.error("Couldn't cancel invitation", { description: (e as Error).message });
    }
  };

  const handleResend = async (invitationId: string) => {
    try {
      await dispatch(resendInvitation({ id: businessId, invitationId })).unwrap();
      toast.success("Invite resent");
    } catch (e) {
      toast.error("Couldn't resend invite", { description: (e as Error).message });
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
    <>
      <div className="space-y-2">
        {invitations.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                {(i.first_name ?? "?").slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{i.first_name ? `${i.first_name} ${i.last_name}` : "—"}</span>
                  {i.role && <span className="text-xs text-muted-foreground">{i.role}</span>}
                  <Badge variant="secondary">Invited</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{[i.email, i.phone].filter(Boolean).join(" • ") || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => handleResend(i.id)} aria-label="Resend invitation">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => handleCancel(i.id)} aria-label="Cancel invitation">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </>
  );
}
