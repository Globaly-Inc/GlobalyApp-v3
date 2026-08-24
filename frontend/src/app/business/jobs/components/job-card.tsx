import { MapPin, Users, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JOB_TYPE_LABEL } from "../const";
import type { Job } from "../apis/types";

export function JobCard({
  job,
  onTogglePublished,
  onDelete,
  onViewApplications,
}: {
  job: Job;
  onTogglePublished: () => void;
  onDelete: () => void;
  onViewApplications: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{job.title}</h3>
        <Badge variant={job.is_published ? "default" : "outline"}>{job.is_published ? "Published" : "Draft"}</Badge>
      </div>

      {job.description && <p className="text-sm text-muted-foreground">{job.description}</p>}

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        {job.job_type && <span>{JOB_TYPE_LABEL[job.job_type]}</span>}
        <span className="flex items-center gap-1.5">
          {job.is_remote ? <Wifi className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
          {job.is_remote ? "Remote" : job.location_city ?? "On-site"}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          {job.applicant_count} applicants
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onTogglePublished}>
          {job.is_published ? "Unpublish" : "Publish"}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onViewApplications}>
            Applicants
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
