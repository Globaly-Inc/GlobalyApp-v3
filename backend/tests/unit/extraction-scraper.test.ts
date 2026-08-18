// Wave A-COV — the scraper, with every HTTP call answered from a fixture.
//
// No network: globalThis.fetch is replaced per test and every call is recorded, so
// the assertions are about the cascade itself — which provider was asked, in what
// order, how many times, and what the caller is told when all of them fail.
//
// The properties that matter downstream:
//   - a thin page is a failure, not a success with 40 characters of nav markup. The
//     page worker branches on `blocked` and on markdown length to decide whether to
//     retry with a browser render, so a wrong verdict here silently loses a page.
//   - no scraper configured is an honest error, never an empty-but-successful page.
//   - a re-delivered scrape asks the provider again and returns the same answer: the
//     scraper holds no state that could make attempt two differ from attempt one.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { config } from "../../src/config.js";
import {
  discoverUrlsForCrawl,
  mapUrlsDetailed,
  politeFetch,
  scrapeMarkdown,
  scrapeRenderedHtml,
} from "../../src/modules/superadmin/data-extraction/lib/scraper.js";

const REAL_FETCH = globalThis.fetch;
const ORIGINAL = {
  crawlBase: config.CRAWL4AI_BASE_URL,
  crawlKey: config.CRAWL4AI_API_KEY,
  firecrawl: config.FIRECRAWL_API_KEY,
};

/** 200+ characters, because MIN_CONTENT_LEN is the difference between a page and noise. */
const REAL_PAGE = `# Bachelor of Creative Arts (Theatre Arts)\n\n${"Three-year undergraduate degree taught at the Sydney campus. ".repeat(
  6,
)}`;
const THIN_PAGE = "# Home\n\n[Courses](https://uni.edu/courses)";

interface Call {
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

/** Replace fetch with a router over URL substrings. Returns the recorded calls. */
function stubFetch(routes: Array<[RegExp, () => Response]>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers as Record<string, string>) ?? {},
    });
    for (const [pattern, respond] of routes) if (pattern.test(url)) return respond();
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  config.CRAWL4AI_BASE_URL = undefined;
  config.CRAWL4AI_API_KEY = undefined;
  config.FIRECRAWL_API_KEY = undefined;
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  config.CRAWL4AI_BASE_URL = ORIGINAL.crawlBase;
  config.CRAWL4AI_API_KEY = ORIGINAL.crawlKey;
  config.FIRECRAWL_API_KEY = ORIGINAL.firecrawl;
});

describe("scrapeMarkdown — nothing configured", () => {
  it("says so instead of returning an empty page that reads as success", async () => {
    const calls = stubFetch([]);
    const res = await scrapeMarkdown("https://nothing-configured.edu/courses");
    expect(res).toEqual({
      markdown: "",
      links: [],
      scraper: "none",
      error: "No scraper configured (set CRAWL4AI_BASE_URL or FIRECRAWL_API_KEY)",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("scrapeMarkdown — Crawl4AI first", () => {
  beforeEach(() => {
    config.CRAWL4AI_BASE_URL = "crawl4ai.internal/";
    config.CRAWL4AI_API_KEY = "c4-key";
  });

  it("normalises a bare host into https and strips the trailing slash", async () => {
    const calls = stubFetch([[/\/v1\/crawl/, () => json({ results: [{ markdown: REAL_PAGE }] })]]);
    await scrapeMarkdown("https://a1.edu/courses");
    expect(calls[0].url).toBe("https://crawl4ai.internal/v1/crawl");
  });

  it("sends both auth headers, because Cloud and self-hosted disagree on which", async () => {
    const calls = stubFetch([[/\/v1\/crawl/, () => json({ results: [{ markdown: REAL_PAGE }] })]]);
    await scrapeMarkdown("https://a2.edu/courses");
    expect(calls[0].headers["X-API-Key"]).toBe("c4-key");
    expect(calls[0].headers["Authorization"]).toBe("Bearer c4-key");
  });

  it("takes the fit markdown and stops — one call, no fallbacks", async () => {
    const calls = stubFetch([[/\/v1\/crawl/, () => json({ results: [{ markdown: REAL_PAGE }] })]]);
    const res = await scrapeMarkdown("https://a3.edu/courses");
    expect(res.scraper).toBe("crawl4ai");
    expect(res.markdown).toBe(REAL_PAGE);
    expect(res.blocked).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ content_format: "fit_markdown" });
  });

  it("retries in raw mode when fit markdown comes back too thin to be a page", async () => {
    let hit = 0;
    const calls = stubFetch([
      [
        /\/v1\/crawl/,
        () => {
          hit++;
          return json({ results: [{ markdown: hit === 1 ? THIN_PAGE : REAL_PAGE }] });
        },
      ],
    ]);
    const res = await scrapeMarkdown("https://a4.edu/courses");
    expect(res.markdown).toBe(REAL_PAGE);
    expect(calls.map((c) => (c.body as { content_format: string }).content_format)).toEqual([
      "fit_markdown",
      "raw_markdown",
    ]);
  });

  it("falls back to the legacy /md endpoint when /v1/crawl is not there", async () => {
    const calls = stubFetch([
      [/\/v1\/crawl/, () => new Response("no such route", { status: 404 })],
      [/\/md$/, () => json({ markdown: REAL_PAGE })],
    ]);
    const res = await scrapeMarkdown("https://a5.edu/courses");
    expect(res.markdown).toBe(REAL_PAGE);
    expect(calls.map((c) => c.url)).toEqual([
      "https://crawl4ai.internal/v1/crawl",
      "https://crawl4ai.internal/md",
    ]);
  });

  it("reports the provider's own error text when the legacy endpoint refuses", async () => {
    stubFetch([
      [/\/v1\/crawl/, () => new Response("nope", { status: 404 })],
      [/\/md$/, () => json({ detail: "target site refused the connection" }, 502)],
    ]);
    const res = await scrapeMarkdown("https://a6.edu/courses");
    expect(res.blocked).toBe(true);
    expect(res.error).toBe("target site refused the connection");
  });

  it("treats success=false as an error even when a body came back", async () => {
    stubFetch([[/\/v1\/crawl/, () => json({ results: [{ markdown: "", success: false }] })]]);
    const res = await scrapeMarkdown("https://a7.edu/courses");
    expect(res.blocked).toBe(true);
    expect(res.error).toBe("crawl4ai returned success=false");
  });

  it("turns a network throw into a blocked result, not an unhandled rejection", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED 10.0.0.1:8080");
    }) as typeof fetch;
    const res = await scrapeMarkdown("https://a8.edu/courses");
    expect(res.blocked).toBe(true);
    expect(res.error).toContain("ECONNREFUSED");
  });

  it("hands a blocked page to Firecrawl when there is a key for it", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    const calls = stubFetch([
      [/\/v1\/crawl/, () => json({ results: [{ markdown: THIN_PAGE }] })],
      [/firecrawl/, () => json({ data: { markdown: REAL_PAGE, links: ["https://a9.edu/x"] } })],
    ]);
    const res = await scrapeMarkdown("https://a9.edu/courses", { withLinks: true });
    expect(res.scraper).toBe("firecrawl");
    expect(res.markdown).toBe(REAL_PAGE);
    expect(res.links).toEqual(["https://a9.edu/x"]);
    // Two Crawl4AI attempts (fit, raw) before paying for Firecrawl.
    expect(calls.filter((c) => c.url.includes("crawl4ai"))).toHaveLength(2);
  });

  it("marks the page blocked when Firecrawl is thin too, keeping the first error", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/\/v1\/crawl/, () => json({ results: [{ markdown: "", success: false }] })],
      [/firecrawl/, () => json({ data: { markdown: THIN_PAGE } })],
    ]);
    const res = await scrapeMarkdown("https://a10.edu/courses");
    expect(res.blocked).toBe(true);
    expect(res.markdown).toBe(THIN_PAGE);
    expect(res.error).toBe("crawl4ai returned success=false");
  });

  it("skips Crawl4AI entirely when the caller forces Firecrawl", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    const calls = stubFetch([[/firecrawl/, () => json({ data: { markdown: REAL_PAGE } })]]);
    const res = await scrapeMarkdown("https://a11.edu/courses", { forceFirecrawl: true });
    expect(res.scraper).toBe("firecrawl");
    expect(calls.every((c) => c.url.includes("firecrawl"))).toBe(true);
  });
});

describe("scrapeMarkdown — provider responses that do not match the docs", () => {
  beforeEach(() => {
    config.CRAWL4AI_BASE_URL = "https://crawl4ai.internal";
  });

  it("accepts a full https base URL unchanged", async () => {
    const calls = stubFetch([[/\/v1\/crawl/, () => json({ results: [{ markdown: REAL_PAGE }] })]]);
    await scrapeMarkdown("https://g1.edu/courses");
    expect(calls[0].url).toBe("https://crawl4ai.internal/v1/crawl");
  });

  it("sends no auth header when the instance needs none", async () => {
    const calls = stubFetch([[/\/v1\/crawl/, () => json({ results: [{ markdown: REAL_PAGE }] })]]);
    await scrapeMarkdown("https://g2.edu/courses");
    expect(calls[0].headers["X-API-Key"]).toBeUndefined();
    expect(calls[0].headers["Authorization"]).toBeUndefined();
  });

  it("reads a bare object as well as a results array", async () => {
    stubFetch([[/\/v1\/crawl/, () => json({ fit_markdown: REAL_PAGE })]]);
    const res = await scrapeMarkdown("https://g3.edu/courses");
    expect(res.markdown).toBe(REAL_PAGE);
  });

  it("prefers raw_markdown when neither markdown nor fit_markdown is present", async () => {
    stubFetch([[/\/v1\/crawl/, () => json({ results: [{ raw_markdown: REAL_PAGE }] })]]);
    expect((await scrapeMarkdown("https://g4.edu/courses")).markdown).toBe(REAL_PAGE);
  });

  it("extracts links from the markdown itself, since Crawl4AI returns none", async () => {
    const withLinks = `${REAL_PAGE}\n\n[Nursing](https://g5.edu/course/nursing) and https://g5.edu/fees`;
    stubFetch([[/\/v1\/crawl/, () => json({ results: [{ markdown: withLinks }] })]]);
    const res = await scrapeMarkdown("https://g5.edu/courses", { withLinks: true });
    expect(res.links).toEqual(
      expect.arrayContaining(["https://g5.edu/course/nursing", "https://g5.edu/fees"]),
    );
  });

  it("reports a legacy /md body with no markdown field as an empty page", async () => {
    stubFetch([
      [/\/v1\/crawl/, () => new Response("nope", { status: 404 })],
      [/\/md$/, () => json({ markdown: null })],
    ]);
    const res = await scrapeMarkdown("https://g6.edu/courses");
    expect(res).toMatchObject({ markdown: "", blocked: true, error: "Empty page" });
  });

  it("reports the legacy endpoint's `error` field when there is no `detail`", async () => {
    stubFetch([
      [/\/v1\/crawl/, () => new Response("nope", { status: 404 })],
      [/\/md$/, () => json({ error: "browser pool exhausted" }, 500)],
    ]);
    expect((await scrapeMarkdown("https://g7.edu/courses")).error).toBe("browser pool exhausted");
  });

  it("falls back to the status code when the failure body is not JSON at all", async () => {
    stubFetch([
      [/\/v1\/crawl/, () => new Response("nope", { status: 404 })],
      [/\/md$/, () => new Response("<html>504</html>", { status: 504 })],
    ]);
    expect((await scrapeMarkdown("https://g8.edu/courses")).error).toBe("HTTP 504");
  });

  it("keeps Firecrawl's own error when Crawl4AI had none to report", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/\/v1\/crawl/, () => json({ results: [{ markdown: "" }] })],
      [/firecrawl/, () => json({ error: "site requires login" }, 403)],
    ]);
    const res = await scrapeMarkdown("https://g9.edu/courses");
    expect(res).toMatchObject({ blocked: true, error: "site requires login" });
  });

  it("turns a Firecrawl network throw into an error, not a rejection", async () => {
    config.CRAWL4AI_BASE_URL = undefined;
    config.FIRECRAWL_API_KEY = "fc-key";
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const res = await scrapeMarkdown("https://g10.edu/courses");
    expect(res).toMatchObject({ markdown: "", scraper: "firecrawl", blocked: true });
    expect(res.error).toContain("fetch failed");
  });
});

describe("scrapeMarkdown — Firecrawl only", () => {
  beforeEach(() => {
    config.FIRECRAWL_API_KEY = "fc-key";
  });

  it("asks for links only when the caller wants them", async () => {
    const calls = stubFetch([[/firecrawl/, () => json({ data: { markdown: REAL_PAGE } })]]);
    await scrapeMarkdown("https://b1.edu/courses");
    await scrapeMarkdown("https://b2.edu/courses", { withLinks: true });
    expect((calls[0].body as { formats: string[] }).formats).toEqual(["markdown"]);
    expect((calls[1].body as { formats: string[] }).formats).toEqual(["markdown", "links"]);
  });

  it("flags a thin page as blocked so the worker can retry it differently", async () => {
    stubFetch([[/firecrawl/, () => json({ data: { markdown: THIN_PAGE } })]]);
    const res = await scrapeMarkdown("https://b3.edu/courses");
    expect(res.blocked).toBe(true);
    expect(res.markdown).toBe(THIN_PAGE);
  });

  it("accepts the flat response shape as well as the nested one", async () => {
    stubFetch([[/firecrawl/, () => json({ markdown: REAL_PAGE, links: ["https://b4.edu/a"] })]]);
    const res = await scrapeMarkdown("https://b4.edu/courses", { withLinks: true });
    expect(res.markdown).toBe(REAL_PAGE);
    expect(res.links).toEqual(["https://b4.edu/a"]);
  });

  it("returns the same answer for a re-delivered scrape of the same URL", async () => {
    // A queue re-delivery re-scrapes. The scraper keeps no per-URL state, so attempt
    // two must be indistinguishable from attempt one — the writer, not the scraper,
    // is where re-delivery has to be deduplicated.
    stubFetch([[/firecrawl/, () => json({ data: { markdown: REAL_PAGE } })]]);
    const first = await scrapeMarkdown("https://b5.edu/courses");
    const second = await scrapeMarkdown("https://b5.edu/courses");
    expect(second).toEqual(first);
  });

  it("reports a Firecrawl HTTP failure without inventing content", async () => {
    stubFetch([[/firecrawl/, () => new Response("gateway", { status: 502 })]]);
    const res = await scrapeMarkdown("https://b6.edu/courses");
    expect(res).toMatchObject({ markdown: "", scraper: "firecrawl", blocked: true, error: "HTTP 502" });
  });
});

describe("scrapeRenderedHtml", () => {
  it("needs Firecrawl and says so when it is missing", async () => {
    const res = await scrapeRenderedHtml("https://c1.edu/table");
    expect(res).toEqual({ html: "", error: "firecrawl not configured" });
  });

  it("asks for rawHtml with a long wait, because these are JS tables", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    const calls = stubFetch([[/firecrawl/, () => json({ data: { rawHtml: "<table></table>" } })]]);
    const res = await scrapeRenderedHtml("https://c2.edu/table");
    expect(res.html).toBe("<table></table>");
    expect(calls[0].body).toMatchObject({ formats: ["rawHtml"], onlyMainContent: false, waitFor: 8000 });
  });

  it("reads the flat html field when rawHtml is absent", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([[/firecrawl/, () => json({ html: "<table>flat</table>" })]]);
    expect((await scrapeRenderedHtml("https://c4.edu/table")).html).toBe("<table>flat</table>");
  });

  it("reports the provider's error and the status code it came with", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([[/firecrawl/, () => json({ error: "rendering timed out" }, 408)]]);
    expect((await scrapeRenderedHtml("https://c5.edu/table")).error).toBe("rendering timed out");
    stubFetch([[/firecrawl/, () => new Response("nope", { status: 500 })]]);
    expect((await scrapeRenderedHtml("https://c6.edu/table")).error).toBe("HTTP 500");
  });

  it("turns a network throw into an error", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    globalThis.fetch = (async () => {
      throw new Error("socket hang up");
    }) as typeof fetch;
    expect((await scrapeRenderedHtml("https://c7.edu/table")).error).toContain("socket hang up");
  });

  it("returns empty html rather than a non-string when the provider sends junk", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([[/firecrawl/, () => json({ data: { rawHtml: { nope: true } } })]]);
    expect(await scrapeRenderedHtml("https://c3.edu/table")).toEqual({ html: "" });
  });
});

describe("mapUrlsDetailed", () => {
  it("requires Firecrawl", async () => {
    const res = await mapUrlsDetailed("https://d1.edu");
    expect(res).toMatchObject({ success: false, links: [] });
    expect(res.error).toMatch(/mapping requires Firecrawl/);
  });

  it("falls forward from v2 to v1 on a 404", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    const calls = stubFetch([
      [/v2\/map/, () => new Response("gone", { status: 404 })],
      [/v1\/map/, () => json({ links: ["https://d2.edu/a", "https://d2.edu/b"] })],
    ]);
    const res = await mapUrlsDetailed("https://d2.edu");
    expect(res.links).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("flags insufficient credits distinctly from any other failure", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([[/v2\/map/, () => json({ error: "Insufficient credits" }, 402)]]);
    const res = await mapUrlsDetailed("https://d3.edu");
    expect(res).toMatchObject({ success: false, status: 402, insufficientCredits: true });
  });

  it("does not fall forward on a non-404 failure", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    const calls = stubFetch([[/v2\/map/, () => json({ error: "bad url" }, 400)]]);
    const res = await mapUrlsDetailed("https://d4.edu");
    expect(res.error).toBe("bad url");
    expect(calls).toHaveLength(1);
  });

  it("reads links out of any of the three shapes Firecrawl has used", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    const shapes = [
      { links: ["https://d5.edu/a"] },
      { data: { links: ["https://d5.edu/b"] } },
      { data: [{ url: "https://d5.edu/c" }] },
    ];
    for (const [i, shape] of shapes.entries()) {
      stubFetch([[/v2\/map/, () => json(shape)]]);
      const res = await mapUrlsDetailed(`https://d5-${i}.edu`);
      expect(res.links).toHaveLength(1);
    }
  });

  it("returns no links for a body that is not an object", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([[/v2\/map/, () => json("just a string")]]);
    const res = await mapUrlsDetailed("https://d7.edu");
    expect(res).toEqual({ success: true, links: [] });
  });

  it("returns no links when every shape is empty or unrecognised", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([[/v2\/map/, () => json({ links: [], data: { links: [] } })]]);
    expect((await mapUrlsDetailed("https://d8.edu")).links).toEqual([]);
  });

  it("survives a throw on both endpoints and reports a network error", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    globalThis.fetch = (async () => {
      throw new Error("EAI_AGAIN");
    }) as typeof fetch;
    expect(await mapUrlsDetailed("https://d9.edu")).toEqual({
      success: false,
      links: [],
      error: "firecrawl network error",
    });
  });

  it("drops entries that are not absolute http URLs", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [
        /v2\/map/,
        () => json({ links: ["/relative", "javascript:alert(1)", null, "https://d6.edu/ok"] }),
      ],
    ]);
    const res = await mapUrlsDetailed("https://d6.edu");
    expect(res.links).toEqual(["https://d6.edu/ok"]);
  });
});

describe("politeFetch", () => {
  it("backs off and retries a 429, honouring the server's Retry-After", async () => {
    let hit = 0;
    globalThis.fetch = (async () => {
      hit++;
      return hit === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "1" } })
        : new Response("ok", { status: 200 });
    }) as typeof fetch;
    const res = await politeFetch("https://e1.edu/sitemap.xml");
    expect(res.status).toBe(200);
    expect(hit).toBe(2);
  });

  it("returns the last response instead of throwing when retries run out", async () => {
    let hit = 0;
    globalThis.fetch = (async () => {
      hit++;
      return new Response("still busy", { status: 503, headers: { "retry-after": "1" } });
    }) as typeof fetch;
    const res = await politeFetch("https://e2.edu/sitemap.xml", {}, { maxRetries: 1 });
    expect(res.status).toBe(503);
    expect(hit).toBe(2);
  });

  it("backs off exponentially when the server names no Retry-After", async () => {
    let hit = 0;
    globalThis.fetch = (async () => {
      hit++;
      return hit === 1
        ? new Response("slow down", { status: 429 })
        : new Response("ok", { status: 200 });
    }) as typeof fetch;
    const started = Date.now();
    const res = await politeFetch("https://e5.edu/sitemap.xml");
    // 2000ms * 2^0 plus jitter — the point is that it waited, not the exact figure.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
    expect(res.status).toBe(200);
  });

  it("ignores a nonsense Retry-After and falls back to its own backoff", async () => {
    let hit = 0;
    globalThis.fetch = (async () => {
      hit++;
      return hit === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "later" } })
        : new Response("ok", { status: 200 });
    }) as typeof fetch;
    expect((await politeFetch("https://e6.edu/sitemap.xml")).status).toBe(200);
  });

  it("does not retry a 404 — the page is simply not there", async () => {
    let hit = 0;
    globalThis.fetch = (async () => {
      hit++;
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    expect((await politeFetch("https://e3.edu/sitemap.xml")).status).toBe(404);
    expect(hit).toBe(1);
  });

  it("sends a browser-shaped request and lets the caller override any header", async () => {
    const calls = stubFetch([[/.*/, () => new Response("ok")]]);
    await politeFetch(
      "https://e4.edu/",
      { headers: { "Accept-Language": "de-DE" } },
      { referer: "https://e4.edu/courses" },
    );
    expect(calls[0].headers["User-Agent"]).toMatch(/Mozilla\/5\.0/);
    expect(calls[0].headers["Referer"]).toBe("https://e4.edu/courses");
    expect(calls[0].headers["Accept-Language"]).toBe("de-DE");
  });
});

describe("discoverUrlsForCrawl", () => {
  it("prefers the map, and asks for subdomains because catalogues live there", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    const calls = stubFetch([
      [/v2\/map/, () => json({ links: ["https://f1.edu/a", "https://f1.edu/b"] })],
    ]);
    const res = await discoverUrlsForCrawl("https://f1.edu");
    expect(res).toEqual({ urls: ["https://f1.edu/a", "https://f1.edu/b"], method: "map" });
    expect(calls[0].body).toMatchObject({ includeSubdomains: true });
  });

  it("does not accept a one-URL map as a discovery — that is the seed, not a crawl", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map/, () => json({ links: ["https://f2.edu"] })],
      [/sitemap|robots/, () => new Response("nope", { status: 404 })],
      [/firecrawl\.dev\/v1\/scrape/, () => json({ data: { markdown: THIN_PAGE, links: [] } })],
    ]);
    const res = await discoverUrlsForCrawl("https://f2.edu");
    expect(res.method).toBe("seed-only");
    expect(res.urls).toEqual(["https://f2.edu"]);
  });

  it("reads the sitemap, following a sitemap index one level down", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map|v1\/map/, () => json({ error: "insufficient credits" }, 402)],
      [
        /f3\.edu\/sitemap\.xml/,
        () =>
          new Response(
            `<sitemapindex><sitemap><loc>https://f3.edu/sitemap-courses.xml</loc></sitemap></sitemapindex>`,
          ),
      ],
      [
        /sitemap-courses\.xml/,
        () =>
          new Response(
            `<urlset><url><loc>https://f3.edu/course/nursing</loc></url><url><loc>https://f3.edu/course/law</loc></url></urlset>`,
          ),
      ],
      [/.*/, () => new Response("nope", { status: 404 })],
    ]);
    const res = await discoverUrlsForCrawl("https://f3.edu");
    expect(res.method).toBe("sitemap");
    expect(res.urls).toEqual(["https://f3.edu/course/nursing", "https://f3.edu/course/law"]);
    // The map's failure reason survives, so the admin sees why it fell back.
    expect(res.error).toBe("insufficient credits");
  });

  it("reads the sitemap named in robots.txt when the usual paths 404", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map|v1\/map/, () => json({ error: "no" }, 400)],
      [/f7\.edu\/robots\.txt/, () => new Response("Sitemap: https://f7.edu/sm/all.xml\n")],
      [
        /f7\.edu\/sm\/all\.xml/,
        () =>
          new Response(
            `<urlset><url><loc>https://f7.edu/a</loc></url><url><loc>https://f7.edu/b</loc></url></urlset>`,
          ),
      ],
      [/.*/, () => new Response("nope", { status: 404 })],
    ]);
    const res = await discoverUrlsForCrawl("https://f7.edu");
    expect(res.method).toBe("sitemap");
    expect(res.urls).toEqual(["https://f7.edu/a", "https://f7.edu/b"]);
  });

  it("ignores a sitemap that is not XML at all", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map|v1\/map/, () => json({ error: "no" }, 400)],
      [/f8\.edu\/sitemap\.xml/, () => new Response("<html>404 page, served with a 200</html>")],
      [/firecrawl\.dev\/v1\/scrape/, () => json({ data: { markdown: THIN_PAGE, links: [] } })],
      [/.*/, () => new Response("nope", { status: 404 })],
    ]);
    const res = await discoverUrlsForCrawl("https://f8.edu");
    expect(res.method).toBe("seed-only");
  });

  it("returns the seed alone for a URL it cannot even parse", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map|v1\/map/, () => json({ error: "no" }, 400)],
      [/.*/, () => new Response("nope", { status: 404 })],
    ]);
    const res = await discoverUrlsForCrawl("not-a-url");
    expect(res).toMatchObject({ urls: ["not-a-url"], method: "seed-only" });
  });

  it("falls back to links scraped off the seed page", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map|v1\/map/, () => json({ error: "no links" }, 400)],
      [/firecrawl\.dev\/v1\/scrape/, () => json({ data: { markdown: REAL_PAGE, links: ["https://f4.edu/a", "https://f4.edu/b"] } })],
      [/.*/, () => new Response("nope", { status: 404 })],
    ]);
    const res = await discoverUrlsForCrawl("https://f4.edu");
    expect(res.method).toBe("page-links");
    expect(res.urls).toHaveLength(2);
  });

  it("finds the catalogue subdomain when the seed's own sitemap is a brochure", async () => {
    // stanford.edu's www sitemap lists 27 pages and not one course; catalog.mit.edu
    // has 437. So a catalogue subdomain with a sitemap is read, and one that answers
    // on / but 404s its sitemap is still handed back as an entry point.
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map|v1\/map/, () => json({ error: "insufficient credits" }, 402)],
      [
        /catalog\.f6\.edu\/sitemap\.xml/,
        () =>
          new Response(
            `<urlset><url><loc>https://catalog.f6.edu/course/nursing</loc></url><url><loc>https://catalog.f6.edu/course/law</loc></url></urlset>`,
          ),
      ],
      [/^https:\/\/bulletin\.f6\.edu$/, () => new Response("<html>Bulletin</html>")],
      [/.*/, () => new Response("nope", { status: 404 })],
    ]);
    const res = await discoverUrlsForCrawl("https://www.f6.edu");
    expect(res.method).toBe("sitemap");
    expect(res.urls).toContain("https://catalog.f6.edu/course/nursing");
    expect(res.urls).toContain("https://bulletin.f6.edu");
  });

  it("carries the insufficient-credits flag out to the caller on the last resort", async () => {
    config.FIRECRAWL_API_KEY = "fc-key";
    stubFetch([
      [/v2\/map|v1\/map/, () => json({ error: "Insufficient credits" }, 402)],
      [/firecrawl\.dev\/v1\/scrape/, () => json({ data: { markdown: "", links: [] } })],
      [/.*/, () => new Response("nope", { status: 404 })],
    ]);
    const res = await discoverUrlsForCrawl("https://f5.edu");
    expect(res).toMatchObject({ method: "seed-only", insufficientCredits: true });
  });
});
