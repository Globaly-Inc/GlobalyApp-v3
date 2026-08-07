"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { createJob } from "../store/all-extractions-slice";

export function NewExtractionDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const [institutionUrl, setInstitutionUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) setInstitutionUrl("");
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!institutionUrl.trim()) return;
    setCreating(true);
    const result = await dispatch(createJob({ institution_url: institutionUrl.trim() }));
    setCreating(false);
    if (createJob.rejected.match(result)) {
      toast.error("Couldn't start extraction", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Extraction started");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Extraction</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Institution website URL</Label>
          <Input
            type="url"
            placeholder="https://university.edu"
            value={institutionUrl}
            onChange={(e) => setInstitutionUrl(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button className="h-10 cursor-pointer" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-10 cursor-pointer" onClick={handleSubmit} disabled={creating || !institutionUrl.trim()}>
            {creating ? "Starting…" : "Start Extraction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
