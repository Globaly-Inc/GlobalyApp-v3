"use client";

import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EVENT_CATEGORY_OPTIONS,
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  EVENT_VISIBILITY_OPTIONS,
} from "../const";
import type { EventForm } from "../utils/event-form";

type Errors = Partial<Record<keyof EventForm, string>>;

/** Label + control + error, in a flex column — never `space-y-*`, which breaks Combobox popovers. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: Readonly<{ id: string; label: string; hint?: string; error?: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

/**
 * Every field of the event form. Purely presentational — the dialog owns the state.
 *
 * Targeting (target_audiences / target_countries) is deliberately not exposed: the API
 * accepts both as free-text arrays with no taxonomy behind them yet, so there is nothing
 * meaningful to pick from. Visibility still switches between public and targeted.
 */
export function EventFormFields({
  form,
  errors,
  onChange,
}: Readonly<{
  form: EventForm;
  errors: Errors;
  onChange: <K extends keyof EventForm>(key: K, value: string) => void;
}>) {
  const isOnline = form.event_type === "online";
  const isInPerson = form.event_type !== "online";

  return (
    <div className="flex flex-col gap-5">
      <Field id="event-title" label="Title" error={errors.title}>
        <Input
          id="event-title"
          value={form.title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="Spring open day"
          aria-invalid={!!errors.title}
        />
      </Field>

      <Field id="event-summary" label="Summary" hint="One line shown on event cards.">
        <Input
          id="event-summary"
          value={form.summary}
          onChange={(e) => onChange("summary", e.target.value)}
          placeholder="Meet our admissions team"
        />
      </Field>

      <Field id="event-description" label="Description">
        <Textarea
          id="event-description"
          rows={5}
          value={form.description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="What attendees can expect."
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="event-type" label="Format">
          <Combobox
            id="event-type"
            options={EVENT_TYPE_OPTIONS}
            value={form.event_type}
            onChange={(v) => onChange("event_type", v)}
          />
        </Field>
        <Field id="event-category" label="Category">
          <Combobox
            id="event-category"
            options={EVENT_CATEGORY_OPTIONS}
            value={form.category}
            onChange={(v) => onChange("category", v)}
            placeholder="No category"
          />
        </Field>
        <Field id="event-status" label="State">
          <Combobox
            id="event-status"
            options={EVENT_STATUS_OPTIONS}
            value={form.status}
            onChange={(v) => onChange("status", v)}
          />
        </Field>
        <Field id="event-visibility" label="Visibility">
          <Combobox
            id="event-visibility"
            options={EVENT_VISIBILITY_OPTIONS}
            value={form.visibility}
            onChange={(v) => onChange("visibility", v)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="event-starts" label="Starts" error={errors.starts_at}>
          <Input
            id="event-starts"
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => onChange("starts_at", e.target.value)}
            aria-invalid={!!errors.starts_at}
          />
        </Field>
        <Field id="event-ends" label="Ends" error={errors.ends_at}>
          <Input
            id="event-ends"
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => onChange("ends_at", e.target.value)}
            aria-invalid={!!errors.ends_at}
          />
        </Field>
        <Field id="event-deadline" label="Registration deadline" hint="Optional.">
          <Input
            id="event-deadline"
            type="datetime-local"
            value={form.registration_deadline}
            onChange={(e) => onChange("registration_deadline", e.target.value)}
          />
        </Field>
        <Field
          id="event-capacity"
          label="Total capacity"
          hint="Leave blank for unlimited."
          error={errors.max_capacity}
        >
          <Input
            id="event-capacity"
            type="number"
            min={1}
            value={form.max_capacity}
            onChange={(e) => onChange("max_capacity", e.target.value)}
            aria-invalid={!!errors.max_capacity}
          />
        </Field>
      </div>

      {isInPerson && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="event-venue-name" label="Venue name">
            <Input
              id="event-venue-name"
              value={form.venue_name}
              onChange={(e) => onChange("venue_name", e.target.value)}
            />
          </Field>
          <Field id="event-venue-address" label="Venue address">
            <Input
              id="event-venue-address"
              value={form.venue_address}
              onChange={(e) => onChange("venue_address", e.target.value)}
            />
          </Field>
          <Field id="event-venue-city" label="City">
            <Input
              id="event-venue-city"
              value={form.venue_city}
              onChange={(e) => onChange("venue_city", e.target.value)}
            />
          </Field>
          <Field id="event-venue-country" label="Country">
            <Input
              id="event-venue-country"
              value={form.venue_country}
              onChange={(e) => onChange("venue_country", e.target.value)}
            />
          </Field>
        </div>
      )}

      {(isOnline || form.event_type === "hybrid") && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="event-online-url" label="Joining link" error={errors.online_url}>
            <Input
              id="event-online-url"
              value={form.online_url}
              onChange={(e) => onChange("online_url", e.target.value)}
              placeholder="https://..."
              aria-invalid={!!errors.online_url}
            />
          </Field>
          <Field id="event-online-platform" label="Platform">
            <Input
              id="event-online-platform"
              value={form.online_platform}
              onChange={(e) => onChange("online_platform", e.target.value)}
              placeholder="Zoom"
            />
          </Field>
        </div>
      )}

      <Field id="event-cover" label="Cover image URL" error={errors.cover_image_url}>
        <Input
          id="event-cover"
          value={form.cover_image_url}
          onChange={(e) => onChange("cover_image_url", e.target.value)}
          placeholder="https://..."
          aria-invalid={!!errors.cover_image_url}
        />
      </Field>

      <Field id="event-tags" label="Tags" hint="Comma separated.">
        <Input
          id="event-tags"
          value={form.tags}
          onChange={(e) => onChange("tags", e.target.value)}
          placeholder="admissions, scholarships"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="event-contact-email" label="Contact email" error={errors.contact_email}>
          <Input
            id="event-contact-email"
            value={form.contact_email}
            onChange={(e) => onChange("contact_email", e.target.value)}
            aria-invalid={!!errors.contact_email}
          />
        </Field>
        <Field id="event-contact-phone" label="Contact phone">
          <Input
            id="event-contact-phone"
            value={form.contact_phone}
            onChange={(e) => onChange("contact_phone", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
