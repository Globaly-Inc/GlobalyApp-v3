"use client";

import { Card } from "@/components/ui/card";
import { CoverLogoEditor } from "@/components/cover-logo-editor";

export function MediaUrlsCard({
  logoPreview,
  onLogoFile,
  coverPreview,
  onCoverFile,
  logoFallback,
}: Readonly<{
  logoPreview: string | null;
  onLogoFile: (file: File) => void;
  coverPreview: string | null;
  onCoverFile: (file: File) => void;
  logoFallback: string;
}>) {
  return (
    <Card className="overflow-hidden p-0">
      <CoverLogoEditor
        coverUrl={coverPreview}
        onCoverFile={onCoverFile}
        logoUrl={logoPreview}
        logoFallback={logoFallback}
        onLogoFile={onLogoFile}
      />
      <div className="h-14" />
    </Card>
  );
}
