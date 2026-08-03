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
export function getKnex(businessId: string, connString: string): Knex {
  const existing = pools.get(businessId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.db;
  }

  // Evict oldest if at capacity
  if (pools.size >= MAX_POOLS) {
    evictOldest();
  }

  const db = createKnex(connString, {
    min: 0,
    max: PER_BUSINESS_MAX,
    idleTimeoutMillis: 30_000,
  });

  pools.set(businessId, { db, lastUsed: Date.now() });
  return db;
}

function evictOldest(): void {
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [id, entry] of pools) {
    if (entry.lastUsed < oldestTime) {
      oldest = id;
      oldestTime = entry.lastUsed;
    }
  }
  if (oldest) {
    pools.get(oldest)!.db.destroy();
    pools.delete(oldest);
  }
}

/** Start background loop that evicts idle business pools */
export function startEvictionLoop(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of pools) {
      if (now - entry.lastUsed > POOL_TTL_MS) {
        entry.db.destroy();
        pools.delete(id);
      }
    }
  }, 60_000);
}

/** Graceful shutdown — destroy all pools */
export async function shutdownAll(): Promise<void> {
  await Promise.all([...pools.values()].map((e) => e.db.destroy()));
  pools.clear();
}
