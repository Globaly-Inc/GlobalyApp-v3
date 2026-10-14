/**
 * Which branch rows a widget can actually use, and which are dead weight.
 *
 *   npm run branches:check             # problems only, grouped by widget
 *   npm run branches:check -- --all    # every row, healthy ones included
 *   npm run branches:check -- --id 3   # one embed config
 *
 * READ ONLY. It writes nothing and is safe against production.
 *
 * Why it exists: a branch row with a name and nothing else ("Main Campus", "Bangkok") is invisible
 * to every feature that reads branches. It cannot be pinned on the campus map, it cannot be the
 * RECOMMENDED BRANCH in the prompt's VISITOR LOCATION section, and it can never be the wrap-up
 * card's invite — `branchInvite` requires a city. AIT's catalogue is 7 such rows out of 12, which
 * is why the map looked broken when it was behaving exactly as designed.
 *
 * Three findings, in the order they cost you something:
 *
 *   NO PLACE    city and state both empty. Nothing can use this row. A pin would land on a
 *               country centroid at best, which is why mapLocationsFor skips it outright.
 *   BAD COUNTRY the `country` text matches no country in the lookup table — usually a CITY in the
 *               country column ("Hanoi", "Ho Chi Minh City") or a stray character ("Thailand.").
 *               `resolveCountryCode` returns null for these, so rankBranches can never match the
 *               visitor's country to them and the whole location section goes quiet.
 *   DUPLICATE   another row resolves to the same place. Harmless to the map (it keeps the first)
 *               but it means the catalogue holds one campus several times under different names.
 *
 * The PINNABLE test here is deliberately the same one `mapLocationsFor` applies — city or state.
 * If that gate ever moves, move it here too, or this report starts lying.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import * as visitorService from "../src/modules/ai-counsellor/services/visitor.service.js";
import { normalizePlace } from "../src/modules/ai-counsellor/lib/visitor-location.js";
import { resolveCountryCode } from "../src/modules/superadmin/data-extraction/lib/lookup-catalog.js";

const showAll = process.argv.includes("--all");
const onlyId = (() => {
  const i = process.argv.indexOf("--id");
  return i >= 0 ? Number(process.argv[i + 1]) : null;
})();

type Finding = "NO PLACE" | "BAD COUNTRY" | "DUPLICATE" | "ok";

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

async function main() {
  const configs = await masterKnex("ai_embed_configs")
    .select("id", "embed_key", "display_name", "institution_id", "business_id", "is_active")
    .modify((q) => { if (onlyId != null) q.where({ id: onlyId }); })
    .orderBy("id");

  const totals = { widgets: 0, noBranches: 0, rows: 0, noPlace: 0, badCountry: 0, duplicate: 0, usable: 0 };

  for (const c of configs) {
    totals.widgets += 1;
    const owner = c.institution_id != null ? `institution ${c.institution_id}` : `business ${c.business_id}`;
    const title = `#${c.id} ${c.display_name ?? "(unnamed)"} · ${owner} · key ${String(c.embed_key).slice(0, 8)}…${c.is_active ? "" : " · INACTIVE"}`;

    const branches = await visitorService.ownerBranches(c);
    if (!branches.length) {
      totals.noBranches += 1;
      console.log(`\n${title}\n  no branch rows at all — no map, no branch invite, no location section`);
      continue;
    }

    const seen = new Set<string>();
    const rows: Array<{ finding: Finding; name: string; place: string; country: string }> = [];
    for (const b of branches) {
      totals.rows += 1;
      const place = [b.city, b.state, b.country].filter(Boolean).join(", ");
      const name = b.name?.trim() || "(unnamed)";
      const countryText = b.country?.trim() ?? "";

      if (!b.city?.trim() && !b.state?.trim()) {
        totals.noPlace += 1;
        rows.push({ finding: "NO PLACE", name, place: place || "—", country: countryText || "—" });
        continue;
      }
      // Only meaningful once the row has a place: a row with no country at all is already counted
      // above or is pinnable on its city alone.
      if (countryText && !(await resolveCountryCode(countryText))) {
        totals.badCountry += 1;
        rows.push({ finding: "BAD COUNTRY", name, place, country: countryText });
        continue;
      }
      const key = normalizePlace(place);
      if (seen.has(key)) {
        totals.duplicate += 1;
        rows.push({ finding: "DUPLICATE", name, place, country: countryText || "—" });
        continue;
      }
      seen.add(key);
      totals.usable += 1;
      rows.push({ finding: "ok", name, place, country: countryText || "—" });
    }

    const problems = rows.filter((r) => r.finding !== "ok");
    const usable = rows.length - problems.length;
    console.log(`\n${title}\n  ${rows.length} rows · ${usable} usable · ${problems.length} with findings`);
    for (const r of showAll ? rows : problems) {
      console.log(`    ${pad(r.finding, 12)} ${pad(r.name, 38)} place=${pad(r.place, 34)} country=${r.country}`);
    }
  }

  console.log(
    `\n${"─".repeat(78)}\n` +
    `${totals.widgets} widgets · ${totals.noBranches} with no branches at all\n` +
    `${totals.rows} branch rows · ${totals.usable} usable\n` +
    `  NO PLACE     ${totals.noPlace}\tadd a city (and a country) or the row is invisible everywhere\n` +
    `  BAD COUNTRY  ${totals.badCountry}\tthe country column holds something that is not a country\n` +
    `  DUPLICATE    ${totals.duplicate}\tsame place as an earlier row — one campus, several records`,
  );
}

await main();
await masterKnex.destroy();
