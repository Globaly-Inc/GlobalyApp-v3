"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { relativeTime } from "@/components/feed/utils";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { cancelInvitation, fetchInvitations, resendInvitation } from "../../store/business-profile-detail-slice";
import { ACTIONS, rowDelay, STICKY_TD, STICKY_TH, TABLE, TABLE_WRAP, TD, TH, TR } from "../portal-ui/portal-ui";
import { CHIP, RoleChip } from "./role-chip";
import { TeamEmpty } from "./team-empty";

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
    return <TeamEmpty title="No pending invites" hint="Invite a colleague to help manage this profile." />;
  }

  return (
    <>
      <div className={TABLE_WRAP}>
        <table className={cn(TABLE, "min-w-190")}>
          <thead>
            <tr>
              <th className={TH}>Email</th>
              <th className={TH}>Role</th>
              <th className={TH}>Invited</th>
              <th className={TH}>Expires</th>
              <th className={cn(TH, STICKY_TH)}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((i, idx) => (
              <tr key={i.id} className={TR} style={rowDelay(idx)}>
                <td className={TD}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8.5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Mail className="size-3.75" />
                    </span>
                    <div className="min-w-0">
                      {/* Invites only ask for an email now — the name arrives with the invitee's own account. */}
                      <b className="block truncate text-sm font-semibold">{i.email || "—"}</b>
                      {(i.first_name || i.phone) && (
                        <small className="block truncate text-[12.5px] text-muted-foreground">
                          {[i.first_name && `${i.first_name} ${i.last_name ?? ""}`.trim(), i.phone].filter(Boolean).join(" • ")}
                        </small>
                      )}
                    </div>
                  </div>
                </td>
                <td className={TD}>{i.role ? <RoleChip role={i.role} label={i.role.replaceAll("_", " ")} /> : "—"}</td>
                <td className={TD}>
                  <span className="whitespace-nowrap font-mono text-[11px] font-medium text-muted-foreground" title={new Date(i.invited_at).toLocaleString()}>
                    {relativeTime(i.invited_at)}
                  </span>
                </td>
                <td className={TD}><ExpiryChip expiresAt={i.expires_at} /></td>
                <td className={cn(TD, STICKY_TD)}>
                  <div className={ACTIONS}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-auto rounded-[10px] px-2.5 py-1.5 text-xs font-semibold"
                      onClick={() => handleResend(i.id)}
                      aria-label="Resend invitation"
                    >
                      Resend
                    </Button>
                    <ConfirmDeleteButton onConfirm={() => handleCancel(i.id)} label="Revoke invitation" question="Revoke?" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={handlePageChange} />}
    </>
  );
}

/** Mockup `.chip.warn.exp`: amber while the invite is live, red on its last day or once lapsed. */
function ExpiryChip({ expiresAt }: Readonly<{ expiresAt: string }>) {
  // eslint-disable-next-line react-hooks/purity -- a render-time "now" is fine for a day-granularity label
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  const text = days <= 0 ? "Expired" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return (
    <span
      title={new Date(expiresAt).toLocaleString()}
      className={cn(
        CHIP,
        "border-transparent font-mono",
        days <= 1 ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
      )}
    >
      {text}
    </span>
  );
}
