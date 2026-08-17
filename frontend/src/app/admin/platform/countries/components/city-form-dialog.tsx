"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { ImageDropzone } from "@/components/image-dropzone";
import { FieldError } from "@/components/field-error";
import { generateSlug } from "../utils";
import type { City, CityInput } from "../apis/types";

const STATUS_OPTIONS: ComboboxOption[] = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending review" },
  { value: "rejected", label: "Rejected" },
];

const empty = (): CityInput => ({
  name: "", slug: "", state_name: null, hero_image_url: null, thumbnail_image_url: null, about: null,
  population_label: null, area_label: null, weather_label: null, timezone: null, highlights: [],
  is_featured: false, sort_order: 0, status: "active", meta_title: null, meta_description: null,
});

const REQUIRED_TEXT_FIELDS: { key: keyof CityInput; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "slug", label: "Slug" },
  { key: "state_name", label: "State/Region" },
  { key: "timezone", label: "Timezone" },
  { key: "population_label", label: "Population label" },
  { key: "area_label", label: "Area label" },
  { key: "weather_label", label: "Weather label" },
  { key: "about", label: "About" },
  { key: "hero_image_url", label: "Hero image" },
  { key: "thumbnail_image_url", label: "Thumbnail image" },
  { key: "meta_title", label: "Meta title" },
  { key: "meta_description", label: "Meta description" },
];

function validateCity(city: CityInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { key, label } of REQUIRED_TEXT_FIELDS) {
    const value = city[key];
    if (typeof value !== "string" || !value.trim()) errors[key] = `${label} is required`;
  }
  if (city.highlights.length === 0) errors.highlights = "At least one highlight is required";
  return errors;
}

function CityFormBody({
  initial,
  onSave,
  onClose,
}: Readonly<{ initial: City | null; onSave: (input: CityInput, pendingFiles: Map<string, File>) => Promise<void>; onClose: () => void }>) {
  const [city, setCity] = useState<CityInput>(() => initial ?? empty());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const registerPendingFile = (file: File, previewUrl: string) => {
    pendingFilesRef.current.set(previewUrl, file);
  };

  const update = (updates: Partial<CityInput>) => setCity((c) => ({ ...c, ...updates }));

  const handleSave = async () => {
    const nextErrors = validateCity(city);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave(city, pendingFilesRef.current);
      onClose();
    } catch (err) {
      toast.error("Couldn't save city", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{initial ? "Edit city" : "Add city"}</DialogTitle>
      </DialogHeader>

      <div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="city-name">Name *</Label>
          <Input
            className="h-10"
            id="city-name"
            value={city.name}
            onChange={(e) => update({ name: e.target.value, ...(initial ? {} : { slug: generateSlug(e.target.value) }) })}
            aria-invalid={!!errors.name}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city-slug">Slug *</Label>
          <Input className="h-10" id="city-slug" value={city.slug} onChange={(e) => update({ slug: e.target.value })} aria-invalid={!!errors.slug} />
          <FieldError message={errors.slug} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city-state">State/Region *</Label>
          <Input
            className="h-10"
            id="city-state"
            value={city.state_name ?? ""}
            onChange={(e) => update({ state_name: e.target.value || null })}
            aria-invalid={!!errors.state_name}
          />
          <FieldError message={errors.state_name} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city-timezone">Timezone *</Label>
          <Input
            className="h-10"
            id="city-timezone"
            value={city.timezone ?? ""}
            onChange={(e) => update({ timezone: e.target.value || null })}
            aria-invalid={!!errors.timezone}
          />
          <FieldError message={errors.timezone} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city-population">Population label *</Label>
          <Input
            className="h-10"
            id="city-population"
            value={city.population_label ?? ""}
            onChange={(e) => update({ population_label: e.target.value || null })}
            aria-invalid={!!errors.population_label}
          />
          <FieldError message={errors.population_label} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city-area">Area label *</Label>
          <Input
            className="h-10"
            id="city-area"
            value={city.area_label ?? ""}
            onChange={(e) => update({ area_label: e.target.value || null })}
            aria-invalid={!!errors.area_label}
          />
          <FieldError message={errors.area_label} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="city-weather">Weather label *</Label>
          <Input
            className="h-10"
            id="city-weather"
            value={city.weather_label ?? ""}
            onChange={(e) => update({ weather_label: e.target.value || null })}
            aria-invalid={!!errors.weather_label}
          />
          <FieldError message={errors.weather_label} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="city-highlights">Highlights (comma-separated) *</Label>
          <Input
            className="h-10"
            id="city-highlights"
            value={city.highlights.join(", ")}
            onChange={(e) => update({ highlights: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            aria-invalid={!!errors.highlights}
          />
          <FieldError message={errors.highlights} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="city-about">About *</Label>
          <Textarea
            className="min-h-20"
            id="city-about"
            rows={3}
            value={city.about ?? ""}
            onChange={(e) => update({ about: e.target.value || null })}
            aria-invalid={!!errors.about}
          />
          <FieldError message={errors.about} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Hero image *</Label>
          <ImageDropzone value={city.hero_image_url} onChange={(url) => update({ hero_image_url: url })} onDeferredPick={registerPendingFile} />
          <FieldError message={errors.hero_image_url} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Thumbnail image *</Label>
          <ImageDropzone value={city.thumbnail_image_url} onChange={(url) => update({ thumbnail_image_url: url })} onDeferredPick={registerPendingFile} />
          <FieldError message={errors.thumbnail_image_url} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city-meta-title">Meta title *</Label>
          <Input
            className="h-10"
            id="city-meta-title"
            value={city.meta_title ?? ""}
            onChange={(e) => update({ meta_title: e.target.value || null })}
            aria-invalid={!!errors.meta_title}
          />
          <FieldError message={errors.meta_title} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city-sort-order">Sort order</Label>
          <Input
            className="h-10"
            id="city-sort-order"
            type="number"
            value={city.sort_order}
            onChange={(e) => update({ sort_order: Number(e.target.value) || 0 })}
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="city-meta-description">Meta description *</Label>
          <Textarea
            className="min-h-20"
            id="city-meta-description"
            rows={3}
            value={city.meta_description ?? ""}
            onChange={(e) => update({ meta_description: e.target.value || null })}
            aria-invalid={!!errors.meta_description}
          />
          <FieldError message={errors.meta_description} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Status</Label>
          <Combobox
            value={city.status}
            onChange={(v) => update({ status: v as CityInput["status"] })}
            options={STATUS_OPTIONS}
            className="h-10"
          />
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch checked={city.is_featured} onCheckedChange={(v) => update({ is_featured: v })} />
          <Label>Featured</Label>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {!saving && (initial ? "Save changes" : "Add city")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function CityFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: City | null;
  onSave: (input: CityInput, pendingFiles: Map<string, File>) => Promise<void>;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {open && <CityFormBody key={initial?.id ?? "new"} initial={initial} onSave={onSave} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
