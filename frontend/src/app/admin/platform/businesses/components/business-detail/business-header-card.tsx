"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, Mail, Pencil, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { businessesApi } from "../../apis";
import type { BusinessDetail, BusinessPatch } from "../../apis/types";

export function BusinessHeaderCard({
  business,
  location,
  onSave,
  onEdit,
}: Readonly<{
  business: BusinessDetail;
  location: string;
  onSave: (patch: BusinessPatch) => Promise<boolean>;
  onEdit: () => void;
}>) {
  const [uploading, setUploading] = useState<"cover" | "logo" | null>(null);
  const initial = business.business_name.charAt(0).toUpperCase();

  const uploadAndSave = async (field: "cover_url" | "logo_url", which: "cover" | "logo", file: File) => {
    setUploading(which);
    try {
      const { path } = await businessesApi.uploadImage(file);
      await onSave({ [field]: path } as BusinessPatch);
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setUploading(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CoverLogoEditor
        coverUrl={business.cover_url}
        onCoverFile={(file) => uploadAndSave("cover_url", "cover", file)}
        coverUploading={uploading === "cover"}
        logoUrl={business.logo_url}
        logoFallback={initial}
        onLogoFile={(file) => uploadAndSave("logo_url", "logo", file)}
        logoUploading={uploading === "logo"}
      />
      <CardContent className="flex items-start gap-4 pt-16">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-foreground">{business.business_name}</h1>
            {business.category_name && (
              <Badge variant="secondary" className="gap-1">
                <Building2 className="h-3 w-3" /> {business.category_name}
              </Badge>
            )}
          </div>
          {location && <p className="mt-1 text-sm text-muted-foreground">{location}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {business.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {business.email}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {business.branch_count} members
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit business">
          <Pencil className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
