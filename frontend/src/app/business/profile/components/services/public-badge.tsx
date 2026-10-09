import { Globe2 } from "lucide-react";

/** Static "Public" pill — used where there's no section key to toggle (no visibility prop). */
export function PublicBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
      <Globe2 className="h-3 w-3" />
      Public
    </span>
  );
}
