"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMembers } from "../store/business-profile-detail-slice";
import type { BusinessProfile } from "@/app/business/apis/types";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useSectionVisibility } from "./use-section-visibility";
import { ProfileCard } from "./profile-card";
import { hueOf } from "./branches/branch-row";

export function TeamMembersCard({ profile, readOnly }: Readonly<{ profile: BusinessProfile; readOnly: boolean }>) {
  const dispatch = useAppDispatch();
  const { isPublic, toggle, canToggle } = useSectionVisibility(profile);
  const canEditVisibility = !readOnly && canToggle;
  const { items: members, status } = useAppSelector((state) => state.businessProfileDetail.members);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Same URL shape as the sidebar's Team link, keeping ?org= and the rest; replace, not push, so
  // Back leaves the page instead of stepping between tabs.
  const openTeamTab = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "team");
    router.replace(`${pathname}?${params}`);
  };

  const fetchedForRef = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedForRef.current === profile.id) return;
    fetchedForRef.current = profile.id;
    if (status === "idle" && members.length === 0) dispatch(fetchMembers({ id: profile.id, params: { limit: 5 } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  return (
    <ProfileCard
      id="profile-team"
      icon={Users}
      title="Team Members"
      badge={<PrivacyBadge isPublic={isPublic("team")} onToggle={canEditVisibility ? () => toggle("team") : undefined} />}
      action={
        <Button size="sm" variant="ghost" className="gap-0.5 text-primary" onClick={openTeamTab}>
          Manage <ChevronRight />
        </Button>
      }
    >
      {members.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No team members added yet.</p>
      ) : (
        <div className="stagger-in grid gap-2.5">
          {members.slice(0, 5).map((member) => {
            const name = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
            return (
              <div key={member.id} className="flex items-center gap-2.5">
                <Avatar className="size-9 shrink-0" style={{ "--h": hueOf(name || "U") } as React.CSSProperties}>
                  {member.photo_url && <AvatarImage src={member.photo_url} alt="" />}
                  <AvatarFallback className="bg-[hsl(var(--h)_70%_92%)] font-mono text-xs font-semibold text-[hsl(var(--h)_55%_30%)] dark:bg-[hsl(var(--h)_35%_22%)] dark:text-[hsl(var(--h)_70%_80%)]">
                    {`${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.role_display}</p>
                </div>
                {member.is_owner && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">Owner</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ProfileCard>
  );
}
