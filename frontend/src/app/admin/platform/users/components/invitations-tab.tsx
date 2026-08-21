"use client";

import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ROLE_DISPLAY } from "../../../consts";
import { resendInvitation } from "../store/users-slice";
import type { AdminInvitation } from "../apis/types";
import { InviteUserDialog } from "./invite-user-dialog";

type PaginatedList<T> = { data: T[]; page: number; limit: number; total: number; totalPages: number };

function invitationStatus(invitation: AdminInvitation): { label: string; variant: "outline" | "secondary" | "default" } {
  if (invitation.status === "accepted") return { label: "Accepted", variant: "secondary" };
  if (new Date(invitation.expired_at) < new Date()) return { label: "Expired", variant: "outline" };
  return { label: "Pending", variant: "default" };
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
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invitations..."
            className="h-10 pl-9"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} className="h-10 gap-1.5 shrink-0 cursor-pointer">
            <UserPlus className="h-4 w-4" /> Invite Admin
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{invitations.total} invitation{invitations.total === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && invitations.data.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && invitations.data.length === 0 && <p className="text-sm text-muted-foreground">No invitations found.</p>}
          {invitations.data.map((invitation) => {
            const status = invitationStatus(invitation);
            return (
              <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {invitation.first_name} {invitation.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{invitation.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <Badge variant="secondary">{ROLE_DISPLAY[invitation.role]}</Badge>
                  {invitation.status === "pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      disabled={resendingId === invitation.id}
                      onClick={() => handleResend(invitation)}
                    >
                      {resendingId === invitation.id ? "Resending…" : "Resend"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Pagination page={invitations.page} limit={invitations.limit} total={invitations.total} onPageChange={onPageChange} />

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
