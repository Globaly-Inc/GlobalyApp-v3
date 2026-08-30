"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { User, Mail, Lock, Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CoverLogoEditor } from "@/components/cover-logo-editor";
import { CroppedFileInput, type CroppedFileInputHandle } from "@/components/cropped-file-input";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { SectionCard, Field } from "@/app/personal/profile/section-card";
import { adminApi } from "../../apis";
import { fetchMe, updateMe } from "../../store/admin-slice";
import { ROLE_DISPLAY } from "../../consts";
import { PersonalDetailsDialog } from "./personal-details-dialog";

export function MyProfileView() {
  const dispatch = useAppDispatch();
  const { me, status } = useAppSelector((state) => state.admin);
  const photoPickerRef = useRef<CroppedFileInputHandle>(null);

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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        <CoverLogoEditor
          coverUrl={me.cover_url}
          onCoverFile={(file) => handleImageFile("cover", file)}
          coverUploading={imageUploading === "cover"}
          logoUrl={me.photo_url}
          logoFallback={initial}
          onLogoFile={(file) => handleImageFile("profile", file)}
          logoUploading={imageUploading === "profile"}
          hideLogo
        />
        <CardContent>
          <div className="flex items-start gap-4 -mt-14">
            <div className="relative h-28 w-28 shrink-0 left-10">
              <button
                type="button"
                className="group size-28 cursor-pointer"
                onClick={() => photoPickerRef.current?.pick()}
                aria-label="Edit photo"
              >
                <Avatar className="size-28 rounded-xl border-4 border-background bg-white shadow-lg">
                  {me.photo_url && <AvatarImage src={me.photo_url} alt="" className="rounded-lg object-cover" />}
                  <AvatarFallback className="rounded-lg text-2xl">{initial}</AvatarFallback>
                </Avatar>
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                  {imageUploading === "profile" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </span>
              </button>
              <CroppedFileInput
                ref={photoPickerRef}
                cropShape="square"
                onCropped={(file) => handleImageFile("profile", file)}
                isSaving={imageUploading === "profile"}
              />
            </div>
            <div className="pt-4 sm:pt-14 ml-10 m-4">
              <h1 className="text-xl font-bold text-foreground">{me.name}</h1>
              <p className="text-sm text-muted-foreground">{me.email}</p>
            </div>
          </div>
        </CardContent>
      </div>

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
