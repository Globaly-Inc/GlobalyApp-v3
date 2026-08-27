"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import type { InstitutionRole } from "../../apis/types";
import { InviteInstitutionMemberDialog } from "../members/invite-institution-member-dialog";
import { InstitutionInvitationsList } from "./institution-invitations-list";
import { InstitutionMembersList } from "./institution-members-list";
import { InstitutionRolesList } from "./institution-roles-list";
import { InstitutionRoleDrawer } from "./institution-role-drawer";

const SUB_TABS = [
  { value: "members", label: "Members" },
  { value: "invitations", label: "Sent Invitations" },
  { value: "roles", label: "Roles" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["value"];

export function InstitutionMembersTab({
  institutionId,
  readOnly = false,
}: Readonly<{ institutionId: number; readOnly?: boolean }>) {
  const total = useAppSelector((state) => state.platformInstitutionDetail.members.total);
  const [subTab, setSubTab] = useState<SubTab>("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<InstitutionRole | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Members</span>
          <Badge variant="secondary">{total}</Badge>
        </div>
        {!readOnly && (subTab === "roles" ? (
          <Button className="h-10" onClick={() => { setEditingRole(null); setRoleDrawerOpen(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add role
          </Button>
        ) : (
          <Button className="h-10" onClick={() => setInviteOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Member
          </Button>
        ))}
      </div>

      <AdminSegmentedTabs options={SUB_TABS} value={subTab} onChange={setSubTab} />

      {subTab === "members" && <InstitutionMembersList institutionId={institutionId} readOnly={readOnly} />}
      {subTab === "invitations" && <InstitutionInvitationsList institutionId={institutionId} readOnly={readOnly} />}
      {subTab === "roles" && (
        <InstitutionRolesList
          institutionId={institutionId}
          onEdit={(r) => { setEditingRole(r); setRoleDrawerOpen(true); }}
          readOnly={readOnly}
        />
      )}

      <InviteInstitutionMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} institutionId={institutionId} />
      <InstitutionRoleDrawer open={roleDrawerOpen} onOpenChange={setRoleDrawerOpen} institutionId={institutionId} editingRole={editingRole} />
    </div>
  );
}
