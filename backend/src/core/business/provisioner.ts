// Business DB provisioning — CREATE DATABASE, run migrations, seed defaults.
// Called when a new business is registered.
// For now business DBs are empty — all tables live in globalyapp.

import knex from "knex";
import { masterKnex } from "../db/master-pool.js";
import { config } from "../../config.js";

/**
 * Provision a new business database:
 * 1. CREATE DATABASE using the UUID db_name
 * 2. Run business migrations against the new DB (empty for now)
 * 3. Seed default data
 */
export async function provisionBusinessDb(dbName: string): Promise<void> {

  await masterKnex.raw(`CREATE DATABASE "${dbName}"`);

  const businessDb = knex({
    client: "pg",
    connection: `postgresql://${config.DB_USERNAME}:${config.DB_PASSWORD}@${config.DB_HOST}:${config.DB_PORT}/${dbName}`,
    pool: { min: 0, max: 1 },
  });

  try {
    await businessDb.migrate.latest({
      directory: "./database/migrations/business",
    });

    await businessDb.seed.run({
      directory: "./database/seeders/business",
    });
  } finally {
    await businessDb.destroy();
  }
}
