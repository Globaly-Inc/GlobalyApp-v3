"use client";

import { useEffect, useRef } from "react";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfileSection } from "@/app/(web)/components/profile/profile-section";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMembers } from "../store/business-profile-detail-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";

export function TeamMembersCard({ profile, readOnly }: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const { isPublic, toggle, canToggle } = useSectionVisibility(profile);
  const canEditVisibility = !readOnly && canToggle;
  const { items: members, status } = useAppSelector((state) => state.businessProfileDetail.members);

  const fetchedForRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedForRef.current === profile.id) return;
    fetchedForRef.current = profile.id;
    if (status === "idle" && members.length === 0) dispatch(fetchMembers({ id: profile.id, params: { limit: 5 } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  return (
    <ProfileSection
      icon={Users}
      title="Team Members"
      badge={<PrivacyBadge isPublic={isPublic("team")} onToggle={canEditVisibility ? () => toggle("team") : undefined} />}
    >
      <div>
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
      </div>
    </ProfileSection>
  );
}
