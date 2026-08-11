// Aggregator registry — returns first matching provider.

import type { AggregatorProvider } from "./types.js";
import { hotcourses } from "./hotcourses.js";
import { mastersPortal } from "./masters-portal.js";

// ponytail: ordered list — hotcourses first, then masters-portal. Add more providers here.
const PROVIDERS: AggregatorProvider[] = [hotcourses, mastersPortal];

export function detectAggregator(url: string): AggregatorProvider | null {
  return PROVIDERS.find((p) => p.detect(url)) ?? null;
}

export type { AggregatorProvider, AggregatorResult, ScrapeFn } from "./types.js";
