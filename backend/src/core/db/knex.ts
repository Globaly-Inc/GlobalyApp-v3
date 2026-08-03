// Knex instance factory + connection string builder.
// Used by pool-manager and business provisioner to create per-business Knex instances.

import knexLib, { type Knex } from "knex";
import { config } from "../../config.js";

interface BusinessConn {
  db_name: string;
}

/** Build a PostgreSQL connection string for a business */
export function buildConnString(business: BusinessConn): string {
  return `postgresql://${config.DB_USERNAME}:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${business.db_name}`;
}

/** Create a new Knex instance for a given connection string */
export function createKnex(
  connString: string,
  poolConfig: Knex.PoolConfig = { min: 0, max: 3, idleTimeoutMillis: 30_000 },
): Knex {
  return knexLib({
    client: "pg",
    connection: connString,
    pool: poolConfig,
  });
}
