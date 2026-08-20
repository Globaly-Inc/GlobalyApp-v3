import { Badge } from "@/components/ui/badge";
import type { BusinessMember } from "../../../search/types";

const AVATAR_GRADIENTS = [
  "from-primary/25 to-primary/5",
  "from-blue-400/25 to-blue-400/5",
  "from-amber-400/25 to-amber-400/5",
  "from-emerald-400/25 to-emerald-400/5",
];

function initials(firstName: string | null, lastName: string | null) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export function BusinessTeamSection({ members = [] }: Readonly<{ members?: BusinessMember[] }>) {
  if (members.length === 0) return null;

  return (
    <section className="py-12 bg-muted/30 border-y border-border">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="mb-6">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">The people behind it</p>
          <h2 className="text-2xl font-bold text-foreground">Meet the Team</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {members.map((member, i) => (
            <div
              key={member.id}
              className="bg-card border border-border rounded-2xl p-5 text-center hover:shadow-md transition-all"
            >
              <div
                className={`w-16 h-16 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} text-primary font-bold flex items-center justify-center mx-auto mb-3 text-lg`}
              >
                {initials(member.first_name, member.last_name)}
              </div>
              <h3 className="font-semibold text-foreground text-sm leading-snug">
                {[member.first_name, member.last_name].filter(Boolean).join(" ") || "Team member"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{member.role_display}</p>
              {member.admin_point_of_contact && (
                <Badge variant="secondary" className="mt-2 text-[10px] px-1.5 py-0">Point of contact</Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
