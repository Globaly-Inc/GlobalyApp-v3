"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountryPanelProps } from "../types";

export function CountrySeoPanel({ country, onChange }: CountryPanelProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="seo-meta-title">Meta title</Label>
            <span className="text-xs text-muted-foreground">{(country.meta_title ?? "").length}/60</span>
          </div>
          <Input className="h-10" id="seo-meta-title" value={country.meta_title ?? ""} onChange={(e) => onChange({ meta_title: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="seo-meta-description">Meta description</Label>
            <span className="text-xs text-muted-foreground">{(country.meta_description ?? "").length}/160</span>
          </div>
          <Textarea
            id="seo-meta-description"
            className="min-h-20"
            rows={3}
            value={country.meta_description ?? ""}
            onChange={(e) => onChange({ meta_description: e.target.value || null })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
