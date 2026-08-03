// Single Knex instance for the globalyapp database.
// Used by auth, business resolver, and any globalyapp queries.

import knex from "knex";
import { config } from "../../config.js";

export const masterKnex = knex({
  client: "pg",
  connection: config.MASTER_DB_URL,
  pool: { min: 0, max: 10 },
});
