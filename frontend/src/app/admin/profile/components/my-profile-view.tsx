"use client";

import { useState } from "react";
import { toast } from "sonner";
import { User, Mail, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { SectionCard, Field } from "@/app/personal/profile/section-card";
import { adminApi } from "../../apis";
import { fetchMe, updateMe } from "../../store/admin-slice";
import { ROLE_DISPLAY } from "../../consts";
import { PersonalDetailsDialog } from "./personal-details-dialog";

export function MyProfileView() {
  const dispatch = useAppDispatch();
  const { me, status } = useAppSelector((state) => state.admin);

  const [personalOpen, setPersonalOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState<"profile" | "cover" | null>(null);

  if (!me) return null;

  const initial = me.name?.[0]?.toUpperCase() ?? "";

  const handleImageFile = async (category: "profile" | "cover", file: File) => {
    setImageUploading(category);
    try {
      await adminApi.uploadImage(category, file);
      await dispatch(fetchMe());
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : "Please try again." });
    } finally {
      setImageUploading(null);
    }
  };

  const handleSaveName = async (name: string) => {
    const result = await dispatch(updateMe({ id: me.id, patch: { name } }));
    if (updateMe.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="overflow-hidden">
        <CoverLogoEditor
          coverUrl={me.cover_url}
          onCoverFile={(file) => handleImageFile("cover", file)}
          coverUploading={imageUploading === "cover"}
          logoUrl={me.photo_url}
          logoFallback={initial}
          onLogoFile={(file) => handleImageFile("profile", file)}
          logoUploading={imageUploading === "profile"}
        />
        <CardContent className="pt-16">
          <h1 className="text-xl font-bold text-foreground">{me.name}</h1>
          <p className="text-sm text-muted-foreground">{me.email}</p>
        </CardContent>
      </Card>

      <SectionCard
        icon={User}
        title="Personal Details"
        badge={
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> Private
          </Badge>
        }
        onEdit={() => setPersonalOpen(true)}
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Full Name" value={me.name} />
          <Field label="Role" value={ROLE_DISPLAY[me.role]} />
          <Field label="Account Status" value={me.account_status === 1 ? "Active" : "Inactive"} />
          <Field label="Email Verified" value={me.is_email_verified ? "Yes" : "No"} />
        </div>
      </SectionCard>

      <SectionCard icon={Mail} title="Contact Details">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" value={me.email} />
        </div>
      </SectionCard>

      <PersonalDetailsDialog
        open={personalOpen}
        onOpenChange={setPersonalOpen}
        name={me.name}
        onSave={handleSaveName}
        saving={status === "loading"}
      />
    </div>
  );
}
