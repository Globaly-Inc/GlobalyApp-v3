"use client";

import { useState } from "react";
import { MailPlus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ROLE_DISPLAY } from "../../../consts";
import { resendInvitation } from "../store/users-slice";
import type { AdminInvitation } from "../apis/types";
import { InviteUserDialog } from "./invite-user-dialog";

type PaginatedList<T> = { data: T[]; page: number; limit: number; total: number; totalPages: number };

function invitationStatus(invitation: AdminInvitation): { label: string; variant: "outline" | "success" | "warning" } {
  if (invitation.status === "accepted") return { label: "Accepted", variant: "success" };
  if (new Date(invitation.expired_at) < new Date()) return { label: "Expired", variant: "outline" };
  return { label: "Pending", variant: "warning" };
}

export function InvitationsTab({
  invitations, search, onSearchChange, loading, onPageChange,
}: Readonly<{
  invitations: PaginatedList<AdminInvitation>;
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  onPageChange: (page: number) => void;
}>) {
  const dispatch = useAppDispatch();
  const { me } = useAppSelector((state) => state.admin);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const canInvite = me?.role === "super_admin";

  const handleResend = async (invitation: AdminInvitation) => {
    setResendingId(invitation.id);
    const result = await dispatch(resendInvitation(invitation.id));
    setResendingId(null);
    if (resendInvitation.rejected.match(result)) {
      toast.error("Couldn't resend invitation", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(`Invitation resent to ${invitation.email}`);
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        <SearchInput placeholder="Search invitations" value={search} onChange={(e) => onSearchChange(e.target.value)} />
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {invitations.total} invitation{invitations.total === 1 ? "" : "s"}
        </span>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} className="h-10 shrink-0 gap-1.5">
            <UserPlus className="h-4 w-4" /> Invite Admin
          </Button>
        )}
      </FilterBar>

      {loading && invitations.data.length === 0 && <ListSkeleton count={4} itemClassName="h-14" />}
      {!loading && invitations.data.length === 0 && <EmptyState icon={MailPlus} title="No invitations found" />}
      {invitations.data.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invitee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.data.map((invitation) => {
                const status = invitationStatus(invitation);
                return (
                  <TableRow key={invitation.id}>
                    <TableCell primary>
                      <p className="truncate font-medium text-foreground">
                        {invitation.first_name} {invitation.last_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{ROLE_DISPLAY[invitation.role]}</Badge></TableCell>
                    <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    <TableCell>
                      {invitation.status === "pending" && (
                        <Button variant="outline" size="sm" disabled={resendingId === invitation.id} onClick={() => handleResend(invitation)}>
                          {resendingId === invitation.id ? "Resending…" : "Resend"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Pagination page={invitations.page} limit={invitations.limit} total={invitations.total} onPageChange={onPageChange} />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
