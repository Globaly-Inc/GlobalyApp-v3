"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, CheckCircle2, Circle, Eye, Copy, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "./section-card";
import type { ProfileCompletion, StudentProfile } from "../apis/types";

// ponytail: no slug column in v3 yet, so the custom slug lives in localStorage (per-user id) rather
// than the backend — good enough for this preview-only link, upgrade to a real column if the public
// route ever ships.
function defaultSlug(profile: StudentProfile) {
  return [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function slugStorageKey(profile: StudentProfile) {
  return `personal-profile-slug:${profile.email ?? "me"}`;
}

export function ProfileSidebar({
  completion,
  profile,
  preview = false,
  onEditPreferences,
}: Readonly<{
  completion: ProfileCompletion;
  profile: StudentProfile;
  /** "?preview=1" mode: hides the two owner-only cards (completion nudge, public link management). */
  preview?: boolean;
  onEditPreferences: () => void;
}>) {
  const [slug, setSlug] = useState(() => defaultSlug(profile));
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(slug);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(slugStorageKey(profile));
      if (stored) setSlug(stored);
    } catch {
      // ponytail: private browsing / blocked storage — falls back to the derived slug, no crash.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEditingSlug = () => {
    setSlugDraft(slug);
    setEditingSlug(true);
  };

  const saveSlug = () => {
    const next = slugDraft.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    if (!next) return;
    setSlug(next);
    setEditingSlug(false);
    try {
      localStorage.setItem(slugStorageKey(profile), next);
    } catch {
      // ponytail: storage may be unavailable — the slug still updates for this session.
    }
  };

  return (
    <div className="space-y-6">
      {!preview && (
        <Card>
          <CardContent className="space-y-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Profile Completion</span>
              <span className="text-sm font-bold text-primary">{completion.percentage}%</span>
            </div>
            <Progress value={completion.percentage} className="h-2" />
            {completion.percentage === 100 ? (
              <p className="flex items-center gap-1.5 pt-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" /> Your profile is complete!
              </p>
            ) : (
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-medium text-muted-foreground">To complete your profile:</span>
                {completion.items
                  .filter((i) => !i.met)
                  .map((i) => (
                    <div key={i.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Circle className="h-3 w-3 shrink-0" />
                      <span>{i.label}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!preview && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Public Profile</p>
              <Link href="/personal/profile?preview=1" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Eye className="h-3.5 w-3.5" />
                View
              </Link>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Your public link</label>
              {editingSlug ? (
                <div className="flex h-9 items-center gap-1 rounded-md border border-destructive bg-background px-2 text-xs">
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">globalyapp.com/personal/</span>
                  <Input
                    autoFocus
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSlug();
                      if (e.key === "Escape") setEditingSlug(false);
                    }}
                    className="h-6 flex-1 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
                  />
                  <Button variant="ghost" size="icon-xs" className="shrink-0 text-primary" onClick={saveSlug} aria-label="Save">
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-destructive"
                    onClick={() => setEditingSlug(false)}
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex h-9 items-center gap-1 rounded-md border border-input bg-muted/50 px-2 text-xs">
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">globalyapp.com/personal/</span>
                  <span className="truncate font-medium text-foreground">{slug}</span>
                  <Button variant="ghost" size="icon-xs" className="ml-auto shrink-0" onClick={startEditingSlug} aria-label="Edit link">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`globalyapp.com/personal/${slug}`);
                      toast.success("Link copied");
                    }}
                    aria-label="Copy link"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <SectionCard icon={GraduationCap} title="Study Preferences" onEdit={preview ? undefined : onEditPreferences}>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subject areas</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.preferred_fields?.length ? (
              profile.preferred_fields.map((f) => <Badge key={f} variant="secondary">{f}</Badge>)
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
