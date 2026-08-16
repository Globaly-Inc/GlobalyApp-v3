"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountryPanelProps } from "../types";

export function CountryVisaPanel({ country, onChange }: CountryPanelProps) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="visa-type">Visa type</Label>
          <Input className="h-10" id="visa-type" value={country.visa_type ?? ""} onChange={(e) => onChange({ visa_type: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="visa-processing-time">Processing time</Label>
          <Input
            className="h-10"
            id="visa-processing-time"
            value={country.visa_processing_time ?? ""}
            onChange={(e) => onChange({ visa_processing_time: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="visa-fee">Visa fee</Label>
          <Input className="h-10" id="visa-fee" value={country.visa_fee ?? ""} onChange={(e) => onChange({ visa_fee: e.target.value || null })} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="visa-description">Description</Label>
          <Textarea
            className="min-h-20"
            id="visa-description"
            rows={4}
            value={country.visa_description ?? ""}
            onChange={(e) => onChange({ visa_description: e.target.value || null })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
