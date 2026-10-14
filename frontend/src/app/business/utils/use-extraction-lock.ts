"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchExtractionStatus, isExtractionRunning } from "../store/business-onboarding-slice";
import { EXTRACTION_MAX_POLLS, EXTRACTION_POLL_INTERVAL_MS } from "../portal/const";

/** Pages that stay open while the extraction runs: live progress, and adding another business. */
const OPEN_WHILE_EXTRACTING = ["/business/portal", "/business/onboarding"];
const SLOW_POLL_INTERVAL_MS = 60_000;

/**
 * Polls the business's extraction while it runs and says whether `pathname` is locked behind it —
 * the profile, services and settings those pages show are still being written.
 * A crawl can run for hours, so polling never stops — it just backs off to once a minute after
 * EXTRACTION_MAX_POLLS fast checks (~10 min).
 */
export function useExtractionLock(pathname: string | null) {
  const dispatch = useAppDispatch();
  const { profile, extractionStatus } = useAppSelector((state) => state.businessOnboarding);
  const extracting = isExtractionRunning(profile, extractionStatus);
  // Per org, not per job: two branches share one head office's extraction, and each still needs its own first check.
  const job = profile?.source_job_id ?? profile?.extraction_parent_name ?? null;
  const jobKey = job && profile ? `${profile.schema_name}:${job}` : null;

  const pollsRef = useRef(0);
  // The job whose first status call is out — Strict Mode re-runs the effect before it answers.
  const requestedRef = useRef<string | null>(null);
  // A failed poll leaves extractionStatus as it was, so nothing else would re-run the effect.
  const [failedPolls, setFailedPolls] = useState(0);
  useEffect(() => {
    if (!jobKey || !extracting) return undefined;
    if (extractionStatus === undefined) {
      if (requestedRef.current === jobKey) return undefined;
      requestedRef.current = jobKey;
      pollsRef.current = 0;
      dispatch(fetchExtractionStatus());
      return undefined;
    }
    const delay = pollsRef.current >= EXTRACTION_MAX_POLLS ? SLOW_POLL_INTERVAL_MS : EXTRACTION_POLL_INTERVAL_MS;
    const timer = setTimeout(() => {
      pollsRef.current += 1;
      void dispatch(fetchExtractionStatus()).then((result) => {
        if (fetchExtractionStatus.rejected.match(result)) setFailedPolls((n) => n + 1);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [dispatch, jobKey, extracting, extractionStatus, failedPolls]);

  // A profile URL for another org than the loaded one is mid-switch (the page switches the token
  // to its URL's org) — locking now would hide the page that does the switching.
  const urlProfileId = /^\/business\/profile\/(\d+)/.exec(pathname ?? "")?.[1];
  const switching = !!urlProfileId && Number(urlProfileId) !== profile?.id;
  return { extractionStatus, lockedOut: extracting && !switching && !OPEN_WHILE_EXTRACTING.includes(pathname ?? "") };
}
