"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { InstitutionDetail, InstitutionPatch } from "../apis/types";

export function InstitutionOverviewDialog({
  open,
  onOpenChange,
  institution,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institution: InstitutionDetail;
  onSave: (patch: InstitutionPatch) => Promise<boolean>;
  saving: boolean;
}>) {
  const [description, setDescription] = useState(institution.description ?? "");

  useEffect(() => {
    if (open) setDescription(institution.description ?? "");
  }, [open, institution]);

  const handleSubmit = async () => {
    const ok = await onSave({ description: description || null });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Description</DialogTitle>
        </DialogHeader>
        <RichTextEditor value={description} onChange={setDescription} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
