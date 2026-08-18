"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { fieldErrorsFrom } from "@/lib/api/http";
import { waitlistApi } from "../apis";
import { REGISTRANT_TYPE_OPTIONS, WAITLIST_FIELD_LIMITS } from "../const";
import { failureState, isRegistrantType, validateSignup, type WaitlistFormState } from "../utils";

/**
 * No Redux slice for this one. §1.4's store/ slot exists for state a feature shares
 * across components or route changes; a single anonymous POST has none — the whole
 * lifecycle is one form's local state, and a global slice would only add a place for
 * a stale "done" to survive a navigation.
 */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [state, setState] = useState<WaitlistFormState>("idle");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validateSignup({ email, name, type });
    setErrors(found);
    if (Object.keys(found).length > 0 || !isRegistrantType(type)) return;

    setState("submitting");
    setMessage("");
    try {
      const result = await waitlistApi.signup({ email: email.trim(), name: name.trim(), type });
      setAlreadyRegistered(result.already_registered);
      setState("done");
    } catch (error: unknown) {
      const next = failureState(error);
      setState(next);
      // A throttle is not the visitor's fault and needs no field errors.
      if (next === "error") {
        setErrors(fieldErrorsFrom(error));
        setMessage(error instanceof Error ? error.message : "Please try again.");
      }
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-primary" />
        <p className="text-lg font-semibold text-foreground">
          {alreadyRegistered ? "You are already on the list." : "You are on the list."}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {alreadyRegistered
            ? "We already have this address — you will hear from us at launch."
            : "Check your inbox for a confirmation, and we will email you at launch."}
        </p>
      </div>
    );
  }

  const submitting = state === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="waitlist-name">Your name</Label>
        <Input
          id="waitlist-name"
          value={name}
          maxLength={WAITLIST_FIELD_LIMITS.nameMax}
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setName(e.target.value)}
        />
        <FieldError message={errors.name} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="waitlist-email">Email address</Label>
        <Input
          id="waitlist-email"
          type="email"
          value={email}
          maxLength={WAITLIST_FIELD_LIMITS.emailMax}
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FieldError message={errors.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="waitlist-type">I am a…</Label>
        <Combobox
          id="waitlist-type"
          options={REGISTRANT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={type}
          onChange={setType}
          placeholder="Choose one"
          aria-invalid={Boolean(errors.type)}
        />
        <FieldError message={errors.type} />
      </div>

      {state === "throttled" && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-foreground">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            Too many sign-ups from here just now. Nothing is wrong with your details — please try
            again shortly.
          </span>
        </p>
      )}

      {state === "error" && message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitting ? "Joining…" : "Join the waitlist"}
      </Button>

      <p className="text-xs text-muted-foreground">
        We will only email you about the launch.
      </p>
    </form>
  );
}
