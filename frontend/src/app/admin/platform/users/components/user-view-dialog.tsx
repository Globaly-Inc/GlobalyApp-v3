"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_DISPLAY } from "../../../consts";
import type { AdminUser } from "../apis/types";

function Field({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

export function UserViewDialog({
  user, onClose,
}: Readonly<{ user: AdminUser | null; onClose: () => void }>) {
  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>
        {user && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                {user.photo_url && <AvatarImage src={user.photo_url} alt={user.name} />}
                <AvatarFallback>{user.name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-foreground">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Role" value={ROLE_DISPLAY[user.role]} />
              <Field
                label="Status"
                value={
                  <Badge variant={user.is_active ? "secondary" : "outline"}>
                    {user.is_active ? "Active" : "Suspended"}
                  </Badge>
                }
              />
              <Field label="Phone" value={user.phone || "—"} />
              <Field label="Email Verified" value={user.is_email_verified ? "Yes" : "No"} />
              <Field
                label="Joined"
                value={new Date(user.created_at).toLocaleDateString(undefined, {
                  day: "numeric", month: "long", year: "numeric",
                })}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
