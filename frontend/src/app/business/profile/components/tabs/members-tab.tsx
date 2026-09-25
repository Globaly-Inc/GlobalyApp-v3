"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
  const { invitations } = useAppSelector((state) => state.businessProfileDetail);
  const [subTab, setSubTab] = useState<SubTab>("users");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-muted-foreground">Manage your business team members and roles.</p>
        </div>
        {subTab === "roles" ? (
          <Button className="h-10" onClick={() => { setEditingRole(null); setRoleDrawerOpen(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add role
          </Button>
        ) : (
          <Button className="h-10" onClick={() => { setEditingMember(null); setDrawerOpen(true); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Invite Member
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
      {subTab === "roles" && <RolesList businessId={businessId} onEdit={(r) => { setEditingRole(r); setRoleDrawerOpen(true); }} />}

      <AddMemberDrawer open={drawerOpen} onOpenChange={setDrawerOpen} businessId={businessId} editingMember={editingMember} />
      <RoleDrawer open={roleDrawerOpen} onOpenChange={setRoleDrawerOpen} businessId={businessId} editingRole={editingRole} />
    </div>
  );
}
