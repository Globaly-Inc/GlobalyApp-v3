"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "../../../components/confirm-delete-dialog";
import { countriesApi } from "../apis";
import type { City, CityInput } from "../apis/types";
import { CityFormDialog } from "./city-form-dialog";

export function CountryCitiesTab({ countryId }: Readonly<{ countryId: number }>) {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<City | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<City | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    countriesApi.getCitiesByCountry(countryId).then(setCities).finally(() => setLoading(false));
  }, [countryId]);

  const handleSave = async (input: CityInput, pendingFiles: Map<string, File>) => {
    const saved = editing
      ? await countriesApi.updateCity(editing.id, input, pendingFiles)
      : await countriesApi.createCity(countryId, input, pendingFiles);
    setCities((prev) => (editing ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved]));
    toast.success(editing ? "City updated" : "City added");
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await countriesApi.deleteCity(deleting.id);
      setCities((prev) => prev.filter((c) => c.id !== deleting.id));
      toast.success("City deleted");
      setDeleting(null);
    } catch {
      toast.error("Couldn't delete city", { description: "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {cities.length} {cities.length === 1 ? "city" : "cities"}
        </p>
        <Button className="gap-1.5" onClick={() => setEditing(null)}>
          <Plus className="h-4 w-4" /> Add City
        </Button>
      </div>

      <Card>
        {cities.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No cities yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {cities.map((city) => (
              <div key={city.id} className="flex items-center gap-4 px-4 py-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  {city.thumbnail_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={city.thumbnail_image_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{city.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {city.state_name ? `${city.state_name} · ` : ""}
                    {city.status !== "active" ? city.status : city.is_featured ? "Featured" : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(city)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(city)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CityFormDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} initial={editing ?? null} onSave={handleSave} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        onConfirm={handleConfirmDelete}
        deleting={busy}
      />
    </div>
  );
}
