"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ROLE_DISPLAY } from "../../../consts";
import { fetchAdmins } from "../store/users-slice";
import { InviteUserDialog } from "./invite-user-dialog";

export function UsersView() {
  const dispatch = useAppDispatch();
  const { me } = useAppSelector((state) => state.admin);
  const { admins, status } = useAppSelector((state) => state.adminUsers);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchAdmins({}));
  }, [dispatch]);

  const canInvite = me?.role === "super_admin";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground mt-1">Manage who has admin access to Globaly.</p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" /> Invite Admin
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{admins.length} admin{admins.length === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {status === "loading" && admins.length === 0 && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {admins.map((admin) => (
            <div key={admin.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="size-8">
                  {admin.photo_url && <AvatarImage src={admin.photo_url} alt={admin.name} />}
                  <AvatarFallback>{admin.name?.[0]?.toUpperCase() ?? "A"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{admin.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {admin.account_status === 0 && <Badge variant="outline">Pending</Badge>}
                <Badge variant="secondary">{ROLE_DISPLAY[admin.role]}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
