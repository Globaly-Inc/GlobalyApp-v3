import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mockup `.chip`: 11px pill. Also used plain for "You" / "System" tags. */
export const CHIP = "inline-flex w-fit items-center gap-[5px] whitespace-nowrap rounded-full border px-2.25 py-0.75 text-[11px] font-semibold leading-none text-muted-foreground";

/** Owner = amber with a crown, Admin = primary tint, every other role a quiet outline. */
export function RoleChip({ role, label, owner = false }: Readonly<{ role: string; label: string; owner?: boolean }>) {
  const tone = owner
    ? "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
    : role === "admin"
      ? "border-transparent bg-primary/10 text-primary"
      : "";
  return (
    <span className={cn(CHIP, "capitalize", tone)}>
      {owner && <Crown className="size-[11px]" />}
      {owner ? "Owner" : label}
    </span>
  );
}
