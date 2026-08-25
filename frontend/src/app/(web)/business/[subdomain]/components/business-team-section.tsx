import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { BusinessMember } from "../../../search/types";

function initials(firstName: string | null, lastName: string | null) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export function BusinessTeamSection({ members = [] }: Readonly<{ members?: BusinessMember[] }>) {
  if (members.length === 0) return null;

  return (
    <ProfileSection icon={Users} title="Team Members" count={members.length}>
      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(member.first_name, member.last_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {[member.first_name, member.last_name].filter(Boolean).join(" ") || "Team member"}
              </p>
              <p className="text-xs text-muted-foreground">{member.role_display}</p>
            </div>
            {member.admin_point_of_contact && (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">Contact</Badge>
            )}
          </div>
        ))}
      </div>
    </ProfileSection>
  );
}
