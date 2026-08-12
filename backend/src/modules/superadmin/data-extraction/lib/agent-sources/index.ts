// Provider registry — ordered by specificity (most specific first).
import { ascentoneProvider } from "./ascentone.js";
import { studylinkProvider } from "./studylink.js";
import { iframeGenericProvider } from "./iframe-generic.js";
import type { AgentSourceProvider, ProviderDetection } from "./types.js";

export const PROVIDERS: AgentSourceProvider[] = [
  ascentoneProvider,
  studylinkProvider,
  iframeGenericProvider,
];

export const KNOWN_PROVIDER_IDS = PROVIDERS.map((p) => p.id);

export function detectAgentSource(
  seedUrl: string,
  html?: string | null,
): { provider: AgentSourceProvider; detection: ProviderDetection } | null {
  for (const provider of PROVIDERS) {
    const det = provider.detect(seedUrl, html ?? null);
    if (det) return { provider, detection: det };
  }
  return null;
}

export function getProviderById(id: string): AgentSourceProvider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

export type { AgentSourceProvider, ProviderDetection, ProviderResult, AgentRow, AgentLocation } from "./types.js";
