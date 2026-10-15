"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/http";
import { useServiceEditor } from "./service-editor-context";

/** A saved business service's Publish switch, plus Preview when the host can render one (a business
 *  service has no public page — superadmin supplies an in-page preview, the portal doesn't). */
export function ServiceHeaderActions({
  serviceId, isPublished, onPublishedChange,
}: Readonly<{ serviceId: string; isPublished: boolean; onPublishedChange: (next: boolean) => void }>) {
  const { api, readOnly, renderPreview } = useServiceEditor();
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const toggle = async (next: boolean) => {
    setPublishing(true);
    try {
      await api.updateService(serviceId, { is_published: next });
      onPublishedChange(next);
      toast.success(next ? "Service published" : "Service unpublished");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as ApiError).message });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      {renderPreview && (
        <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
          <Eye className="mr-1 h-4 w-4" /> Preview
        </Button>
      )}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Label key={String(isPublished)} className="animate-pop-in text-sm text-muted-foreground">{isPublished ? "Published" : "Draft"}</Label>
          <Switch checked={isPublished} disabled={publishing} onCheckedChange={toggle} />
        </div>
      )}
      {renderPreview && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
            <DialogTitle className="sr-only">Service preview</DialogTitle>
            {previewOpen && renderPreview(serviceId)}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
