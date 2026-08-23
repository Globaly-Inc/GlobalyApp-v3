"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SchemaField } from "../apis/types";
import { SchemaFieldsEditor } from "./schema-fields-editor";
import { BookingRequirementsPreview } from "./booking-requirements-preview";

/**
 * The Other Service Category sidebar: what a customer must provide to request this service, and a live
 * preview of the form they will get.
 *
 * Only this taxonomy gets it. The Super Admin **Service** Category keeps its own schema-fields card
 * unchanged — the two are different concepts and this panel is the Other Service one.
 */
export function BookingRequirementsPanel({
  categoryId,
  categoryName,
  onFieldsChange,
}: Readonly<{
  categoryId: number | null;
  categoryName: string;
  /**
   * On the create page these rows have nowhere to be stored yet, so the editor above holds them and
   * creates them once the category exists.
   */
  onFieldsChange?: (fields: SchemaField[]) => void;
}>) {
  const [fields, setFields] = useState<SchemaField[]>([]);

  const publish = (rows: SchemaField[]) => {
    setFields(rows);
    onFieldsChange?.(rows);
  };

  return (
    <div className="sticky top-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Booking Requirements</CardTitle>
          <p className="text-sm text-muted-foreground">
            What should the customer provide when they request a service in this category? Leave this empty and
            they can request it without answering anything.
          </p>
        </CardHeader>
        <CardContent>
          <SchemaFieldsEditor kind="other-service" categoryId={categoryId} onFieldsChange={publish} />
        </CardContent>
      </Card>

      {fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Booking Form Preview</CardTitle>
            <p className="text-sm text-muted-foreground">Exactly what the customer will see.</p>
          </CardHeader>
          <CardContent>
            <BookingRequirementsPreview categoryName={categoryName} fields={fields} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
