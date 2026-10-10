"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Lock, Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { deleteRole, fetchPermissions, fetchRoles } from "../../store/business-profile-detail-slice";
import type { Role } from "../../apis/types";
import { CHIP } from "./role-chip";
import { MemberAvatar } from "./member-avatar";
import { TeamEmpty } from "./team-empty";

const STACK_MAX = 5;

export function RolesList({ businessId, onEdit }: Readonly<{ businessId: number; onEdit: (role: Role) => void }>) {
  const dispatch = useAppDispatch();
  const { items: roles, status } = useAppSelector((state) => state.businessProfileDetail.roles);
  const permissions = useAppSelector((state) => state.businessProfileDetail.permissions);
  // Avatars come from the loaded members page; the count beside them is the role's real total.
  const members = useAppSelector((state) => state.businessProfileDetail.members.items);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchRoles({ id: businessId }));
    if (permissions.length === 0) dispatch(fetchPermissions({ id: businessId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, businessId]);

  const handleDelete = async (role: Role) => {
    try {
      await dispatch(deleteRole({ id: businessId, roleId: role.id })).unwrap();
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

  if (roles.length === 0) return <TeamEmpty title="No roles yet" hint="Add a role to control what each member can do." />;

  return (
    <div className="stagger-in grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
      {roles.map((role, i) => {
        const granted = role.permission_ids.length;
        const pct = permissions.length > 0 ? Math.min(100, Math.round((granted / permissions.length) * 100)) : null;
        const who = members.filter((m) => m.role_id === role.id).slice(0, STACK_MAX);
        return (
          <article
            key={role.id}
            className="grid gap-2.5 rounded-[14px] border bg-card p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgb(17_26_64/0.05),0_12px_32px_-16px_rgb(17_26_64/0.24)]"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
                {role.name === "owner" && <Crown className="size-3.75 shrink-0" />}
                <span className="truncate">{role.display_name}</span>
                {role.is_system && (
                  <span className={CHIP}>
                    <Lock className="size-2.5" /> System
                  </span>
                )}
              </h3>
              <div className="-mr-1.5 -mt-1.5 flex shrink-0 items-center gap-0.5">
                <Button size="icon-sm" variant="ghost" className="text-muted-foreground active:scale-90" onClick={() => onEdit(role)} aria-label={role.is_system ? "View role" : "Edit role"}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!role.is_system && (role.members_count > 0 ? (
                  // A role still assigned to someone can't be deleted.
                  <Button size="icon-sm" variant="ghost" className="text-destructive" disabled aria-label="Delete role" title="Reassign its members first">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <ConfirmDeleteButton onConfirm={() => handleDelete(role)} label="Delete role" />
                ))}
              </div>
            </div>
            {role.description && <p className="text-[12.5px] leading-normal text-muted-foreground">{role.description}</p>}
            <div>
              <div className="mb-1.25 flex justify-between text-[11.5px] text-muted-foreground">
                <span>Permissions</span>
                <span className="tabular-nums">{pct === null ? granted : `${pct}%`}</span>
              </div>
              {pct !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-border" title={`${granted} of ${permissions.length}`}>
                  <div
                    className="animate-fill-x h-full bg-primary"
                    style={{ width: `${pct}%`, "--fill-delay": `${200 + Math.min(i, 8) * 60}ms` } as React.CSSProperties}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex">
                {role.members_count === 0
                  ? <span>No members</span>
                  : who.map((m) => <MemberAvatar key={m.id} member={m} className="-ml-1.5 size-7 ring-2 ring-card first:ml-0 [&_[data-slot=avatar-fallback]]:text-[10px]" />)}
              </div>
              <span>{role.members_count} member{role.members_count === 1 ? "" : "s"}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
