"use client";

import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { STORAGE_KEYS } from "@/lib/site";

/**
 * The cookie banner, shown on a visitor's first landing and again once their
 * choice is a year old.
 *
 * What it guards today is nothing: the site sets no cookies and loads no
 * analytics or advertising scripts (see /cookies). It records a choice so that
 * the day something non-essential is added, it has a consent to check first:
 * gate it on hasAnalyticsConsent(), never on the banner having closed.
 *
 * The two answers carry equal weight on purpose. Regulators treat a bright
 * "Accept" beside a faint "Reject" as steering, not consent.
 */

const CONSENT_KEY = STORAGE_KEYS.cookieConsent;
const OPEN_EVENT = "globalyai:cookie-preferences";
/** Consent is asked for again after twelve months. */
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
/** Lets the page settle before the banner arrives over it. */
const SHOW_DELAY_MS = 600;

type Choice = "all" | "essential";
type StoredConsent = Readonly<{ choice: Choice; at: string }>;

function readConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { choice, at } = parsed as Record<string, unknown>;
    if ((choice !== "all" && choice !== "essential") || typeof at !== "string") return null;
    const age = Date.now() - Date.parse(at);
    if (!Number.isFinite(age) || age > MAX_AGE_MS) return null;
    return { choice, at };
  } catch {
    // Blocked storage or a corrupt value: treat it as no choice made.
    return null;
  }
}

/** True only when the visitor chose "Accept all" within the last year. */
export function hasAnalyticsConsent(): boolean {
  return readConsent()?.choice === "all";
}

/** Reopens the banner, for the "Cookie preferences" control in the footer. */
export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    // Read after mount: the server cannot know, and rendering it there would
    // flash the banner at everyone who has already answered.
    const timer = readConsent() ? undefined : window.setTimeout(reopen, SHOW_DELAY_MS);
    return () => {
      window.removeEventListener(OPEN_EVENT, reopen);
      window.clearTimeout(timer);
    };
  }, []);

  const choose = (choice: Choice) => {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
    } catch {
      // Private browsing: the choice holds for this visit only.
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <section
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-5 sm:pb-5"
    >
      {/* Solid --card, not the glass fill: the banner sits over moving copy, and
          in dark mode the frosted panel let it read through the text. */}
      <div className="v6-glass !bg-[var(--card)] mx-auto flex max-w-[1300px] animate-fade-up flex-col gap-4 p-5 shadow-[0_24px_60px_-24px_rgb(2_14_40/0.45)] sm:p-6 md:flex-row md:items-center md:gap-8">
        <div className="flex min-w-0 flex-1 gap-4">
          <span className="v6-icon-well hidden h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-chip)] sm:flex">
            <Cookie className="h-[18px] w-[18px] text-[var(--primary-bright)]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="cookie-consent-title" className="text-[16px] leading-snug">
              Your privacy, your choice
            </h2>
            <p className="mt-1.5 text-pretty text-[14px] leading-[1.6] text-[var(--body)]">
              We use only what the site needs to work, like remembering light or dark mode. With your
              permission we may also measure how the site is used, to improve it. Read our{" "}
              <a href="/cookies" className="font-semibold text-[var(--primary-bright)] underline-offset-2 hover:underline">
                Cookie Policy
              </a>
              .
            </p>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2.5 md:flex">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="h-11 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-[14px] font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--primary-bright)]"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="v6-gradient h-11 rounded-full px-5 text-[14px] font-semibold text-white"
          >
            Accept all
          </button>
        </div>
      </div>
    </section>
  );
}
