"use client";

import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** V1's `PrivacyBadge`, made interactive — `public_visibility` defaults a missing key to visible. */
export function SectionVisibilityToggle({
  section,
  publicVisibility,
  onToggle,
}: Readonly<{ section: string; publicVisibility: Record<string, boolean> | null; onToggle: (nextIsPublic: boolean) => void }>) {
  const isPublic = publicVisibility?.[section] !== false;
  return (
    <button type="button" onClick={() => onToggle(!isPublic)} className="cursor-pointer">
      <Badge variant={isPublic ? "secondary" : "outline"} className="gap-1 text-[11px]">
        {isPublic ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {isPublic ? "Public" : "Hidden"}
      </Badge>
    </button>
  );
}
