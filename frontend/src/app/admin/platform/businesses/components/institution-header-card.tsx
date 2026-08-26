"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Pencil, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { businessesApi } from "../apis";
import { STATUS_COLORS, STATUS_LABELS } from "../const";
import type { InstitutionDetail, InstitutionPatch } from "../apis/types";

export function InstitutionHeaderCard({
  institution,
  location,
  onSave,
  onEdit,
}: Readonly<{
  institution: InstitutionDetail;
  location: string;
  onSave: (patch: InstitutionPatch) => Promise<boolean>;
  onEdit: () => void;
}>) {
  const [uploading, setUploading] = useState<"cover" | "logo" | null>(null);
  const initial = institution.business_name.charAt(0).toUpperCase();

  const uploadAndSave = async (field: "cover_url" | "logo_url", which: "cover" | "logo", file: File) => {
    setUploading(which);
    try {
      const { path } = await businessesApi.uploadImage(file);
      await onSave({ [field]: path } as InstitutionPatch);
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      <CoverLogoEditor
        coverUrl={institution.cover_url}
        onCoverFile={(file) => uploadAndSave("cover_url", "cover", file)}
        coverUploading={uploading === "cover"}
        logoUrl={institution.logo_url}
        logoFallback={initial}
        onLogoFile={(file) => uploadAndSave("logo_url", "logo", file)}
        logoUploading={uploading === "logo"}
      />
      <CardContent className="ml-8 mb-8 flex items-start gap-4 pt-16">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-foreground">{institution.business_name}</h1>
            <Badge variant="outline" className="border-sky-200 text-sky-700">Institution</Badge>
            <Badge className={STATUS_COLORS[institution.status]}>{STATUS_LABELS[institution.status]}</Badge>
          </div>
          {location && <p className="mt-1 text-sm text-muted-foreground">{location}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {institution.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {institution.email}
              </span>
            )}
            {institution.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {institution.phone}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit institution">
          <Pencil className="h-4 w-4" />
        </Button>
      </CardContent>
    </div>
  );
}
