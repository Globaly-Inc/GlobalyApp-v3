// Hotcourses / IDP aggregator provider.

import type { AggregatorProvider, AggregatorResult, ScrapeFn } from "./types.js";
import { extractJson } from "../llm-client.js";
import { createChildLogger } from "../../../../../shared/logger.js";

const logger = createChildLogger("aggregator-hotcourses");

const COURSE_URL_RE = /hotcoursesabroad\.com\/study\/.+\/program\.html|idp\.com\/.+\/program\.html/;
const INSTITUTION_URL_RE = /hotcoursesabroad\.com\/study\/.+\/international\.html|idp\.com\/.+\/international\.html/;

function isCourseDetailUrl(url: string): boolean {
  return COURSE_URL_RE.test(url);
}

interface AiExtraction {
  institution_name?: string;
  description?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  courses: Array<{ name: string; url: string }>;
}

const SYSTEM_PROMPT = `You are a data extraction assistant for Hotcourses/IDP education aggregator pages.
Extract:
1. Institution metadata (name, description, website, city, state, country)
2. All course cards — each with its course name and absolute URL

For course URLs:
- Only include URLs linking to individual course/program detail pages.
- Every URL MUST be absolute (https://).
- Do NOT include navigation, search, enquiry, or pagination links.
- If a URL is relative, prepend the domain from the source URL.

Return JSON: { institution_name, description, website, city, state, country, courses: [{ name, url }] }`;

async function extractFromPage(markdown: string, pageUrl: string): Promise<AiExtraction> {
  return extractJson<AiExtraction>({
    system: SYSTEM_PROMPT,
    prompt: `Extract institution info and all course cards from this Hotcourses/IDP listing page.\nSource URL: ${pageUrl}\n\nPage content:\n${markdown.substring(0, 25000)}`,
  });
}

function filterCourseLinks(links: string[]): string[] {
  return links.filter((l) => {
    try {
      return isCourseDetailUrl(new URL(l).href);
    } catch {
      return false;
    }
  });
}

export const hotcourses: AggregatorProvider = {
  id: "hotcourses",
  name: "Hotcourses",

  detect(url: string): boolean {
    return /hotcoursesabroad\.com/.test(url) || /idp\.com/.test(url);
  },

  async extractListing(url: string, scrape: ScrapeFn): Promise<AggregatorResult> {
    const allCourseUrls = new Set<string>();
    const institution: AggregatorResult["institution"] = {};

    // Hotcourses doesn't paginate like portals — the institution page is the listing
    const listingUrls = [url];

    for (const listingUrl of listingUrls) {
      logger.info("Scraping listing page", { url: listingUrl });
      const { markdown, links } = await scrape(listingUrl);

      if (!markdown && links.length === 0) {
        logger.warn("Empty response", { url: listingUrl });
        continue;
      }

      // Direct link filtering
      const courseLinks = filterCourseLinks(links.filter((l) => l.startsWith("http")));
      for (const u of courseLinks) allCourseUrls.add(u);

      // LLM extraction for metadata + named courses
      if (markdown.length > 200) {
        const ai = await extractFromPage(markdown, listingUrl);

        if (!institution.name && ai.institution_name) {
          Object.assign(institution, {
            name: ai.institution_name,
            description: ai.description,
            website: ai.website,
            city: ai.city,
            state: ai.state,
            country: ai.country,
          });
        }

        for (const c of ai.courses) {
          if (c.url?.startsWith("http")) allCourseUrls.add(c.url);
        }
        logger.info("AI extracted courses", { count: ai.courses.length, url: listingUrl });
      }
    }

    logger.info("Total unique courses", { count: allCourseUrls.size });
    return { institution, courseUrls: [...allCourseUrls] };
  },
};
