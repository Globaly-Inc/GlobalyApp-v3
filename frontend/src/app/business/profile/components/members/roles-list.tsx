"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { deleteRole, fetchPermissions, fetchRoles } from "../../store/business-profile-detail-slice";
import type { Role } from "../../apis/types";

export function RolesList({ onEdit }: Readonly<{ onEdit: (role: Role) => void }>) {
  const dispatch = useAppDispatch();
  const { items: roles, status } = useAppSelector((state) => state.businessProfileDetail.roles);
  const permissions = useAppSelector((state) => state.businessProfileDetail.permissions);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchRoles());
    if (permissions.length === 0) dispatch(fetchPermissions());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const handleDelete = async (role: Role) => {
    try {
      await dispatch(deleteRole({ roleId: role.id })).unwrap();
      toast.success("Role deleted");
    } catch (e) {
      toast.error("Couldn't delete role", { description: (e as Error).message });
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No roles yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {roles.map((role) => (
        <div key={role.id} className="flex items-center justify-between rounded-lg border p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{role.display_name}</span>
              {role.is_system && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Lock className="h-3 w-3" /> System
                </Badge>
              )}
              <Badge variant="secondary">{role.permission_ids.length} permission{role.permission_ids.length === 1 ? "" : "s"}</Badge>
              {role.members_count > 0 && <Badge variant="secondary">{role.members_count} member{role.members_count === 1 ? "" : "s"}</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{role.description ?? "—"}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => onEdit(role)} aria-label={role.is_system ? "View role" : "Edit role"}>
              <Pencil className="h-4 w-4" />
            </Button>
            {!role.is_system && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-destructive"
                disabled={role.members_count > 0}
                onClick={() => handleDelete(role)}
                aria-label="Delete role"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
