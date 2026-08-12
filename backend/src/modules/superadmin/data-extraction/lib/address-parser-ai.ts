/**
 * AI fallback for addresses our heuristic parser cannot split.
 * Ported from V2 _shared/address-parser-ai.ts.
 * Uses V3 extractJson (Gemini) instead of V2's Lovable API.
 *
 * Batched, capped, best-effort: returns an array aligned 1:1 with the
 * input batch. Any row the model can't parse comes back as null.
 * Max batch size 20.
 */

import type { ParsedAddress } from "./address-parser.js";
import { extractJson, isConfigured } from "./llm-client.js";
import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("address-parser-ai");

interface AiAddressInput {
  raw: string;
  country?: string | null;
}

interface AiParsedItem {
  index?: number;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

const SYSTEM = "You parse messy free-text postal addresses into structured fields. Never invent data. Leave fields null when unsure.";

export async function parseAddressesAi(
  batch: AiAddressInput[],
): Promise<(ParsedAddress | null)[]> {
  if (!isConfigured() || batch.length === 0) return batch.map(() => null);
  const items = batch.slice(0, 20);

  const prompt = `Parse each address into structured fields. Return a JSON object with an "items" array, one entry per input, in the same order.

Inputs:
${JSON.stringify(items.map((b, i) => ({ index: i, raw: b.raw, country_hint: b.country || null })))}

Output schema: { "items": [{ "index": number, "street1": string|null, "street2": string|null, "city": string|null, "state": string|null, "postcode": string|null, "country": string|null }] }`;

  try {
    const result = await extractJson<{ items?: AiParsedItem[] }>({
      system: SYSTEM,
      prompt,
      maxTokens: 4096,
    });

    const out: (ParsedAddress | null)[] = items.map(() => null);
    for (const it of result.items || []) {
      if (typeof it.index !== "number" || it.index < 0 || it.index >= out.length) continue;
      out[it.index] = {
        street1: (it.street1 || "").trim() || null,
        street2: (it.street2 || "").trim() || null,
        city: (it.city || "").trim() || null,
        state: (it.state || "").trim() || null,
        postcode: (it.postcode || "").trim() || null,
        country: (it.country || "").trim() || null,
        address: null, // caller preserves original raw
      };
    }
    return out;
  } catch (e) {
    logger.warn(`AI address parse error: ${e instanceof Error ? e.message : String(e)}`);
    return items.map(() => null);
  }
}
