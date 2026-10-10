"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { relativeTime } from "@/components/feed/utils";
import { fetchRackProfile, saveRackProfile } from "../store/ai-knowledge-profile-slice";
import type { PatchRackProfileInput } from "../apis/types";
import { RackProfileForm } from "./rack-profile-form";

export function StyleTab() {
  const dispatch = useAppDispatch();
  const { profile, configured, version, status, saveStatus, savedAt, error } =
    useAppSelector((s) => s.aiKnowledgeProfile);

  // Strict Mode double-invokes effects; this fetch takes no arguments, so a plain ref guard is
  // all it needs (frontend/AGENTS.md).
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchRackProfile());
  }, [dispatch]);

  // The version the editor was built from travels with the save; the backend applies the write
  // only while the stored row still matches, so a concurrent save is a 409 rather than a silent
  // overwrite of whatever the other person just changed.
  const save = (patch: Omit<PatchRackProfileInput, "expected_version">) => {
    dispatch(saveRackProfile({ ...patch, expected_version: version }));
  };

  if (status === "loading" && !profile) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "failed" || !profile) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        {error ?? "Couldn't load your counsellor's settings."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {configured
            ? `Last saved ${savedAt ? relativeTime(savedAt) : "earlier"}.`
            : "Using the defaults. Nothing here has been changed yet."}
        </p>
        {saveStatus === "failed" && error && (
          <p className="text-xs text-destructive">
            {error} Your changes are still on screen — reapply the ones you want and save again.
          </p>
        )}
      </div>

      {/* Remounted on every save so the draft re-initialises from the server's own merged row —
          which is also what keeps "Unsaved changes" honest after a save. */}
      <RackProfileForm
        key={version}
        profile={profile}
        saving={saveStatus === "loading"}
        onSave={save}
      />
    </div>
  );
}
