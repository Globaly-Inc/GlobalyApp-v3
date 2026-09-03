import "dotenv/config";
import { masterKnex as db } from "../src/core/db/master-pool.js";

const rows = await db("institutions")
  .whereIn("institution_name", ["Asia Pacific International College (APIC)", "Curtin University", "Harvard University", "Stanford University"])
  .select("id", "institution_name", "is_published", "deleted_at");
console.log(rows);

await db.destroy();
