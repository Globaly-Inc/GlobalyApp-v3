"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/combobox";
import { JOB_TYPE_LABEL } from "../const";
import type { CreateJobInput, JobType } from "../apis/types";

const JOB_TYPE_OPTIONS = (Object.keys(JOB_TYPE_LABEL) as JobType[]).map((v) => ({ value: v, label: JOB_TYPE_LABEL[v] }));

export function CreateJobDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateJobInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [jobType, setJobType] = useState<JobType>("full_time");
  const [locationCity, setLocationCity] = useState("");
  const [isRemote, setIsRemote] = useState(false);

  const canSubmit = title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      title: title.trim(),
      description: description.trim() || null,
      job_type: jobType,
      location_city: isRemote ? null : locationCity.trim() || null,
      is_remote: isRemote,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New job posting</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="job-title">Title</Label>
            <Input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Student Advisor" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="job-description">Description</Label>
            <Textarea id="job-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Job type</Label>
            <Combobox options={JOB_TYPE_OPTIONS} value={jobType} onChange={(v) => setJobType(v as JobType)} placeholder="Select job type" />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant={!isRemote ? "default" : "outline"} size="sm" onClick={() => setIsRemote(false)}>
              On-site
            </Button>
            <Button type="button" variant={isRemote ? "default" : "outline"} size="sm" onClick={() => setIsRemote(true)}>
              Remote
            </Button>
          </div>

          {!isRemote && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="job-location">City</Label>
              <Input id="job-location" value={locationCity} onChange={(e) => setLocationCity(e.target.value)} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Creating…" : "Create posting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
