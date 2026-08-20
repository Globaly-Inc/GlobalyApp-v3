"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { REGISTRANT_TYPES, type RegistrantType } from "../const";
import { registerForLaunch, resetComingSoonError } from "../store/coming-soon-slice";
import styles from "./coming-soon.module.css";

// Deliberately not a full RFC 5322 regex — just enough to catch obvious
// typos before a round trip. The backend's Zod z.string().email() is the
// source of truth for what's actually valid.
function looksLikeEmail(value: string): boolean {
  const at = value.indexOf("@");
  if (at < 1 || value.includes(" ")) return false;
  const domain = value.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

export function ComingSoonForm() {
  const dispatch = useAppDispatch();
  const { status, error, fieldErrors } = useAppSelector((state) => state.comingSoon);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<RegistrantType | "">("");
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const toastedRef = useRef(false);

  useEffect(() => {
    if (status !== "done" || toastedRef.current) return;
    toastedRef.current = true;
    toast.success("You're on the list.", {
      description: "Check your inbox for a confirmation email.",
    });
  }, [status]);

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Enter your name.";
    if (!email.trim()) errors.email = "Enter your email.";
    else if (!looksLikeEmail(email.trim())) errors.email = "Enter a valid email address.";
    if (!type) errors.type = "Select who you are.";
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch(resetComingSoonError());
    const errors = validate();
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;
    dispatch(registerForLaunch({ name: name.trim(), email: email.trim(), type }));
  }

  // A client-side error blocks the request before it's sent; a backend field
  // error only appears once that request actually comes back rejected.
  const fieldError = (key: string) => clientErrors[key] || fieldErrors[key];

  if (status === "done") {
    return (
      <div className={styles["cs-success"]}>
        <span className={styles["cs-check"]} aria-hidden="true"><Check size={22} strokeWidth={2.5} /></span>
        <h2 className={styles["cs-success-title"]}>You&apos;re on the list.</h2>
        <p className={styles["cs-success-body"]}>
          Check your inbox for a confirmation. We&apos;ll email you the moment we go live.
        </p>
      </div>
    );
  }

  return (
    <form className={styles["cs-form"]} onSubmit={handleSubmit} noValidate>
      <h2 className={styles["cs-form-title"]}>Register your interest</h2>

      <div className={styles["cs-field"]}>
        <Label htmlFor="cs-name">Name</Label>
        <Input id="cs-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your full name" autoComplete="name" aria-invalid={!!fieldError("name")} required />
        <FieldError message={fieldError("name")} />
      </div>
      <div className={styles["cs-field"]}>
        <Label htmlFor="cs-email">Email</Label>
        <Input id="cs-email" type="email" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="email" inputMode="email" aria-invalid={!!fieldError("email")} required />
        <FieldError message={fieldError("email")} />
      </div>
      <div className={styles["cs-field"]}>
        <Label htmlFor="cs-type">I am a…</Label>
        <Combobox
          id="cs-type"
          options={[...REGISTRANT_TYPES]}
          value={type}
          onChange={(v) => setType(v as RegistrantType)}
          placeholder="Select one"
          className={styles["cs-combobox-trigger"]}
          contentClassName={styles["cs-combobox-content"]}
        />
        <FieldError message={fieldError("type")} />
      </div>

      {error && <p className={styles["cs-error"]} role="alert">{error}</p>}

      <Button type="submit" className={styles["cs-submit"]} disabled={status === "submitting"}>
        {status === "submitting"
          ? <><Loader2 className={styles["cs-spin"]} size={18} /> Registering…</>
          : <>Notify me at launch <ArrowRight size={18} /></>}
      </Button>
      <p className={styles["cs-fineprint"]}>We&apos;ll only email you about the launch. No spam.</p>
    </form>
  );
}
