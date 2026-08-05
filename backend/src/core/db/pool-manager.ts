// LRU pool manager — maintains one Knex instance per active business.
// Lazy connect on first request, TTL-based eviction for idle businesses.

import { createKnex } from "./knex.js";
import type { Knex } from "knex";

interface PoolEntry {
  db: Knex;
  lastUsed: number;
}

const pools = new Map<string, PoolEntry>();

const MAX_POOLS = 50; // ponytail: tune up when you have >50 concurrent businesses
const POOL_TTL_MS = 5 * 60_000; // evict idle pools after 5 min
const PER_BUSINESS_MAX = 3; // connections per business knex pool

/** Get or create a Knex instance for a business */
export async function getKnex(businessId: string, connString: string): Promise<Knex> {
  const existing = pools.get(businessId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.db;
  }

  // Evict oldest if at capacity
  if (pools.size >= MAX_POOLS) {
    await evictOldest();
  }

  const db = createKnex(connString, {
    min: 0,
    max: PER_BUSINESS_MAX,
    idleTimeoutMillis: 30_000,
  });

  pools.set(businessId, { db, lastUsed: Date.now() });
  return db;
}

async function evictOldest(): Promise<void> {
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [id, entry] of pools) {
    if (entry.lastUsed < oldestTime) {
      oldest = id;
      oldestTime = entry.lastUsed;
    }
  }
  if (oldest) {
    const entry = pools.get(oldest)!;
    pools.delete(oldest);
    await entry.db.destroy();
  }
}

/** Start background loop that evicts idle business pools */
export function startEvictionLoop(): void {
  setInterval(async () => {
    const now = Date.now();
    const stale: [string, PoolEntry][] = [];
    for (const [id, entry] of pools) {
      if (now - entry.lastUsed > POOL_TTL_MS) stale.push([id, entry]);
    }
    for (const [id, entry] of stale) {
      pools.delete(id);
      await entry.db.destroy().catch(() => {}); // ponytail: best-effort, don't crash the loop
    }
  }, 60_000);
}

/** Graceful shutdown — destroy all pools */
export async function shutdownAll(): Promise<void> {
  await Promise.all([...pools.values()].map((e) => e.db.destroy()));
  pools.clear();
}
