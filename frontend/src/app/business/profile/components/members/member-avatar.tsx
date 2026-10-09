import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Member } from "../../apis/types";
import { hueOf } from "../branches/branch-row";

export const memberName = (m: Member) => `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();

/** Round avatar: the photo, else mono initials on a hue picked from the name (mockup's `.av`). */
export function MemberAvatar({ member, className }: Readonly<{ member: Member; className?: string }>) {
  const name = memberName(member) || member.email || "?";
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Avatar className={cn("size-[42px]", className)} style={{ "--h": hueOf(name) } as React.CSSProperties} title={name}>
      {member.photo_url && <AvatarImage src={member.photo_url} alt="" />}
      <AvatarFallback className="bg-[hsl(var(--h)_70%_92%)] font-mono text-[13px] font-semibold text-[hsl(var(--h)_55%_30%)] dark:bg-[hsl(var(--h)_35%_22%)] dark:text-[hsl(var(--h)_70%_80%)]">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
