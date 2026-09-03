"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Pencil, Phone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  readOnly = false,
}: Readonly<{
  institution: InstitutionDetail;
  location: string;
  onSave: (patch: InstitutionPatch) => Promise<boolean>;
  onEdit: () => void;
  /** The owner has claimed this institution — superadmin can view but not edit its details. */
  readOnly?: boolean;
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
      {readOnly ? (
        <div className="relative h-40 bg-gradient-to-br from-primary to-primary/60 sm:h-48">
          {institution.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={institution.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <Avatar className="absolute -bottom-12 left-6 size-24 rounded-xl border-4 border-background bg-white shadow-lg">
            {institution.logo_url && (
              <AvatarImage src={institution.logo_url} alt="" className="rounded-lg object-contain p-1" />
            )}
            <AvatarFallback className="rounded-lg text-2xl">{initial}</AvatarFallback>
          </Avatar>
        </div>
      ) : (
        <CoverLogoEditor
          coverUrl={institution.cover_url}
          onCoverFile={(file) => uploadAndSave("cover_url", "cover", file)}
          coverUploading={uploading === "cover"}
          logoUrl={institution.logo_url}
          logoFallback={initial}
          onLogoFile={(file) => uploadAndSave("logo_url", "logo", file)}
          logoUploading={uploading === "logo"}
        />
      )}
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
        {!readOnly && (
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit institution">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </div>
  );
}
