"use client";

import { useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PrivacyBadge } from "@/components/privacy-badge";
import { SectionCard } from "@/app/personal/profile/section-card";

/**
 * The service description, read-only until the pencil is clicked — V1's Description card.
 *
 * A permanently-open textarea made an empty description look like an unfinished form on a page
 * that is mostly read-only summary cards; V1 shows "Not set" and opens the editor on demand.
 * Cancel restores what was there on open, so an abandoned edit changes nothing.
 */
export function ServiceDescriptionCard({
  description,
  onChange,
}: Readonly<{ description: string; onChange: (value: string) => void }>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);

  const open = () => {
    setDraft(description);
    setEditing(true);
  };

  return (
    <SectionCard
      icon={FileText}
      title="Description"
      badge={<PrivacyBadge isPublic />}
      onEdit={editing ? undefined : open}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Describe the service..."
            rows={6}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-primary"
              onClick={() => toast("Coming soon", { description: "AI-generated descriptions aren't available yet." })}
            >
              <Sparkles className="h-3.5 w-3.5" /> Write with AI
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onChange(draft);
                  setEditing(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Description</p>
          {description.trim() ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{description}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Not set</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
