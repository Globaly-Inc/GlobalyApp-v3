"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { InviteInstitutionMemberDialog } from "../members/invite-institution-member-dialog";
import { InstitutionInvitationsList } from "./institution-invitations-list";
import { InstitutionMembersList } from "./institution-members-list";

const SUB_TABS = [
  { value: "members", label: "Members" },
  { value: "invitations", label: "Sent Invitations" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["value"];

export function InstitutionMembersTab({ institutionId }: Readonly<{ institutionId: number }>) {
  const total = useAppSelector((state) => state.platformInstitutionDetail.members.total);
  const [subTab, setSubTab] = useState<SubTab>("members");
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Members</span>
          <Badge variant="secondary">{total}</Badge>
        </div>
        <Button className="h-10" onClick={() => setInviteOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Member
        </Button>
      </div>

      <AdminSegmentedTabs options={SUB_TABS} value={subTab} onChange={setSubTab} />

      {subTab === "members" ? (
        <InstitutionMembersList institutionId={institutionId} />
      ) : (
        <InstitutionInvitationsList institutionId={institutionId} />
      )}

      <InviteInstitutionMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} institutionId={institutionId} />
    </div>
  );
}
