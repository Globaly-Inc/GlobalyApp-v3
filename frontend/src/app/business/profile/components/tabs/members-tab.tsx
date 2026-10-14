"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { Member, Role } from "../../apis/types";
import { fetchInvitations } from "../../store/business-profile-detail-slice";
import { AddMemberDrawer } from "../members/add-member-drawer";
import { InviteMemberDialog } from "../members/invite-member-dialog";
import { AcceptedMembersList } from "../members/accepted-members-list";
import { InvitedMembersList } from "../members/invited-members-list";
import { RolesList } from "../members/roles-list";
import { RoleDrawer } from "../members/role-drawer";
import { TeamSubTabs } from "../members/team-sub-tabs";
import { PortalAddButton } from "../portal-ui/portal-add-button";
import { PortalPageHeader } from "../portal-ui/portal-page-header";
import { PortalStats } from "../portal-ui/portal-stats";
import { PortalStatTile } from "../portal-ui/portal-stat-tile";

type SubTab = "users" | "invited" | "roles";

export function MembersTab({ businessId }: Readonly<{ businessId: number }>) {
  const dispatch = useAppDispatch();
  const { members, invitations, roles } = useAppSelector((state) => state.businessProfileDetail);
  const [subTab, setSubTab] = useState<SubTab>("users");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // First page of invites up front (same params as the Invited list), so the "Pending invites"
  // tile and the Invited count are real before that sub-tab is opened.
  const fetchedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedIdRef.current === businessId) return;
    fetchedIdRef.current = businessId;
    dispatch(fetchInvitations({ id: businessId, params: { page: 1, limit: 10 } }));
  }, [dispatch, businessId]);

  const membersReady = members.status === "idle";
  const invitesReady = invitations.status === "idle";
  // Visibility is per row, so it's only countable when every member is on the loaded page.
  const allMembersLoaded = membersReady && members.total > 0 && members.items.length === members.total;
  const isRoles = subTab === "roles";

  return (
    <div className="stagger-in grid gap-4">
      <PortalPageHeader title="Team" subtitle="Manage your team members and their roles.">
        <PortalAddButton onClick={isRoles ? () => { setEditingRole(null); setRoleDrawerOpen(true); } : () => setInviteOpen(true)}>
          {isRoles ? "Add role" : "Invite member"}
        </PortalAddButton>
      </PortalPageHeader>

      {(membersReady || invitesReady) && (
        <PortalStats>
          {membersReady && <PortalStatTile value={members.total} label="Members" />}
          {invitesReady && <PortalStatTile value={invitations.total} label="Pending invites" />}
          {allMembersLoaded && <PortalStatTile value={members.items.filter((m) => m.is_public).length} label="Shown on profile" />}
        </PortalStats>
      )}

      <TeamSubTabs
        value={subTab}
        onChange={setSubTab}
        options={[
          { value: "users", label: "Members", count: membersReady ? members.total : null },
          { value: "invited", label: "Invited", count: invitesReady ? invitations.total : null },
          { value: "roles", label: "Roles", count: roles.items.length > 0 ? roles.items.length : null },
        ]}
      />

      <div className="grid min-w-0">
        {subTab === "users" && (
          <AcceptedMembersList businessId={businessId} onEdit={(m) => { setEditingMember(m); setDrawerOpen(true); }} />
        )}
        {subTab === "invited" && <InvitedMembersList businessId={businessId} />}
        {isRoles && <RolesList businessId={businessId} onEdit={(r) => { setEditingRole(r); setRoleDrawerOpen(true); }} />}
      </div>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} businessId={businessId} />
      <AddMemberDrawer open={drawerOpen} onOpenChange={setDrawerOpen} businessId={businessId} editingMember={editingMember} />
      <RoleDrawer open={roleDrawerOpen} onOpenChange={setRoleDrawerOpen} businessId={businessId} editingRole={editingRole} />
    </div>
  );
}
