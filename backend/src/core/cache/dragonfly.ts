// Dragonfly cache client (Redis wire protocol → ioredis) + read-through helper.
// Fail-open by design: DRAGONFLY_URL unset or the server unreachable means every
// call falls through to the loader — caching is an optimization, never a dependency.

import { Redis } from "ioredis";
import { config } from "../../config.js";
import { createChildLogger } from "../../shared/logger.js";

const logger = createChildLogger("dragonfly-cache");

let client: Redis | null | undefined; // undefined = not yet initialized, null = disabled

export function getCache(): Redis | null {
  if (client !== undefined) return client;
  if (!config.DRAGONFLY_URL) {
    logger.info("DRAGONFLY_URL not set — caching disabled");
    client = null;
    return client;
  }
  client = new Redis(config.DRAGONFLY_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false, // down = commands reject immediately → loader path, no pile-up
    retryStrategy: (times) => Math.min(times * 200, 10_000), // reconnect forever, but back off to 10s
  });
  client.on("error", (err) => logger.warn("Dragonfly error", { err: err.message }));
  return client;
}

/** Read-through: return the cached JSON value, or run the loader and cache its result. */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cache = getCache();
  if (!cache) return loader();
  try {
    const hit = await cache.get(key);
    if (hit != null) return JSON.parse(hit) as T;
  } catch {
    // cache unreachable — serve from the loader
  }
  const value = await loader();
  cache.setex(key, ttlSeconds, JSON.stringify(value)).catch(() => {});
  return value;
}

/** Drop every key under a prefix (SCAN + UNLINK — non-blocking, fine at our key counts). */
export async function invalidatePrefix(prefix: string): Promise<void> {
  const cache = getCache();
  if (!cache) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await cache.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length) await cache.unlink(...keys);
    } while (cursor !== "0");
  } catch (err) {
    logger.warn("Cache invalidation failed", { prefix, err: String(err) });
  }
}

/** Graceful shutdown — safe to call when the cache was never used. */
export async function closeCache(): Promise<void> {
  if (client) {
    // quit() waits for a connection to send QUIT — on a disconnected client that
    // waits forever. Nothing pending matters (writes are fire-and-forget), so
    // only be polite when connected; otherwise drop the socket and its retry timer.
    if (client.status === "ready") await client.quit().catch(() => {});
    else client.disconnect();
  }
  client = undefined;
}
