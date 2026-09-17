// parseCertLogHosts — crt.sh's JSON response -> cleaned, same-site, non-infra hostnames.
//
// CATALOGUE_SUBDOMAINS (scraper.ts) is a fixed 9-word list and can never find a content
// subdomain whose name isn't one of those words (academic.stanford.edu,
// datascience.<institution>.com). Certificate Transparency logs every public TLS cert
// permanently, so this finds a real host regardless of its name or whether anything links to it.
//
// Pure — no network. Run it directly:
//   node --import tsx tests/subdomain-cert-log.ts
import { capCertLogHosts, parseCertLogHosts } from "../src/modules/superadmin/data-extraction/lib/scraper.js";
import { classifierDistrusted, isRegistrySuffix, siteOf } from "../src/modules/superadmin/data-extraction/lib/html-utils.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}: expected ${e}, got ${a}`); }
}

const site = "stanford.edu";

eq(
  parseCertLogHosts([{ name_value: "academic.stanford.edu" }, { name_value: "datascience.stanford.edu" }], site).sort(),
  ["academic.stanford.edu", "datascience.stanford.edu"],
  "finds content subdomains no wordlist would guess",
);

eq(
  parseCertLogHosts([{ name_value: "*.catalog.stanford.edu" }], site),
  ["catalog.stanford.edu"],
  "strips the wildcard prefix",
);

eq(
  parseCertLogHosts([{ name_value: "www.stanford.edu\nacademic.stanford.edu\nmail.stanford.edu" }], site).sort(),
  ["academic.stanford.edu", "www.stanford.edu"],
  "splits a multi-name SAN blob and drops the infra host in it",
);

eq(
  parseCertLogHosts(["mail", "ns1", "vpn", "autodiscover", "smtp"].map((p) => ({ name_value: `${p}.stanford.edu` })), site),
  [],
  "excludes known infra prefixes",
);

eq(
  parseCertLogHosts([{ name_value: "portal.berkeley.edu" }], site),
  [],
  "excludes off-site hosts from a shared/multi-SAN cert",
);

eq(parseCertLogHosts(null, site), [], "non-array input degrades to empty, not a throw");
eq(parseCertLogHosts([{}], site), [], "entry with no name_value is skipped, not a throw");

// Ranking: a cap must never drop a catalogue-like host in favor of one that isn't, so
// catalogue-like names sort first regardless of the order crt.sh happened to return them in.
eq(
  parseCertLogHosts(
    [{ name_value: "img1.stanford.edu" }, { name_value: "coursecatalog.stanford.edu" }, { name_value: "cdn2.stanford.edu" }],
    site,
  ),
  ["coursecatalog.stanford.edu", "img1.stanford.edu", "cdn2.stanford.edu"],
  "ranks catalogue-like hosts first, ahead of hosts crt.sh listed earlier",
);

// parseCertLogHosts no longer caps — that's capCertLogHosts's job, kept separate so each is
// independently testable (ranking vs. "did the cap actually drop something").
const many = Array.from({ length: 40 }, (_, i) => ({ name_value: `sub${i}.stanford.edu` }));
const ranked = parseCertLogHosts(many, site);
eq(ranked.length, 40, "parseCertLogHosts itself is uncapped");

const { kept, dropped } = capCertLogHosts(ranked);
eq(kept.length, 25, "capCertLogHosts keeps at most the default cap");
eq(dropped.length, 15, "capCertLogHosts reports exactly what it dropped, for the caller to log");
eq(kept, ranked.slice(0, 25), "kept is the ranked list's prefix, not a re-ordering");
eq(capCertLogHosts(["a", "b", "c"], 5), { kept: ["a", "b", "c"], dropped: [] }, "nothing dropped when under the cap");

// siteOf resolves the registrable domain from the real Public Suffix List. A hand-kept suffix list
// got this wrong twice: a missing suffix collapsed an institution to its REGISTRY, so "%.ac.id"
// asked a certificate log for every Indonesian university and filterUrls scoped the crawl to all
// of them. Assert the resolved value, not just the guard — the guard is downstream of this.
const sites: [string, string][] = [
  // Unchanged by the switch: these were already correct.
  ["https://stanford.edu", "stanford.edu"],
  ["https://www.mit.edu", "mit.edu"],
  ["https://catalog.mit.edu", "mit.edu"],
  ["https://som.ku.edu.np", "ku.edu.np"],
  ["https://torrens.edu.au", "torrens.edu.au"],
  ["https://www.ox.ac.uk", "ox.ac.uk"],
  // Previously collapsed to the registry — a whole country's institutions in one crawl scope.
  ["https://ui.ac.id", "ui.ac.id"],
  ["https://example.co.uk", "example.co.uk"],
  ["https://x.edu.pl", "x.edu.pl"],
  // PRIVATE suffixes: separate tenants are unrelated organisations, so each is its own site.
  ["https://tenant.blogspot.com", "tenant.blogspot.com"],
  ["https://school.github.io", "school.github.io"],
  ["https://college.wixsite.com", "college.wixsite.com"],
];
for (const [seed, want] of sites) eq(siteOf(seed), want, `siteOf(${seed})`);

// A host that IS a public suffix has no institution behind it, so an outward lookup must refuse.
for (const suffix of ["ac.id", "co.uk", "edu.np", "blogspot.com", "github.io", "wixsite.com"]) {
  eq(isRegistrySuffix(suffix), true, `refuses the bare registry suffix "${suffix}"`);
}
for (const [seed] of sites) {
  eq(isRegistrySuffix(siteOf(seed)), false, `allows real institution ${seed} (siteOf -> "${siteOf(seed)}")`);
}

// The URL classifier NARROWS a noisy heuristic list; returning a small fraction of it is a
// failure, not a tighter answer — and the answer is cached on the exact prompt, so an unguarded
// bad narrowing is permanent and free on every re-run.
eq(classifierDistrusted(1363, 154), true, "the real Yale case: 154 of 1,363 is distrusted");
eq(classifierDistrusted(1363, 1200), false, "a mild narrowing is trusted");
eq(classifierDistrusted(1000, 250), false, "exactly at the 25% floor is trusted");
eq(classifierDistrusted(1000, 249), true, "just under the floor is distrusted");
eq(classifierDistrusted(1363, 0), true, "returning nothing at all is distrusted, not obeyed");
eq(classifierDistrusted(0, 0), false, "an empty heuristic list can't be distrusted (no baseline)");
eq(classifierDistrusted(600, 100, 0.1), false, "the floor is tunable per call");

// Batches are judged INDIVIDUALLY, not just in aggregate. 1,363 URLs split 800 + 563: if the first
// batch behaves and the second returns nothing, the total (700 of 1,363 = 51%) clears the floor
// while 563 URLs vanish. Per-batch is the only check that catches it.
eq(classifierDistrusted(800, 700), false, "a healthy batch is trusted on its own input");
eq(classifierDistrusted(563, 0), true, "a batch that returned nothing is distrusted on its own input");
eq(classifierDistrusted(1363, 700), false, "...while the AGGREGATE of those two batches looks fine");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
