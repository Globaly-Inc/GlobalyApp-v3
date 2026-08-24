"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import type { StudentProfile } from "../apis/types";

export function ProfileHeroCard({
  profile,
  initial,
  imageUploading,
  onImageFile,
}: Readonly<{
  profile: StudentProfile;
  initial: string;
  imageUploading: "profile" | "cover" | null;
  onImageFile: (category: "profile" | "cover", file: File) => void;
}>) {
  return (
    <Card className="overflow-hidden">
      <CoverLogoEditor
        className="h-40 sm:h-48"
        coverUrl={profile.cover_url}
        onCoverFile={(file) => onImageFile("cover", file)}
        coverUploading={imageUploading === "cover"}
        logoUrl={profile.photo_url}
        logoFallback={initial}
        onLogoFile={(file) => onImageFile("profile", file)}
        logoUploading={imageUploading === "profile"}
      />
      <CardContent className="pt-16">
        <h1 className="text-xl font-bold text-foreground">
          {profile.first_name} {profile.last_name}
        </h1>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
      </CardContent>
    </Card>
  );
}
