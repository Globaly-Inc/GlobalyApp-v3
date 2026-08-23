"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SchemaFieldsEditor } from "./schema-fields-editor";

/**
 * The two cards only a business category gets: the profile columns it already has for free, and the
 * custom profile fields an admin adds on top.
 */

// Informational only — not fetched from the DB. Mirrors the columns on `businesses` so admins know what
// every business category gets for free before adding schema fields.
const BUSINESS_CORE_FIELDS: { name: string; type: string }[] = [
  { name: "Contact Name", type: "text" },
  { name: "Business Name", type: "text" },
  { name: "Business Type / Company Size", type: "select" },
  { name: "Description", type: "text" },
  { name: "Legal Name / Registration Number", type: "text" },
  { name: "Registration Licenses", type: "file" },
  { name: "Country / State / City / Address", type: "location" },
  { name: "Email", type: "email" },
  { name: "Phone", type: "phone" },
  { name: "Website", type: "url" },
  { name: "LinkedIn / Facebook / Instagram / Twitter / YouTube", type: "url" },
  { name: "Logo / Cover Image", type: "image" },
];

export function BusinessCategoryCards({ categoryId }: Readonly<{ categoryId: number | null }>) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Business Core Fields (Built-in)</CardTitle>
          <p className="text-sm text-muted-foreground">
            These fields are already part of every business profile and cannot be modified here.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {BUSINESS_CORE_FIELDS.map((field) => (
              <div key={field.name} className="flex items-center gap-2 py-1">
                <Badge variant="outline" className="shrink-0 font-mono text-xs">
                  {field.type}
                </Badge>
                <span className="text-sm text-muted-foreground">{field.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schema Fields</CardTitle>
          <p className="text-sm text-muted-foreground">
            Define custom fields that businesses of this type will fill in on their profile.
          </p>
        </CardHeader>
        <CardContent>
          <SchemaFieldsEditor kind="business" categoryId={categoryId} />
        </CardContent>
      </Card>
    </>
  );
}
