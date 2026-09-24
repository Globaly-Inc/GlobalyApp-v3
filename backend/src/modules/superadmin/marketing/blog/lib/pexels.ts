// Pexels API client — stock photo fallback for blog cover images.
// Used when Higgsfield is unconfigured or fails.
// Free tier: 200 req/hour, 20,000 req/month. Photos are free to use (Pexels license).
// Docs: https://www.pexels.com/api/documentation/
//
// NEVER throws — returns null on any failure or missing key.

import { getIntegrationSetting } from "../../../settings/services/integration-settings.service.js";
import { createChildLogger } from "../../../../../shared/logger.js";

const logger = createChildLogger("pexels-client");
const BASE_URL = "https://api.pexels.com/v1/search";

interface PexelsPhoto {
  src: { original: string; large2x: string };
}
interface PexelsResponse {
  photos: PexelsPhoto[];
}

/** Returns the raw image Buffer for the best landscape photo matching the query, or null. */
export async function fetchCoverImage(query: string): Promise<Buffer | null> {
  const apiKey = await getIntegrationSetting("pexels_api_key");
  if (!apiKey) {
    logger.info("Pexels cover fetch skipped — no PEXELS_API_KEY in Settings or env");
    return null;
  }

  try {
    const url = new URL(BASE_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", "1");

    const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    if (!res.ok) {
      logger.warn("Pexels search failed", { status: res.status, body: (await res.text()).slice(0, 200) });
      return null;
    }

    const body = (await res.json()) as PexelsResponse;
    const imageUrl = body.photos[0]?.src.large2x ?? body.photos[0]?.src.original;
    if (!imageUrl) {
      logger.info("Pexels returned no photos for query", { query });
      return null;
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      logger.warn("Pexels image download failed", { status: imgRes.status });
      return null;
    }
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (err) {
    logger.warn("Pexels cover fetch errored", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
