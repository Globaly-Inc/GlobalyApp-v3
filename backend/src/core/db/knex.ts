// Knex helpers for schema-per-tenant architecture.
// All tenants live in the same database, isolated by PostgreSQL schemas.
// Schema name = UUID from businesses.schema_name (non-guessable).

import knexLib, { type Knex } from "knex";
import { config } from "../../config.js";

/** Schema name IS the UUID — no prefix, non-enumerable */
export function schemaName(schemaUuid: string): string {
  return schemaUuid;
}

/** Master DB connection string (used by pool manager for tenant schemas) */
export function masterConnString(): string {
  return `postgresql://${config.DB_USERNAME}:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;
}

/** Create a Knex instance with a specific searchPath (for tenant schemas) */
export function createSchemaKnex(
  schema: string,
  poolConfig: Knex.PoolConfig = { min: 0, max: 3, idleTimeoutMillis: 30_000 },
): Knex {
  return knexLib({
    client: "pg",
    connection: masterConnString(),
    searchPath: [schema, "public"],
    pool: poolConfig,
  });
}
