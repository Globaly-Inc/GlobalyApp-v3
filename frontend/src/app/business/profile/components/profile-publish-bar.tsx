"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BusinessProfile } from "@/app/business/apis/types";

/** The Profile tab's top-right actions: Preview and Publish/Unpublish. */
export function ProfilePublishBar({
  profile,
  onPreview,
  onTogglePublished,
}: Readonly<{
  profile: BusinessProfile;
  onPreview: () => void;
  onTogglePublished: (isPublished: boolean) => Promise<void>;
}>) {
  const [toggling, setToggling] = useState(false);
  const live = profile.is_published;

  const toggle = async () => {
    setToggling(true);
    try {
      await onTogglePublished(!live);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="outline" size="sm" onClick={onPreview}>
        <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
      </Button>
      <Button variant={live ? "outline" : "default"} size="sm" onClick={toggle} disabled={toggling}>
        {toggling && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        {live ? "Unpublish" : "Publish profile"}
      </Button>
    </div>
  );
}
