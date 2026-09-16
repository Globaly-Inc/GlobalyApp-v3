// Usage: npm run sitemap:list -- https://example.edu [--discover]
// Prints every URL found in the site's sitemaps (robots.txt Sitemap: lines, sitemap index
// recursion, catalogue subdomains) using the same code the extraction job worker runs.
// --discover runs the full discoverUrlsForCrawl cascade (Firecrawl map → sitemap → page links).
import { discoverUrlsForCrawl, fetchSitemapUrls } from "../src/modules/superadmin/data-extraction/lib/scraper.js";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
if (!url) {
  console.error("Usage: npm run sitemap:list -- <url> [--discover]");
  process.exit(1);
}

const discover = args.includes("--discover");
const urls = discover
  ? await discoverUrlsForCrawl(url, { limit: 10000 }).then((r) => { console.error(`method: ${r.method}${r.error ? ` (${r.error})` : ""}`); return r.urls; })
  : await fetchSitemapUrls(url, 10000);

console.log([...urls].sort().join("\n"));
console.error(`${urls.length} urls`);
process.exit(0);
