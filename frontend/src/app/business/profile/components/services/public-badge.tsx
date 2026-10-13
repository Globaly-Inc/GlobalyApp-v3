import { Globe2 } from "lucide-react";

/** Static "Public" pill — used where there's no section key to toggle (no visibility prop). */
export function PublicBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
      <Globe2 className="h-3 w-3" />
      Public
    </span>
  );
}
