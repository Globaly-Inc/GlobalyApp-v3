"use client";

import { useEffect, useState } from "react";
import { personalApi } from "../apis";
import type { PlatformTest } from "@/lib/tests-catalog";

// ponytail: one module-level promise, so the two test dialogs and the record list share a single
// request for a catalogue that changes about never. It is deliberately not a Redux slice — nothing
// mutates it from the portal. Drop the cache (or move it into a slice) if tests ever become editable here.
let pending: Promise<PlatformTest[]> | null = null;

/** The platform test catalogue, optionally narrowed to one category. */
export function useTests(category?: PlatformTest["category"]): PlatformTest[] {
  const [tests, setTests] = useState<PlatformTest[]>([]);

  useEffect(() => {
    let active = true;
    pending ??= personalApi.getTests();
    // A failed catalogue costs a logo and a dropdown's options, never the profile page.
    pending.then((rows) => active && setTests(rows)).catch(() => { pending = null; });
    return () => { active = false; };
  }, []);

  return category ? tests.filter((test) => test.category === category) : tests;
}
