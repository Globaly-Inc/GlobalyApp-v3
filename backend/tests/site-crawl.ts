/**
 * Discovery without Firecrawl — the Scrapling crawl, its seeds, crawl ranking, the bot-challenge
 * guard and relative-link resolution. Pure (the crawl's fetch is faked). Run: npm run test:site-crawl
 *
 * rochester.edu found 38 URLs (Firecrawl out of credits, no sitemap); csuohio.edu queued 345 library
 * guides and 1 catalogue page, the catalogue being an AWS-WAF-challenged Acalog whose programme links
 * are all relative.
 */
import { _crawlDeps, crawlSeeds, crawlSite, isHubLink } from "../src/modules/superadmin/data-extraction/lib/site-crawl.js";
import { crawlRank, filterUrls, rankForCrawl } from "../src/modules/superadmin/data-extraction/lib/html-utils.js";
import { extractLinksFromMarkdown, isChallengePage } from "../src/modules/superadmin/data-extraction/lib/scraper.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

// ── crawl: follows hub links only, keeps every link, respects depth + budget ────
{
  const site: Record<string, string[]> = {
    "https://www.u.edu": ["https://www.u.edu/academics/programs.html", "https://www.u.edu/about", "https://www.u.edu/news/x"],
    "https://www.u.edu/academics/programs.html": ["https://sas.u.edu/programs/biology", "https://sas.u.edu/people/smith", "https://other.org/programs/x"],
    "https://sas.u.edu/programs/biology": ["https://sas.u.edu/programs/biology/ba"],
    "https://sas.u.edu/programs/biology/ba": ["https://sas.u.edu/programs/deeper"],
  };
  const fetched: string[] = [];
  _crawlDeps.fetchLinks = async (url) => { fetched.push(url); return site[url] ?? []; };
  const r = await crawlSite(["https://www.u.edu/"], { budget: 50, maxDepth: 2 });
  eq(fetched, ["https://www.u.edu", "https://www.u.edu/academics/programs.html", "https://sas.u.edu/programs/biology"],
    "fetches the seed, then hub links only, stopping at maxDepth");
  // Exact-member and parsed-hostname checks, not substring matches on URLs.
  const found = new Set(r.urls);
  const hosts = new Set(r.urls.map((u) => new URL(u).hostname));
  eq(found.has("https://www.u.edu/about"), true, "a non-hub link is kept though not followed");
  eq(found.has("https://sas.u.edu/people/smith"), true, "other same-site subdomain links are kept");
  eq(hosts.has("other.org"), false, "off-site links are dropped");
  eq(r.urls.some((u) => new URL(u).pathname.startsWith("/news/")), false, "filterUrls' news exclusion applies to crawled links");
  eq(found.has("https://sas.u.edu/programs/biology/ba"), true, "links on the last fetched level are kept");

  fetched.length = 0;
  const capped = await crawlSite(["https://www.u.edu/"], { budget: 2 });
  eq([capped.fetched, fetched.length], [2, 2], "budget caps fetches");

  let calls = 0;
  const stopped = await crawlSite(["https://www.u.edu/"], { budget: 50, shouldStop: async () => ++calls > 1 });
  eq(stopped.stopped, true, "shouldStop halts between waves");
}

{
  const cat: Record<string, string[]> = {
    "https://catalog.u.edu": ["https://catalog.u.edu/content.php?catoid=50&navoid=1", "https://catalog.u.edu/content.php?catoid=50&navoid=9"],
    "https://catalog.u.edu/content.php?catoid=50&navoid=1": ["https://catalog.u.edu/preview_program.php?catoid=50&poid=7"],
    "https://catalog.u.edu/content.php?catoid=50&navoid=9": ["https://catalog.u.edu/index.php?catoid=12", "https://catalog.u.edu/preview_program.php?catoid=12&poid=3"],
  };
  _crawlDeps.fetchLinks = async (url) => cat[url] ?? [];
  const r = await crawlSite(["https://catalog.u.edu"], { budget: 50 });
  eq(r.urls.filter((u) => new URL(u).searchParams.get("catoid") === "12"), [], "archived Acalog catalogues (catoid not on the seed page) are dropped");
  eq(new Set(r.urls).has("https://catalog.u.edu/preview_program.php?catoid=50&poid=7"), true, "current-catalogue programmes are kept");
}

{
  // Two current catalogues on one site with unrelated catoid ranges: each keeps its own.
  // The graduate catalogue is only reached ONE HOP in, from the undergraduate one.
  const two: Record<string, string[]> = {
    "https://www.u.edu": ["https://catalog.u.edu/content.php?catoid=50&navoid=1"],
    "https://catalog.u.edu/content.php?catoid=50&navoid=1": [
      "https://catalog.u.edu/preview_program.php?catoid=50&poid=1", "https://catalog.u.edu/preview_program.php?catoid=12&poid=9",
      "https://gradcatalog.u.edu/content.php?catoid=7&navoid=2",
    ],
    "https://gradcatalog.u.edu/content.php?catoid=7&navoid=2": ["https://gradcatalog.u.edu/preview_program.php?catoid=7&poid=3"],
  };
  _crawlDeps.fetchLinks = async (url) => two[url] ?? [];
  const found = new Set((await crawlSite(["https://www.u.edu"], { budget: 50 })).urls);
  eq(found.has("https://gradcatalog.u.edu/preview_program.php?catoid=7&poid=3"), true, "a second catalogue's current catoid is not dropped by the first's");
  eq(found.has("https://catalog.u.edu/preview_program.php?catoid=12&poid=9"), false, "each host still drops its own archived catoids");
}

{
  const sites: Record<string, string[]> = {
    "https://catalog.uni.edu": ["https://catalog.uni.edu/programs/nursing"],
    "https://courses.uni.edu.my": ["https://courses.uni.edu.my/programs/business", "https://www.uni.edu/about"],
  };
  _crawlDeps.fetchLinks = async (url) => sites[url] ?? [];
  const found = new Set((await crawlSite(["https://catalog.uni.edu", "https://courses.uni.edu.my"], { budget: 20 })).urls);
  eq(found.has("https://courses.uni.edu.my/programs/business"), true, "a second seed on another domain keeps ITS links");
  eq(found.has("https://catalog.uni.edu/programs/nursing"), true, "…and the first seed keeps its own");
  eq(found.has("https://www.uni.edu/about"), false, "a page's links are scoped to its own seed's site, not the other seed's");
}

eq(isHubLink("https://catalog.x.edu/content.php?catoid=50&navoid=4329"), true, "Acalog nav page is a hub");
eq(isHubLink("https://www.x.edu/provost/faculty-support"), false, "a staff page is not a hub");

// ── crawl seeds ─────────────────────────────────────────────────────────────
eq(crawlSeeds("https://www.u.edu/", ["https://www.u.edu/a", "https://www.u.edu/b"]), ["https://www.u.edu/"], "thin discovery crawls from the homepage");
{
  const many = Array.from({ length: 400 }, (_, i) => `https://www.u.edu/p${i}`);
  eq(crawlSeeds("https://www.u.edu/", [...many, "https://catalog.u.edu"]), ["https://catalog.u.edu"], "rich discovery still crawls a root-only catalogue host");
  eq(crawlSeeds("https://www.u.edu/", [...many, "https://catalog.u.edu/a", "https://catalog.u.edu/b"]), [], "a catalogue host with its own URLs is not re-crawled");
}

// ── ranking before the page cap ─────────────────────────────────────────────
eq(
  rankForCrawl([
    { url: "https://www.u.edu/about", source: "sitemap" },
    { url: "https://www.u.edu/programs/nursing", source: "sitemap" },
    { url: "https://catalog.u.edu/preview_program.php?poid=1", source: "sitemap" },
    { url: "https://www.u.edu/", source: "homepage" },
    { url: "https://www.u.edu/admin-pick", source: "sitemap", category_source: "admin" },
  ]).map((r) => r.url),
  ["https://www.u.edu/", "https://www.u.edu/admin-pick", "https://catalog.u.edu/preview_program.php?poid=1", "https://www.u.edu/programs/nursing", "https://www.u.edu/about"],
  "homepage/admin first, then catalogue host, then course path, then the rest — stable within a rank",
);
eq(crawlRank("https://catalog.u.edu/courseleaf/admin"), 3, "a catalogue host's non-course page is not promoted");

// ── non-content hosts ───────────────────────────────────────────────────────
eq(
  filterUrls(["https://researchguides.csuohio.edu/nur334", "https://libguides.u.edu/x", "https://library.u.edu/y", "https://catalog.csuohio.edu/x"], "https://www.csuohio.edu"),
  ["https://catalog.csuohio.edu/x"],
  "library-guide hosts are off the site list",
);

// ── bot challenge ───────────────────────────────────────────────────────────
const challenge = "JavaScript is disabled\n======================\n\nIn order to continue, we need to verify that you're not a robot.\nThis requires JavaScript. Enable JavaScript and then reload the page.\n";
eq(isChallengePage(challenge), true, "AWS WAF interstitial is a challenge page");
eq(isChallengePage(`${"Programme details. ".repeat(200)} Please verify that you are not a robot before submitting the form.`), false, "a long real page with a reCAPTCHA line is not");
eq(isChallengePage("Please enable JavaScript to use this site's search."), false, "a noscript banner alone is not");

// ── relative links ──────────────────────────────────────────────────────────
eq(
  extractLinksFromMarkdown("[Nursing](/content.php?catoid=50&navoid=4329) [x](#top) [m](mailto:a@b.c) [abs](https://x.edu/a) see https://y.edu/b", "https://catalog.csuohio.edu/index.php"),
  ["https://catalog.csuohio.edu/content.php?catoid=50&navoid=4329", "https://x.edu/a", "https://y.edu/b"],
  "relative hrefs resolve against the page; anchors and mailto are skipped",
);
eq(extractLinksFromMarkdown("[Nursing](/content.php)"), [], "without a base URL a relative href is skipped, as before");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
