"use client";

import { useEffect, useRef, useState } from "react";
import { getPlatformStats } from "../api";
import type { PlatformStats } from "../types";

/**
 * Both stat bars live inside client pages, so the counts are fetched on mount rather than
 * server-rendered. Ref-guarded because Strict Mode double-invokes effects.
 */
export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getPlatformStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}
