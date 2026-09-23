"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/field-error";
import { useValidatedForm } from "@/lib/use-validated-form";
import type { EmbedContactPrompt } from "../apis";

type FormState = { name: string; email: string };

const schema: z.ZodType<FormState> = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(320),
});

type ContactCaptureCardProps = {
  prompt: EmbedContactPrompt;
  onSubmit: (name: string, email: string) => Promise<void>;
  onSkip: () => void;
};

/**
 * The inline ask for the visitor's name and email.
 *
 * A card in the message stream rather than a modal, on purpose: the widget is 380px wide and
 * lives on someone else's website, where a dialog over the conversation reads as the
 * newsletter pop-up every visitor has learned to close without reading. Sitting in the thread
 * it reads as the counsellor offering something, which is what it is.
 *
 * Nothing here blocks the chat — the composer stays live behind it, and sending another
 * message simply moves past the card.
 */
export function ContactCaptureCard({ prompt, onSubmit, onSkip }: ContactCaptureCardProps) {
  const { form, setForm, errors, validate } = useValidatedForm(schema, () => ({ name: "", email: "" }));
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [failed, setFailed] = useState<string | null>(null);

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    setStatus("saving");
    setFailed(null);
    try {
      await onSubmit(data.name, data.email);
      setStatus("done");
    } catch (e) {
      // Stays on the form with the values intact — a visitor who has just typed their email
      // should not have to type it again because the network blipped.
      setFailed((e as Error).message);
      setStatus("idle");
    }
  };

  if (status === "done") {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="mb-0.5 text-sm font-semibold">Thanks, {form.name.trim()}!</p>
        <p className="text-xs text-muted-foreground">
          We&apos;ve saved your details. We&apos;ll send a summary of this conversation to{" "}
          <span className="font-medium text-foreground">{form.email.trim()}</span> once you&apos;re done here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="mb-0.5 text-sm font-semibold">{prompt.heading}</p>
      <p className="mb-3 text-xs text-muted-foreground">{prompt.body}</p>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Input
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            aria-invalid={!!errors.name}
            aria-label="Your name"
            disabled={status === "saving"}
            className="h-8 text-xs"
          />
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-1">
          <Input
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            aria-invalid={!!errors.email}
            aria-label="Email address"
            disabled={status === "saving"}
            className="h-8 text-xs"
          />
          <FieldError message={errors.email} />
        </div>

        {failed && <p className="text-xs text-destructive">{failed}</p>}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={status === "saving"}>
            {status === "saving" ? "Sending…" : "Email me a summary"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onSkip} disabled={status === "saving"}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
