"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image as ImageIcon, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServiceEditor } from "./service-editor-context";
import { SectionSummaryCard } from "./section-summary-card";
import { ServiceMediaUploader } from "./service-media-uploader";
import type { ServiceMediaFile } from "../../apis/types";

/** The service's photos/videos/PDFs: lists what's uploaded, pencil toggles the dropzone. Shared
 *  by the institution and business editors (and so by superadmin through the editor context). */
export function ServiceMediaCard({ serviceId, badge }: Readonly<{ serviceId: string; badge?: ReactNode }>) {
  const { api } = useServiceEditor();
  const [media, setMedia] = useState<ServiceMediaFile[]>([]);
  const [editing, setEditing] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    api.getServiceMedia(serviceId).then((res) => setMedia(res.files)).catch(() => {});
  }, [api, serviceId]);

  const handleUpload = async (file: File) => {
    const created = await api.uploadServiceMedia(serviceId, file);
    setMedia((m) => [...m, created]);
  };

  const handleDelete = async (fileId: number) => {
    await api.deleteServiceMedia(serviceId, fileId);
    setMedia((m) => m.filter((f) => f.id !== fileId));
  };

  return (
    <SectionSummaryCard
      icon={ImageIcon}
      title="Media"
      count={media.length}
      badge={badge}
      action={
        <Button
          variant={editing ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => setEditing((v) => !v)}
          aria-label="Edit media"
          aria-pressed={editing}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      }
    >
      <ServiceMediaUploader files={media} onUpload={handleUpload} onDelete={handleDelete} showDropzone={editing} />
    </SectionSummaryCard>
  );
}
