"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, ExternalLink, Settings2, Building2, Tag, Layers, Link2 } from "lucide-react";
import type { ExtractionJob } from "../apis/types";

function SourceField({
  label, icon: Icon, children,
}: Readonly<{ label: string; icon: React.ElementType; children: React.ReactNode }>) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className="mt-0.5 text-sm font-medium truncate">{children}</div>
      </div>
    </div>
  );
}

// Name when the category row resolves, the raw id when it doesn't, dash when unset.
function categoryValue(name: string | null | undefined, id: number | null | undefined) {
  if (name) return name;
  return id == null ? "—" : `#${id}`;
}

function SourceLink({ href }: Readonly<{ href: string }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-primary hover:underline"
    >
      <span className="truncate">{href}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export function SourceInformationCard({
  job,
}: Readonly<{ job: ExtractionJob }>) {
  return (
    <Card>
      <CardHeader className="-mt-4 mb-0 rounded-t-xl border-b bg-primary/5 px-4 py-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          Source Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SourceField label="Institution URL" icon={Globe}>
            <SourceLink href={job.institution_url} />
          </SourceField>
          <SourceField label="Source Type" icon={Layers}>
            <Badge variant="secondary" className="capitalize font-medium">{job.source_type || "—"}</Badge>
          </SourceField>
          <SourceField label="Aggregator" icon={Building2}>{job.aggregator_name || "—"}</SourceField>
          <SourceField label="Business Category" icon={Tag}>
            {categoryValue(job.business_category_name, job.business_category_id)}
          </SourceField>
          <SourceField label="Service Category" icon={Tag}>
            {categoryValue(job.service_category_name, job.service_category_id)}
          </SourceField>
          {job.sample_course_url && (
            <SourceField label="Sample Course URL" icon={Link2}>
              <SourceLink href={job.sample_course_url} />
            </SourceField>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
