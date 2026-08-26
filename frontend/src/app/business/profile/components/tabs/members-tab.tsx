"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import type { Member, Role } from "../../apis/types";
import { AddMemberDrawer } from "../members/add-member-drawer";
import { AcceptedMembersList } from "../members/accepted-members-list";
import { InvitedMembersList } from "../members/invited-members-list";
import { RolesList } from "../members/roles-list";
import { RoleDrawer } from "../members/role-drawer";

const SUB_TABS = [
  { value: "users", label: "Users" },
  { value: "invited", label: "Invited" },
  { value: "roles", label: "Roles" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["value"];

export function MembersTab({ businessId }: Readonly<{ businessId: number }>) {
  const { members, invitations } = useAppSelector((state) => state.businessProfileDetail);
  const [subTab, setSubTab] = useState<SubTab>("users");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Members</span>
          <Badge variant="secondary">{members.total}</Badge>
        </div>
        {subTab === "roles" ? (
          <Button className="h-10" onClick={() => { setEditingRole(null); setRoleDrawerOpen(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add role
          </Button>
        ) : (
          <Button className="h-10" onClick={() => { setEditingMember(null); setDrawerOpen(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add member
          </Button>
        )}
      </div>

      <AdminSegmentedTabs
        options={SUB_TABS.map((t) => ({ ...t, label: t.value === "invited" && invitations.total > 0 ? `${t.label} (${invitations.total})` : t.label }))}
        value={subTab}
        onChange={setSubTab}
      />

      {subTab === "users" && (
        <AcceptedMembersList businessId={businessId} onEdit={(m) => { setEditingMember(m); setDrawerOpen(true); }} />
      )}
      {subTab === "invited" && <InvitedMembersList businessId={businessId} />}
      {subTab === "roles" && <RolesList onEdit={(r) => { setEditingRole(r); setRoleDrawerOpen(true); }} />}

      <AddMemberDrawer open={drawerOpen} onOpenChange={setDrawerOpen} businessId={businessId} editingMember={editingMember} />
      <RoleDrawer open={roleDrawerOpen} onOpenChange={setRoleDrawerOpen} editingRole={editingRole} />
    </div>
  );
}
