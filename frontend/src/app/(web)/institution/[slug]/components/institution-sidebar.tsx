import { Users } from "lucide-react";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { InstitutionMember } from "../../../search/types";

const VISIBLE_MEMBERS = 6;

function initials(member: InstitutionMember) {
  return `${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`.toUpperCase() || "?";
}

export function InstitutionTeamCard({ members }: Readonly<{ members: InstitutionMember[] }>) {
  if (members.length === 0) return null;

  return (
    <ProfileSection icon={Users} title="Team Members">
      <div className="space-y-2">
        {members.slice(0, VISIBLE_MEMBERS).map((member) => (
          <div key={member.id} className="flex items-center gap-3 rounded-lg p-2">
            {member.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {initials(member)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {[member.first_name, member.last_name].filter(Boolean).join(" ") || "Team member"}
              </p>
              <p className="text-xs capitalize text-muted-foreground">{member.is_owner ? "owner" : member.role}</p>
            </div>
          </div>
        ))}
      </div>
    </ProfileSection>
  );
}
