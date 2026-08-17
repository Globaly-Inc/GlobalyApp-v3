// Per-worker setup for the integration project: decides whether the DB is usable.
// Tests read the result via tests/helpers/db.ts and skip (not fail) when it is not.

import { DB_UNREACHABLE_WARNING, probeTestDatabase } from "./db-url.js";

const available = await probeTestDatabase();
if (!available) console.warn(DB_UNREACHABLE_WARNING);

(globalThis as Record<string, unknown>).__TEST_DB_AVAILABLE__ = available;
