"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Globe, Mail, Phone } from "lucide-react";
import { DetailHeaderCard } from "@/components/detail-header-card";
import { businessesApi } from "../apis";
import type { BusinessDetail, BusinessPatch, InstitutionDetail } from "../apis/types";

/** Cover, logo, contact line (location is in the page subtitle) and branch/service counts for a business or institution (admin detail page). */
export function ListingHeaderCard({
  detail,
  onSave,
  readOnly = false,
}: Readonly<{
  detail: BusinessDetail | InstitutionDetail;
  onSave: (patch: Pick<BusinessPatch, "cover_url" | "logo_url">) => Promise<boolean>;
  /** The owner has claimed this listing — superadmin can view but not edit its images. */
  readOnly?: boolean;
}>) {
  const [uploading, setUploading] = useState<"cover" | "logo" | null>(null);

  const uploadAndSave = async (field: "cover_url" | "logo_url", which: "cover" | "logo", file: File) => {
    setUploading(which);
    try {
      const { path } = await businessesApi.uploadImage(file);
      await onSave({ [field]: path });
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setUploading(null);
    }
  };

  return (
    <DetailHeaderCard
      coverUrl={detail.cover_url}
      logoUrl={detail.logo_url}
      logoFallback={detail.business_name.charAt(0).toUpperCase()}
      onCoverFile={readOnly ? undefined : (file) => uploadAndSave("cover_url", "cover", file)}
      onLogoFile={readOnly ? undefined : (file) => uploadAndSave("logo_url", "logo", file)}
      uploading={uploading}
      stats={[
        { label: "Branches", value: detail.branch_count },
        { label: "Services", value: detail.service_count },
      ]}
    >
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {detail.website && <span className="flex items-center gap-1.5"><Globe className="size-3.5 shrink-0" /> {detail.website}</span>}
        {detail.email && <span className="flex items-center gap-1.5"><Mail className="size-3.5 shrink-0" /> {detail.email}</span>}
        {detail.phone && <span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0" /> {detail.phone}</span>}
      </p>
    </DetailHeaderCard>
  );
}
