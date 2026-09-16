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

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
