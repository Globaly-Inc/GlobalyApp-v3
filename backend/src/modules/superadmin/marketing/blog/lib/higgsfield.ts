// Higgsfield HTTP API client — text-to-image cover generation for AI-generated blog
// posts. NEVER throws: returns null when unconfigured or on any failure, so a cover
// problem never fails the surrounding blog-generation job.
//
// Docs: https://docs.higgsfield.ai/docs — async submit -> poll -> result flow.
// Auth is normally a key+secret pair ("Authorization: Key <id>:<secret>"), but the
// plan reserves a single HIGGSFIELD_API_KEY env var, so that var is expected to hold
// "<key-id>:<key-secret>" already joined and is passed straight through.

import { getIntegrationSetting } from "../../../settings/services/integration-settings.service.js";
import { createChildLogger } from "../../../../../shared/logger.js";

const logger = createChildLogger("higgsfield-client");

const HIGGSFIELD_BASE_URL = "https://api.higgsfield.ai";
const TEXT_TO_IMAGE_PATH = "/higgsfield-ai/soul/v2/standard";
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20; // ponytail: ~60s ceiling, raise if Soul routinely takes longer

interface HiggsfieldQueuedResponse {
  status: string;
  request_id: string;
  status_url: string;
}

interface HiggsfieldStatusResponse {
  status: string;
  images?: Array<{ url: string }>;
}

function authHeader(apiKey: string): string {
  return `Key ${apiKey}`;
}

async function pollForImageUrl(statusUrl: string, apiKey: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(statusUrl, { headers: { Authorization: authHeader(apiKey) } });
    if (!res.ok) {
      logger.warn("Higgsfield status poll failed", { status: res.status });
      return null;
    }

    const body = (await res.json()) as HiggsfieldStatusResponse;
    if (body.status === "completed") return body.images?.[0]?.url ?? null;
    if (body.status === "failed" || body.status === "cancelled") {
      logger.warn("Higgsfield generation did not complete", { status: body.status });
      return null;
    }
    // "queued" / "processing" — keep polling.
  }
  logger.warn("Higgsfield generation timed out waiting for a result");
  return null;
}

/** Never throws. Returns null when no key is configured (Settings → Integrations, or
 * HIGGSFIELD_API_KEY env fallback) or generation fails for any reason. */
export async function generateCoverImage(prompt: string): Promise<Buffer | null> {
  const apiKey = await getIntegrationSetting("higgsfield_api_key");
  if (!apiKey) {
    logger.info("Higgsfield cover generation skipped — no key in Settings → Integrations or HIGGSFIELD_API_KEY");
    return null;
  }

  try {
    const submitRes = await fetch(`${HIGGSFIELD_BASE_URL}${TEXT_TO_IMAGE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader(apiKey) },
      body: JSON.stringify({ prompt }),
    });
    if (!submitRes.ok) {
      logger.warn("Higgsfield submit failed", { status: submitRes.status, body: (await submitRes.text()).slice(0, 300) });
      return null;
    }

    const submitted = (await submitRes.json()) as HiggsfieldQueuedResponse;
    const imageUrl = await pollForImageUrl(submitted.status_url, apiKey);
    if (!imageUrl) return null;

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      logger.warn("Higgsfield generated image download failed", { status: imageRes.status });
      return null;
    }
    return Buffer.from(await imageRes.arrayBuffer());
  } catch (err) {
    logger.warn("Higgsfield cover generation errored", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
