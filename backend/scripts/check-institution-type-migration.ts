/** Round-trips the institution_type migration inside a transaction that always rolls back. */
import "dotenv/config";
import knexFactory from "knex";
import assert from "node:assert/strict";
import { up, down } from "../database/migrations/globalyapp/20260909_003_institution_type_public_private.js";

const db = knexFactory({
  client: "pg",
  connection: {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  },
});

const read = (trx: any, id: number) => trx("institutions").where({ id }).first("institution_type", "meta");

async function main() {
  await db.transaction(async (trx) => {
    await trx.raw("alter table institutions drop constraint if exists institutions_institution_type_check");
    await trx("institutions").where({ id: 1 }).update({ institution_type: "University", meta: {} });
    await trx("institutions").where({ id: 2 }).update({ institution_type: "private" });

    await up(trx as never);

    const legacy = await read(trx, 1);
    assert.equal(legacy.institution_type, null, "legacy category is cleared");
    assert.equal(legacy.meta.legacy_institution_type, "University", "legacy category is parked in meta");

    const cased = await read(trx, 2);
    assert.equal(cased.institution_type, "Private", "casing is normalised");
    assert.equal(cased.meta?.legacy_institution_type, undefined, "a conforming value is not parked");

    // Savepoint: a constraint violation aborts its transaction, and the assertions below
    // still need this one alive.
    await assert.rejects(
      trx.transaction(async (sp: any) => {
        await sp("institutions").where({ id: 2 }).update({ institution_type: "University" });
      }),
      /institutions_institution_type_check/,
      "constraint rejects a category value",
    );

    await down(trx as never);

    const restored = await read(trx, 1);
    assert.equal(restored.institution_type, "University", "down() restores the parked category");
    assert.equal(restored.meta.legacy_institution_type, undefined, "down() clears the parking key");

    console.log("migration round-trip OK");
    throw new Error("ROLLBACK");
  }).catch((e: Error) => {
    if (e.message !== "ROLLBACK") { console.error("FAILED:", e.message); process.exitCode = 1; }
  });

  const after = await db("institutions").orderBy("id").select("id", "institution_type");
  console.log("unchanged after rollback:", after.map((r) => `${r.id}=${r.institution_type}`).join(" "));
  await db.destroy();
}

void main();
