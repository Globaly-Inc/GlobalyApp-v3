"use client";

import { useEffect } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { updateMyProfile } from "@/app/business/store/business-onboarding-slice";
import { fetchMembers } from "../store/business-profile-detail-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { SectionVisibilityToggle } from "./section-visibility-toggle";

export function TeamMembersCard({ profile, readOnly }: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const { items: members, status } = useAppSelector((state) => state.businessProfileDetail.members);

  useEffect(() => {
    if (status === "idle" && members.length === 0) dispatch(fetchMembers({ id: profile.id, params: { limit: 5 } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const toggleVisibility = async (isPublic: boolean) => {
    const next = { ...(profile.public_visibility ?? {}), team: isPublic };
    try {
      await dispatch(updateMyProfile({ public_visibility: next })).unwrap();
    } catch (e) {
      toast.error("Couldn't update visibility", { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" /> Team Members
        </CardTitle>
        {!readOnly && (
          <SectionVisibilityToggle section="team" publicVisibility={profile.public_visibility} onToggle={toggleVisibility} />
        )}
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No team members added yet.</p>
        ) : (
          <div className="space-y-3">
            {members.slice(0, 5).map((member) => (
              <div key={member.id} className="flex items-center gap-2.5">
                <Avatar className="size-8 shrink-0">
                  {member.photo_url && <AvatarImage src={member.photo_url} alt="" />}
                  <AvatarFallback className="text-xs">
                    {`${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.first_name} {member.last_name}</p>
                  <p className="text-xs text-muted-foreground">{member.is_owner ? "Owner" : member.role_display}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
