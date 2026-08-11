"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { User, Mail, Camera, Lock, ImageIcon, Move, ZoomIn, ZoomOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ImageCropper } from "@/components/image-cropper";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { SectionCard, Field } from "@/app/personal/profile/section-card";
import { updateMe } from "../../store/admin-slice";
import { ROLE_DISPLAY } from "../../consts";
import { PersonalDetailsDialog } from "./personal-details-dialog";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateImageFile(file: File, allowed: string[]) {
  if (!allowed.includes(file.type)) {
    toast.error("Invalid file type");
    return false;
  }
  if (file.size > MAX_FILE_BYTES) {
    toast.error("File too large (max 5MB)");
    return false;
  }
  return true;
}

export function MyProfileView() {
  const dispatch = useAppDispatch();
  const { me, status } = useAppSelector((state) => state.admin);

  const [personalOpen, setPersonalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  // ponytail: no admin avatar/cover upload endpoint exists yet (platform-users/businesses/agents
  // have one, admin-users doesn't) — these previews are local-only and don't survive a reload.
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverPosition, setCoverPosition] = useState({ x: 0, y: 0, zoom: 1 });
  const [coverAdjustMode, setCoverAdjustMode] = useState(false);
  const [coverDraft, setCoverDraft] = useState({ x: 0, y: 0, zoom: 1 });
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null);
  const coverDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  if (!me) return null;

  const initial = me.name?.[0]?.toUpperCase() ?? "";

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImageFile(file, ALLOWED_TYPES)) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleAvatarCropComplete = (blob: Blob) => {
    setAvatarPreviewUrl(URL.createObjectURL(blob));
    setCropOpen(false);
    setCropImageSrc(null);
    toast.success("Avatar updated!");
  };

  const handleCoverFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateImageFile(file, [...ALLOWED_TYPES, "image/svg+xml"])) return;
    setPendingCoverUrl(URL.createObjectURL(file));
    setCoverDraft({ x: 0, y: 0, zoom: 1 });
    setCoverAdjustMode(true);
    e.target.value = "";
  };

  const handleAdjustCover = () => {
    setCoverDraft(coverPosition);
    setPendingCoverUrl(null);
    setCoverAdjustMode(true);
  };

  const handleCoverAdjustCancel = () => {
    setCoverAdjustMode(false);
    if (pendingCoverUrl) URL.revokeObjectURL(pendingCoverUrl);
    setPendingCoverUrl(null);
  };

  const handleCoverAdjustSave = () => {
    if (pendingCoverUrl) setCoverUrl(pendingCoverUrl);
    setCoverPosition(coverDraft);
    setCoverAdjustMode(false);
    setPendingCoverUrl(null);
    toast.success("Cover image updated!");
  };

  const onCoverPointerDown = (e: React.PointerEvent) => {
    if (!coverAdjustMode) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    coverDragRef.current = { startX: e.clientX, startY: e.clientY, origX: coverDraft.x, origY: coverDraft.y };
  };
  const onCoverPointerMove = (e: React.PointerEvent) => {
    if (!coverDragRef.current) return;
    const dx = (e.clientX - coverDragRef.current.startX) / coverDraft.zoom;
    const dy = (e.clientY - coverDragRef.current.startY) / coverDraft.zoom;
    setCoverDraft((d) => ({ ...d, x: coverDragRef.current!.origX + dx, y: coverDragRef.current!.origY + dy }));
  };
  const onCoverPointerUp = () => {
    coverDragRef.current = null;
  };

  const handleSaveName = async (name: string) => {
    const result = await dispatch(updateMe({ id: me.id, patch: { name } }));
    if (updateMe.rejected.match(result)) {
      toast.error("Couldn't save", { description: result.error.message ?? "Please try again." });
      return false;
    }
    return true;
  };

  const activeCoverSrc = pendingCoverUrl || coverUrl;
  const activeCoverPosition = coverAdjustMode ? coverDraft : coverPosition;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="overflow-hidden">
        <div
          className="relative h-40 select-none overflow-hidden sm:h-48"
          style={{ cursor: coverAdjustMode ? "grab" : undefined }}
          onPointerDown={onCoverPointerDown}
          onPointerMove={onCoverPointerMove}
          onPointerUp={onCoverPointerUp}
          onPointerLeave={onCoverPointerUp}
        >
          {activeCoverSrc ? (
            <img
              src={activeCoverSrc}
              alt="Cover"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{
                transformOrigin: "center",
                transform: `scale(${activeCoverPosition.zoom}) translate(${activeCoverPosition.x}px, ${activeCoverPosition.y}px)`,
              }}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/60" />
          )}

          {!coverAdjustMode && (
            <DropdownMenu>
              <DropdownMenuTrigger className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-md bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60">
                <Camera className="h-3.5 w-3.5" /> Edit cover
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {coverUrl && (
                  <DropdownMenuItem onClick={handleAdjustCover}>
                    <Move className="h-4 w-4" /> Adjust image
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => coverInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" /> Change image
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {coverAdjustMode && (
            <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 bg-black/60 px-4 py-2 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded p-1 text-white transition-colors hover:bg-white/20 cursor-pointer"
                  onClick={() => setCoverDraft((d) => ({ ...d, zoom: Math.max(1, +(d.zoom - 0.1).toFixed(2)) }))}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[3ch] text-center text-xs text-white">{Math.round(coverDraft.zoom * 100)}%</span>
                <button
                  type="button"
                  className="rounded p-1 text-white transition-colors hover:bg-white/20 cursor-pointer"
                  onClick={() => setCoverDraft((d) => ({ ...d, zoom: Math.min(2, +(d.zoom + 0.1).toFixed(2)) }))}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-white hover:bg-white/20" onClick={handleCoverAdjustCancel}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleCoverAdjustSave}>
                  Save
                </Button>
              </div>
            </div>
          )}

          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleCoverFileSelect}
          />
        </div>

        <CardContent className="pt-16">
          <button
            type="button"
            className="group relative -mt-24 mb-3 block size-24 rounded-full cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Avatar className="size-24 border-4 border-background">
              {(avatarPreviewUrl ?? me.photo_url) && <AvatarImage src={avatarPreviewUrl ?? me.photo_url ?? undefined} alt={me.name} />}
              <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarFileSelect} />

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

      {cropImageSrc && (
        <ImageCropper
          open={cropOpen}
          onOpenChange={setCropOpen}
          imageSrc={cropImageSrc}
          onCropComplete={handleAvatarCropComplete}
          cropShape="circle"
        />
      )}

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
