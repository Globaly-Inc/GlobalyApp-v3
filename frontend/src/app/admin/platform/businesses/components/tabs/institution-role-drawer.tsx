"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { createInstitutionRole, fetchInstitutionPermissions, updateInstitutionRole } from "../../store/institution-detail-slice";
import type { InstitutionPermission, InstitutionRole } from "../../apis/types";

const MODULE_LABELS: Record<string, string> = {
  members: "Members",
  courses: "Courses",
  enquiries: "Enquiries",
  roles: "Roles",
};

export function InstitutionRoleDrawer({
  open,
  onOpenChange,
  institutionId,
  editingRole = null,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; institutionId: number; editingRole?: InstitutionRole | null }>) {
  const readOnly = !!editingRole?.is_system;
  const heading = readOnly ? editingRole?.display_name : editingRole ? `Edit ${editingRole.display_name}` : "Add role";
  const subheading = readOnly
    ? "System roles are built in and can't be changed — the permissions below are what this role grants."
    : "Members with this role get exactly the permissions ticked below.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription>{subheading}</SheetDescription>
        </SheetHeader>
        <RoleForm institutionId={institutionId} editingRole={editingRole} readOnly={readOnly} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function RoleForm({
  institutionId,
  editingRole,
  readOnly,
  onClose,
}: Readonly<{ institutionId: number; editingRole: InstitutionRole | null; readOnly: boolean; onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((s) => s.platformInstitutionDetail.permissions);
  const isEdit = !!editingRole;

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || permissions.length > 0) return;
    fetchedRef.current = true;
    dispatch(fetchInstitutionPermissions(institutionId));
  }, [dispatch, institutionId, permissions.length]);

  const [displayName, setDisplayName] = useState(editingRole?.display_name ?? "");
  const [description, setDescription] = useState(editingRole?.description ?? "");
  const [permissionIds, setPermissionIds] = useState<number[]>(editingRole?.permission_ids ?? []);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const byModule = new Map<string, InstitutionPermission[]>();
    for (const p of permissions) {
      const list = byModule.get(p.module) ?? [];
      list.push(p);
      byModule.set(p.module, list);
    }
    return [...byModule.entries()];
  }, [permissions]);

  const togglePermission = (id: number, checked: boolean) => {
    setPermissionIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      if (isEdit && editingRole) {
        await dispatch(updateInstitutionRole({
          id: institutionId,
          roleId: editingRole.id,
          patch: { display_name: displayName.trim(), description: description.trim() || null, permission_ids: permissionIds },
        })).unwrap();
        toast.success("Role updated");
      } else {
        await dispatch(createInstitutionRole({
          id: institutionId,
          input: { display_name: displayName.trim(), description: description.trim() || null, permission_ids: permissionIds },
        })).unwrap();
        toast.success("Role created");
      }
      onClose();
    } catch (e) {
      toast.error(isEdit ? "Couldn't update role" : "Couldn't create role", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 px-4">
        {!readOnly && (
          <>
            <div className="flex flex-col gap-2">
              <Label>Role name <span className="text-destructive">*</span></Label>
              <Input className="h-10" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Admissions Lead" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this role for?" rows={2} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-3">
          <Label>Permissions</Label>
          {grouped.map(([module, perms]) => (
            <div key={module} className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{MODULE_LABELS[module] ?? module}</p>
              <div className="flex flex-col gap-2">
                {perms.map((p) => (
                  <div key={p.id} className="flex items-start gap-2">
                    <Checkbox
                      className="mt-0.5"
                      checked={permissionIds.includes(p.id)}
                      disabled={readOnly}
                      onCheckedChange={(checked) => togglePermission(p.id, checked === true)}
                    />
                    <div>
                      <Label className="font-normal">{p.display_name}</Label>
                      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {!readOnly && (
          <Button onClick={handleSubmit} disabled={saving || !displayName.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create role"}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}
