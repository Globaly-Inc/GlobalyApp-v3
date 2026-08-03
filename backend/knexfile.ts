/// <reference types="node" />
import "dotenv/config";
import type { Knex } from "knex";

const connection: Knex.PgConnectionConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const base: Partial<Knex.Config> = {
  client: "pg",
  connection,
  pool: { min: 0, max: 4 },
};

const globalyapp: Knex.Config = {
  ...base,
  migrations: { directory: "./database/migrations/globalyapp", tableName: "knex_migrations_globalyapp", extension: "ts" },
  seeds: { directory: "./database/seeders/globalyapp", extension: "ts" },
};

const superadmin: Knex.Config = {
  ...base,
  connection: { ...connection, database: process.env.DB_NAME },
  searchPath: ["superadmin", "public"],
  migrations: { directory: "./database/migrations/superadmin", tableName: "knex_migrations", schemaName: "superadmin", extension: "ts" },
  seeds: { directory: "./database/seeders/superadmin", extension: "ts" },
};

export default { globalyapp, superadmin };

// Business DB config is built dynamically per-business — see src/core/db/knex.ts
