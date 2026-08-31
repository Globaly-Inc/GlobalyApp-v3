// Worker — consumes "extraction_steps" queue.
// Routes admin-triggered step re-runs: institution, branches, agents,
// discovery, courses, enrichment, verification, course_data.
//
// Run with: npm run job:extraction-step

import "dotenv/config";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { scrapeMarkdown, scrapeRenderedHtml, mapUrlsDetailed } from "../lib/scraper.js";
import { truncateMarkdown, domainOf } from "../lib/html-utils.js";
import { extractJson } from "../lib/llm-client.js";
import {
  institutionExtractionPrompt, INSTITUTION_EXTRACTION_SYSTEM,
  campusExtractionPrompt, CAMPUS_EXTRACTION_SYSTEM,
  agentExtractionPrompt, AGENT_EXTRACTION_SYSTEM,
  courseListPrompt, COURSE_LIST_SYSTEM,
  bulkFeePrompt, BULK_FEE_SYSTEM,
  courseDataPrompt, COURSE_DATA_SYSTEM,
  visaServiceExtractionPrompt, VISA_SERVICE_EXTRACTION_SYSTEM,
} from "../lib/extraction-prompts.js";
import {
  writeInstitutionOverview,
  replaceCampuses,
  upsertAgent,
  writeAgentLocations,
  insertQueueItem,
  writeJobEvent,
  normaliseCampusName,
  upsertStudyUnit,
  normaliseCourseCategory,
  normaliseScoreType,
  deriveScoreFromDescription,
  coerceMoney,
  writeVisaService,
  updateVisaServiceById,
  normaliseVisaServiceName,
  type ExtractedCampus,
  type InstitutionOverview,
  type ExtractedVisaService,
} from "../lib/staging-writer.js";
import { parseAddress } from "../lib/address-parser.js";
import { normalizeAgentRow } from "../lib/agent-normalizers.js";
import { recallMemory, rememberMemory, buildSystemAddendum } from "../lib/memory-client.js";
import { detectAgentSource } from "../lib/agent-sources/index.js";
import type { AgentRow as AgentSourceRow } from "../lib/agent-sources/types.js";
import { parseAgentRowsFromHtml } from "../lib/agent-table-parser.js";
import { enrichAgents } from "../lib/agent-enrichment.js";
import { matchFeesToCourses } from "../lib/fee-matcher.js";
import { parseInstallments } from "../lib/installment-parser.js";
import { createDocumentExtractor, buildDocumentContext, type DocInput } from "../lib/document-extractor.js";
import type { PipelineStep, CourseDataType } from "../schemas/step.schema.js";

import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const logger = createChildLogger("extraction-step-worker");

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseGuidedUrls(job: Record<string, unknown>): Record<string, unknown> {
  if (!job.guided_urls) return Object.create(null) as Record<string, unknown>;
  return typeof job.guided_urls === "string" ? JSON.parse(job.guided_urls as string) : job.guided_urls as Record<string, unknown>;
}

async function loadJob(jobId: string) {
  return masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
}

async function heartbeat(jobId: string) {
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    processing_heartbeat_at: masterKnex.fn.now(),
  });
}

async function markStepProgress(jobId: string, step: string, status: string) {
  const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).first();
  const progress = typeof job?.pipeline_progress === "string"
    ? JSON.parse(job.pipeline_progress)
    : (job?.pipeline_progress || {});
  progress[step] = status;
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
    pipeline_progress: JSON.stringify(progress),
    updated_at: masterKnex.fn.now(),
  });
}

async function scrapeUrl(url: string): Promise<string | null> {
  const r = await scrapeMarkdown(url, { onlyMainContent: true });
  return r.markdown && r.markdown.length > 50 ? r.markdown : null;
}

async function scrapeInstitutionPage(url: string): Promise<{ markdown: string; links: string[] } | null> {
  const r = await scrapeMarkdown(url, { onlyMainContent: false, withLinks: true });
  return r.markdown && r.markdown.length > 50 ? { markdown: r.markdown, links: r.links } : null;
}

const PRIVATE_IPV4_RANGES = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\.0\.0\.0$/, /^172\.(1[6-9]|2\d|3[01])\./];

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return PRIVATE_IPV4_RANGES.some((re) => re.test(h));
}

async function resolvesToPrivateHost(hostname: string): Promise<boolean> {
  try {
    const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    return records.some((r) => isPrivateOrLocalHost(r.address));
  } catch {
    // Can't confirm where it points — fail closed rather than scrape an unresolvable host.
    return true;
  }
}

async function findContactLink(markdown: string, links: string[], origin: string): Promise<string | null> {
  const anchor = markdown.match(/\[([^\]]*(?:contact|get in touch|enquir)[^\]]*)\]\((https?:\/\/[^)\s]+)\)/i);
  const candidate = anchor?.[2] ?? links.find((l) => /\/(contact(-us)?|get-in-touch|enquir(y|ies))\/?$/i.test(l)) ?? null;
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.origin !== origin || isPrivateOrLocalHost(url.hostname)) return null;
  if (await resolvesToPrivateHost(url.hostname)) return null;

  return candidate;
}

function sha1(...parts: (string | null | undefined)[]): string {
  return createHash("sha1").update(parts.map(p => p ?? "").join("|")).digest("hex");
}

/** Detect paginated sibling pages from links (DataTables, ?page=N, /page/N). Ported from V2. */
function detectPaginationUrls(baseUrl: string, links: string[], markdown: string): string[] {
  let baseObj: URL | null = null;
  try { baseObj = new URL(baseUrl); } catch { return []; }
  const pageNums = new Set<number>();
  for (const l of links) {
    const m = l.match(/[?&]page=(\d+)|\/page\/(\d+)/i);
    if (m) { const n = parseInt(m[1] || m[2], 10); if (n >= 1 && n <= 1000) pageNums.add(n); }
  }
  // DataTables "Showing 1 to 10 of 486 entries"
  const dtMatch = markdown.match(/Showing\s+\d+\s+to\s+(\d+)\s+of\s+(\d+)\s+entries/i);
  if (dtMatch) {
    const perPage = parseInt(dtMatch[1], 10);
    const total = parseInt(dtMatch[2], 10);
    if (perPage > 0 && total > perPage) {
      for (let i = 2; i <= Math.ceil(total / perPage); i++) pageNums.add(i);
    }
  }
  if (!baseObj || pageNums.size === 0) return [];
  const out: string[] = [];
  Array.from(pageNums).forEach(n => {
    if (n === 1) return;
    const u = new URL(baseObj!.toString());
    u.searchParams.set("page", String(n));
    out.push(u.toString());
  });
  return out.sort((a, b) => {
    const pa = parseInt(new URL(a).searchParams.get("page") || "0", 10);
    const pb = parseInt(new URL(b).searchParams.get("page") || "0", 10);
    return pa - pb;
  });
}

/** 3-layer campus dedup matching V2: street-number filter → name dedup → address dedup. */
function dedupCampuses(campuses: ExtractedCampus[]): ExtractedCampus[] {
  // Layer 1: must have a digit in address (street number)
  const withAddress = campuses.filter(c => c.address && /\d/.test(c.address));
  // Layer 2: name-based dedup — keep entry with most fields
  const byName = new Map<string, ExtractedCampus>();
  const noName: ExtractedCampus[] = [];
  for (const c of withAddress) {
    const key = c.name ? c.name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "") : "";
    if (!key) { noName.push(c); continue; }
    const existing = byName.get(key);
    if (!existing) { byName.set(key, c); continue; }
    if (Object.values(c).filter(v => v != null && v !== "").length >
        Object.values(existing).filter(v => v != null && v !== "").length) byName.set(key, c);
  }
  // Layer 3: address-based dedup
  const afterName = Array.from(byName.values()).concat(noName);
  const seenAddr = new Set<string>();
  const final: ExtractedCampus[] = [];
  for (const c of afterName) {
    const addrKey = `${c.address || ""}${c.city || ""}${c.state || ""}`
      .toLowerCase().replace(/\bstreet\b/g, "st").replace(/\broad\b/g, "rd")
      .replace(/\bavenue\b/g, "ave").replace(/\bdrive\b/g, "dr").replace(/[^a-z0-9]/g, "");
    if (!addrKey || !seenAddr.has(addrKey)) {
      if (addrKey) seenAddr.add(addrKey);
      final.push(c);
    }
  }
  return final;
}

/** Map URLs under a path prefix via Firecrawl map API. */
async function mapUrlsUnderPath(baseOrigin: string, pathPrefix: string): Promise<string[]> {
  const result = await mapUrlsDetailed(`${baseOrigin}${pathPrefix}`, { limit: 50 });
  if (!result.success) return [];
  return result.links.filter(u => {
    try {
      const p = new URL(u);
      return p.origin === baseOrigin && p.pathname.startsWith(pathPrefix)
        && p.pathname.replace(pathPrefix, "").replace(/\/$/, "").length > 0;
    } catch { return false; }
  });
}

/** Convert raw LLM agent output to AgentSourceRow for enrichment pipeline. */
function llmAgentToSourceRow(raw: Record<string, unknown>): AgentSourceRow | null {
  const name = (raw.name as string) || "";
  if (!name.trim()) return null;
  return {
    name, country: (raw.country as string) || null,
    email: (raw.email as string) || null, phone: (raw.phone as string) || null,
    website: (raw.website as string) || null, address: (raw.address as string) || null,
    street1: (raw.street1 as string) || null, street2: (raw.street2 as string) || null,
    city: (raw.city as string) || null, state: (raw.state as string) || null,
    postcode: (raw.postcode as string) || null,
    external_id: null, location_count: 1,
  };
}

// ── Step handlers ───────────────────────────────────────────────────────────

async function handleInstitutionStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const guided = parseGuidedUrls(job);
  const contactUrls: string[] = (guided.contact_urls as string[]) || [];

  const baseUrl = job.institution_url;
  const origin = (() => {
    try { return new URL(baseUrl).origin; } catch { return null; }
  })();

  const homepage = await scrapeInstitutionPage(baseUrl);
  const discoveredContact = homepage && origin ? await findContactLink(homepage.markdown, homepage.links, origin) : null;
  const guessContact = origin ? new URL("/contact", origin).href : null;

  const urlsToScrape = [...new Set([
    baseUrl,
    ...contactUrls,
    ...(contactUrls.length === 0 ? [discoveredContact, guessContact].filter((u): u is string => !!u) : []),
  ])];

  await writeJobEvent(jobId, "step_start", { phase: "institution", message: `Scraping ${urlsToScrape.length} URLs for institution data` });

  // Recall memory
  const domain = domainOf(baseUrl);
  const recalled = await recallMemory(domain, "institution");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${INSTITUTION_EXTRACTION_SYSTEM}\n\n${addendum}` : INSTITUTION_EXTRACTION_SYSTEM;

  // Scrape the rest in parallel — the homepage was already scraped above, reuse it instead
  // of scraping it again.
  const scrapeResults = await Promise.all(
    urlsToScrape.map((u) =>
      u === baseUrl ? Promise.resolve(homepage?.markdown ?? null) : scrapeInstitutionPage(u).then((r) => r?.markdown ?? null),
    ),
  );
  const scrapedPairs: { url: string; markdown: string }[] = [];
  for (let i = 0; i < urlsToScrape.length; i++) {
    if (scrapeResults[i]) scrapedPairs.push({ url: urlsToScrape[i], markdown: scrapeResults[i]! });
  }

  if (scrapedPairs.length === 0) {
    throw new Error("Failed to scrape any pages for institution data");
  }

  // LLM per page → merge (first non-null per field)
  let merged: Record<string, unknown> = {};
  for (const { url, markdown } of scrapedPairs) {
    await heartbeat(jobId);
    const pageText = truncateMarkdown(markdown, 25000);
    const data = await extractJson<Record<string, unknown>>({
      system,
      prompt: institutionExtractionPrompt(url, pageText, job.guidance_notes),
    });
    for (const [key, val] of Object.entries(data)) {
      if (val != null && val !== "" && (merged[key] == null || merged[key] === "")) {
        merged[key] = val;
      }
    }
  }

  // Process supporting documents (PDFs/files attached to the job)
  const docs: DocInput[] = Array.isArray(job.supporting_documents) ? job.supporting_documents : [];
  if (docs.length > 0) {
    const docExtractor = createDocumentExtractor();
    const docContext = await buildDocumentContext(docExtractor, docs, 30000);
    if (docContext.length > 200) {
      await heartbeat(jobId);
      const docData = await extractJson<Record<string, unknown>>({
        system,
        prompt: institutionExtractionPrompt("supporting-documents", docContext, job.guidance_notes),
      });
      for (const [key, val] of Object.entries(docData)) {
        if (val != null && val !== "" && (merged[key] == null || merged[key] === "")) {
          merged[key] = val;
        }
      }
    }
  }

  // Preserve existing manual edits
  const existing = await masterKnex(`${S}.extraction_institution_overview`)
    .where({ job_id: jobId }).first();

  if (existing) {
    for (const [key, val] of Object.entries(existing)) {
      if (["id", "job_id", "created_at", "updated_at", "source_url"].includes(key)) continue;
      if ((merged[key] == null || merged[key] === "") && val != null && val !== "") {
        merged[key] = val;
      }
    }
    merged.source_url = baseUrl;
    await masterKnex(`${S}.extraction_institution_overview`).where({ id: existing.id }).update({
      ...merged, updated_at: masterKnex.fn.now(),
    });
  } else {
    merged.source_url = baseUrl;
    await writeInstitutionOverview(jobId, merged as InstitutionOverview);
  }

  // If name found and job.institution_name null, update job
  if (merged.name && !job.institution_name) {
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      institution_name: merged.name as string,
    });
  }

  // Remember
  await rememberMemory({
    job_id: jobId, domain, step: "institution",
    entity_type: "institution", source_url: baseUrl,
    source_excerpt: scrapedPairs[0]?.markdown.slice(0, 500),
    ai_output: merged,
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "institution",
    message: `Institution data extracted from ${scrapedPairs.length} pages`,
    data: { fields_filled: Object.keys(merged).filter(k => merged[k] != null).length },
  });
}

async function handleBranchesStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const guided = parseGuidedUrls(job);
  const branchUrls: string[] = (guided.branches_urls as string[]) || [];
  const origin = (() => {
    try { return new URL(job.institution_url).origin; } catch { return ""; }
  })();

  await writeJobEvent(jobId, "step_start", { phase: "branches", message: "Extracting campuses (3-phase discovery)" });

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "branches");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${CAMPUS_EXTRACTION_SYSTEM}\n\n${addendum}` : CAMPUS_EXTRACTION_SYSTEM;

  let allCampuses: ExtractedCampus[] = [];

  // ── Phase 1: Guided URLs or authoritative overview/contact pages ──
  const overviewPaths = ["/contact", "/contact-us", "/campuses", "/locations",
    "/our-campuses", "/study-locations", "/campus", "/our-locations"];
  const phase1Urls = branchUrls.length > 0
    ? branchUrls
    : overviewPaths.map(p => `${origin}${p}`);

  const phase1Results = await Promise.all(phase1Urls.map(u => scrapeUrl(u)));
  const validPages = phase1Urls
    .map((url, i) => ({ url, markdown: phase1Results[i] }))
    .filter(p => p.markdown && p.markdown.length > 500);

  if (validPages.length > 0) {
    // Use first valid page (contact pages listed first = highest priority)
    const best = validPages[0];
    await heartbeat(jobId);
    const result = await extractJson<{ campuses: ExtractedCampus[] }>({
      system,
      prompt: campusExtractionPrompt(best.url, truncateMarkdown(best.markdown!, 15000)),
    });
    if (result.campuses?.length) allCampuses.push(...result.campuses);
    logger.info("Phase 1 campus extraction", { count: allCampuses.length, url: best.url });
  }

  // ── Phase 2: Discover + scrape individual campus sub-pages ──
  if (allCampuses.length === 0 && branchUrls.length === 0) {
    const subPagePaths = ["/campuses", "/locations", "/our-campuses",
      "/study-locations", "/campus", "/our-locations"];
    let subPageUrls: string[] = [];
    for (const sp of subPagePaths) {
      subPageUrls = await mapUrlsUnderPath(origin, sp);
      if (subPageUrls.length > 0) {
        logger.info("Phase 2: found sub-pages", { count: subPageUrls.length, path: sp });
        break;
      }
    }

    if (subPageUrls.length > 0 && subPageUrls.length <= 15) {
      const subResults = await Promise.all(subPageUrls.map(u => scrapeUrl(u)));
      const validSubs = subPageUrls
        .map((url, i) => ({ url, markdown: subResults[i] }))
        .filter(p => p.markdown && p.markdown.length > 300);

      for (const { url, markdown } of validSubs) {
        await heartbeat(jobId);
        // Single campus mode: at most 1 entry per sub-page
        const result = await extractJson<{ campuses: ExtractedCampus[] }>({
          system,
          prompt: campusExtractionPrompt(url, truncateMarkdown(markdown!, 15000), true),
        });
        if (result.campuses?.length) allCampuses.push(result.campuses[0]);
      }
      logger.info("Phase 2 sub-page extraction", { count: allCampuses.length });
    }
  }

  // ── Phase 3: Fallback to homepage + /about ──
  if (allCampuses.length === 0) {
    const fallbackUrls = [job.institution_url, `${origin}/about`];
    for (const url of fallbackUrls) {
      await heartbeat(jobId);
      const markdown = await scrapeUrl(url);
      if (!markdown) continue;
      const result = await extractJson<{ campuses: ExtractedCampus[] }>({
        system,
        prompt: campusExtractionPrompt(url, truncateMarkdown(markdown, 15000), true),
      });
      if (result.campuses?.length) { allCampuses.push(...result.campuses); break; }
    }
  }

  // parseAddress on each result for structured fields
  for (const campus of allCampuses) {
    if (campus.address) {
      const parsed = parseAddress(campus.address, campus.country);
      if (!campus.city && parsed.city) campus.city = parsed.city;
      if (!campus.state && parsed.state) campus.state = parsed.state;
      if (!campus.country && parsed.country) campus.country = parsed.country;
    }
  }

  // 3-layer dedup (street filter → name → address)
  const deduped = dedupCampuses(allCampuses);
  logger.info("Campus dedup", { raw: allCampuses.length, final: deduped.length });

  // Replace existing campuses, re-link junctions
  const idMap = await replaceCampuses(jobId, deduped);

  await rememberMemory({
    job_id: jobId, domain, step: "branches",
    entity_type: "campus",
    ai_output: deduped,
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "branches",
    message: `${idMap.size} campuses extracted (3-phase discovery, ${allCampuses.length} raw → ${deduped.length} deduped)`,
    data: { count: idMap.size, raw: allCampuses.length },
  });
}

async function handleAgentsStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const guided = parseGuidedUrls(job);
  const agentUrls: string[] = (guided.agents_urls as string[]) || [];
  if (agentUrls.length === 0) throw new Error("No agents_urls provided in guided_urls");

  await writeJobEvent(jobId, "step_start", { phase: "agents", message: `Extracting agents from ${agentUrls.length} URLs` });

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "agents");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${AGENT_EXTRACTION_SYSTEM}\n\n${addendum}` : AGENT_EXTRACTION_SYSTEM;

  const allRawAgents: AgentSourceRow[] = [];
  let pagesScraped = 0;
  const maxPages = 100;

  for (const seedUrl of agentUrls) {
    const sc = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
    if (sc?.stop_requested) { logger.info("Stop requested, aborting", { jobId }); return; }
    await heartbeat(jobId);

    // Scrape markdown (with links for pagination detection)
    const scrapeResult = await scrapeMarkdown(seedUrl, { onlyMainContent: false, withLinks: true });
    const markdown = scrapeResult.markdown && scrapeResult.markdown.length > 50 ? scrapeResult.markdown : null;

    // ── 1. Provider detection (AscentOne, StudyLink, iframe) ──
    const { html: renderedHtml } = await scrapeRenderedHtml(seedUrl);
    const detected = detectAgentSource(seedUrl, renderedHtml || undefined);
    if (detected) {
      logger.info("Agent provider detected", { provider: detected.provider.id, url: seedUrl });
      const provResult = await detected.provider.fetch(detected.detection);
      if (provResult && provResult.agents.length > 0) {
        allRawAgents.push(...provResult.agents);
        pagesScraped++;
        continue; // Provider handles its own pagination internally
      }
    }

    // ── 2. HTML table parsing fast path ──
    let foundFromTable = false;
    if (renderedHtml) {
      const tableRows = parseAgentRowsFromHtml(renderedHtml);
      if (tableRows.length >= 2) {
        logger.info("Parsed agents from HTML table", { count: tableRows.length, url: seedUrl });
        allRawAgents.push(...tableRows);
        pagesScraped++;
        foundFromTable = true;
      }
    }

    // ── 3. LLM fallback ──
    if (!foundFromTable && markdown) {
      const pageText = truncateMarkdown(markdown, 20000);
      const result = await extractJson<{ agents: Record<string, unknown>[] }>({
        system,
        prompt: agentExtractionPrompt(seedUrl, pageText, job.institution_name),
      });
      for (const raw of (result.agents || [])) {
        const row = llmAgentToSourceRow(raw);
        if (row) allRawAgents.push(row);
      }
      pagesScraped++;
    }

    // ── 4. Pagination — iterate additional pages (table or LLM) ──
    if (pagesScraped < maxPages && markdown) {
      const pageUrls = detectPaginationUrls(seedUrl, scrapeResult.links, markdown);
      for (const pageUrl of pageUrls) {
        if (pagesScraped >= maxPages) break;
        const sc2 = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
        if (sc2?.stop_requested) break;
        await heartbeat(jobId);

        if (foundFromTable) {
          // Paginated table pages — fetch HTML and parse
          const { html: pageHtml } = await scrapeRenderedHtml(pageUrl);
          if (pageHtml) {
            const rows = parseAgentRowsFromHtml(pageHtml);
            if (rows.length > 0) { allRawAgents.push(...rows); pagesScraped++; continue; }
          }
        }
        // LLM on paginated page
        const pageMd = await scrapeUrl(pageUrl);
        if (pageMd) {
          const result = await extractJson<{ agents: Record<string, unknown>[] }>({
            system,
            prompt: agentExtractionPrompt(pageUrl, truncateMarkdown(pageMd, 20000), job.institution_name),
          });
          for (const raw of (result.agents || [])) {
            const row = llmAgentToSourceRow(raw);
            if (row) allRawAgents.push(row);
          }
          pagesScraped++;
        }
      }
    }
  }

  // ── Enrichment: address parsing (heuristic + AI fallback), website derivation ──
  const enrichStats = await enrichAgents(allRawAgents);
  logger.info("Agent enrichment complete", enrichStats);

  // ── Write to DB ──
  let totalAgents = 0;
  for (const agent of allRawAgents) {
    if (!agent.name?.trim()) continue;
    const normalized = normalizeAgentRow(agent as any);
    const externalId = agent.external_id || sha1(agent.name, normalized.country, normalized.email, agent.website);

    const agentData: Record<string, unknown> = {
      name: agent.name, country: normalized.country, state: normalized.state,
      city: normalized.city, address: normalized.address, postcode: normalized.postcode,
      phone: normalized.phone, email: normalized.email,
      website: normalized.website || agent.website,
      source_url: agentUrls[0],
    };

    const agentId = await upsertAgent(jobId, agentData, externalId);

    // Write locations — from provider data or single location
    const locs = agent.locations?.length
      ? agent.locations.map(l => ({ country: l.country, state: l.state, city: l.city, address: l.address, postcode: l.postcode }))
      : (normalized.city || normalized.country)
        ? [{ country: normalized.country, state: normalized.state, city: normalized.city, address: normalized.address, postcode: normalized.postcode }]
        : [];
    if (locs.length) await writeAgentLocations(agentId, jobId, locs);
    totalAgents++;
  }

  // Write run history
  await masterKnex(`${S}.extraction_agent_extraction_runs`).insert({
    job_id: jobId, source: "step_worker",
    urls_scraped: pagesScraped, agents_found: totalAgents,
    status: "completed",
  });

  await rememberMemory({
    job_id: jobId, domain, step: "agents",
    entity_type: "agent",
    ai_output: { total: totalAgents, pages: pagesScraped, ...enrichStats },
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "agents",
    message: `${totalAgents} agents extracted from ${pagesScraped} pages (${enrichStats.addresses_ai_parsed} AI-parsed addresses)`,
    data: { count: totalAgents, pages: pagesScraped, ...enrichStats },
  });
}

async function handleDiscoveryStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const guided = parseGuidedUrls(job);
  const courseListUrls: string[] = (guided.course_list_urls as string[]) || [];

  if (courseListUrls.length === 0) {
    throw new Error("No course_list_urls provided in guided_urls — use the main job worker for automatic discovery");
  }

  await writeJobEvent(jobId, "step_start", { phase: "discovery", message: `Discovering courses from ${courseListUrls.length} catalogue URLs` });

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "discovery");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${COURSE_LIST_SYSTEM}\n\n${addendum}` : COURSE_LIST_SYSTEM;

  let totalCoursePages = 0;
  // ponytail: depth-2 recursion for category listings, simple loop instead of recursion
  const maxDepth = 2;

  async function processListUrl(url: string, depth: number) {
    if (depth > maxDepth) return;
    await heartbeat(jobId);

    const markdown = await scrapeUrl(url);
    if (!markdown) return;

    const pageText = truncateMarkdown(markdown, 30000);
    const result = await extractJson<{
      is_category_listing: boolean;
      category_urls: string[];
      courses: Array<{ name: string; url?: string; degree_level?: string }>;
    }>({
      system,
      prompt: courseListPrompt(url, pageText),
      maxTokens: 32768,
    });

    if (result.is_category_listing && result.category_urls?.length) {
      // Recurse into category pages
      for (const catUrl of result.category_urls) {
        await processListUrl(catUrl, depth + 1);
      }
      return;
    }

    // Real courses found — queue each for extraction. Re-running this step re-scrapes
    // every course_list_url (including ones a prior run already processed) so a newly
    // added guided URL gets picked up — skip courses already queued for this job instead
    // of re-queuing/re-extracting duplicates on every re-run.
    if (result.courses?.length) {
      for (const course of result.courses) {
        const courseUrl = course.url || url;
        const dup = await masterKnex(`${S}.extraction_queue`).where({ job_id: jobId, url: courseUrl }).first("id");
        if (dup) continue;
        const queueItemId = await insertQueueItem(jobId, courseUrl);
        await queueService.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId, url: courseUrl });
        totalCoursePages++;
      }
    }
  }

  for (const url of courseListUrls) {
    // ponytail: stop check per catalogue URL
    const sc = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
    if (sc?.stop_requested) { logger.info("Stop requested, aborting", { jobId }); return; }

    await processListUrl(url, 0);
  }

  // Update total_pages_found
  if (totalCoursePages > 0) {
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      total_pages_found: masterKnex.raw("COALESCE(total_pages_found, 0) + ?", [totalCoursePages]),
      updated_at: masterKnex.fn.now(),
    });
  }

  await writeJobEvent(jobId, "step_complete", {
    phase: "discovery",
    message: `${totalCoursePages} course pages queued for extraction`,
    data: { count: totalCoursePages },
  });
}

// The Context tab's intakes_urls/eligibility_urls/units_urls/accreditations_urls guided
// categories all dispatch to this one step.
const COURSES_STEP_GUIDED_CATEGORIES = ["intakes_urls", "eligibility_urls", "units_urls", "accreditations_urls"] as const;

async function handleCoursesStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  // Re-dispatch all pending/failed queue items to PAGES queue
  const items = await masterKnex(`${S}.extraction_queue`)
    .where({ job_id: jobId })
    .whereIn("status", ["pending", "failed"])
    .select("id", "url");

  await writeJobEvent(jobId, "step_start", { phase: "courses", message: `Re-dispatching ${items.length} pending/failed pages` });

  for (const item of items) {
    await masterKnex(`${S}.extraction_queue`).where({ id: item.id }).update({
      status: "pending", updated_at: masterKnex.fn.now(),
    });
    await queueService.publish(EXTRACTION_QUEUES.PAGES, {
      jobId, queueItemId: item.id, url: item.url,
    });
  }

  // Real bug: this step never looked at guided_urls at all, so adding a new URL under
  // Intakes/Eligibility/Study Units/Accreditations in the Context tab and hitting
  // "Re-run" did nothing — no queue item was ever created for it. Queue any guided URL
  // from these four categories not already in this job's queue; the normal per-page
  // pipeline (extraction-page.worker.ts) already extracts all of these entity types from
  // any course page, so no separate extraction logic is needed here.
  const guided = parseGuidedUrls(job);
  const guidedUrls = [...new Set(COURSES_STEP_GUIDED_CATEGORIES.flatMap((k) => (guided[k] as string[]) || []))];
  const existingUrls = guidedUrls.length
    ? new Set((await masterKnex(`${S}.extraction_queue`).where({ job_id: jobId }).whereIn("url", guidedUrls).select("url"))
        .map((r: { url: string }) => r.url))
    : new Set<string>();

  let queuedNew = 0;
  for (const url of guidedUrls) {
    if (existingUrls.has(url)) continue;
    const queueItemId = await insertQueueItem(jobId, url);
    await queueService.publish(EXTRACTION_QUEUES.PAGES, { jobId, queueItemId, url });
    queuedNew++;
  }
  if (queuedNew > 0) {
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      total_pages_found: masterKnex.raw("COALESCE(total_pages_found, 0) + ?", [queuedNew]),
      updated_at: masterKnex.fn.now(),
    });
  }

  await writeJobEvent(jobId, "step_complete", {
    phase: "courses",
    message: `${items.length} pages re-dispatched, ${queuedNew} new guided URLs queued for extraction`,
    data: { count: items.length, new_guided_urls: queuedNew },
  });
}

async function handleEnrichmentStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  await writeJobEvent(jobId, "step_start", { phase: "enrichment", message: "Starting enrichment (bulk fees with fuzzy matching)" });

  const siteIntel = await masterKnex(`${S}.extraction_site_intelligence`)
    .where({ job_id: jobId }).first();

  // Find fee page URL
  const origin = (() => {
    try { return new URL(job.institution_url).origin; } catch { return ""; }
  })();
  const candidatePaths = ["/fees", "/tuition", "/tuition-fees", "/course-fees", "/costs", "/pricing"];
  let feePageText: string | null = null;

  // Real bug: this step never looked at guided_urls.fees_urls at all — adding a Fees
  // guided URL in the Context tab and hitting "Re-run" was silently ignored in favor of
  // site-intelligence guessing and a hardcoded path list. An admin-provided URL is a
  // stronger signal than either, so it wins outright when present.
  const guided = parseGuidedUrls(job);
  const feesUrls: string[] = (guided.fees_urls as string[]) || [];
  if (feesUrls.length > 0) {
    const pages = (await Promise.all(feesUrls.map((u) => scrapeUrl(u)))).filter((md): md is string => !!md);
    if (pages.length > 0) feePageText = pages.join("\n\n");
  }

  // Check site intelligence for high-value pages
  if (!feePageText && siteIntel?.navigation_patterns) {
    const nav = typeof siteIntel.navigation_patterns === "string"
      ? JSON.parse(siteIntel.navigation_patterns)
      : siteIntel.navigation_patterns;
    const hvPages: string[] = nav?.high_value_pages || [];
    const feePath = hvPages.find((p: string) => /fee|tuition|cost|price/i.test(p));
    if (feePath) {
      const url = (() => {
        try { return new URL(feePath, origin).href; } catch { return null; }
      })();
      if (url) feePageText = await scrapeUrl(url);
    }
  }

  // Fallback: try common paths
  if (!feePageText) {
    for (const p of candidatePaths) {
      const url = `${origin}${p}`;
      const md = await scrapeUrl(url);
      if (md && md.length > 500) { feePageText = md; break; }
    }
  }

  if (!feePageText) {
    await writeJobEvent(jobId, "step_complete", {
      phase: "enrichment", message: "Enrichment skipped — no fee page found", level: "warn",
    });
    return;
  }

  // Load courses (with duration for installment calculation)
  const courses = await masterKnex(`${S}.extraction_courses`)
    .where({ job_id: jobId }).select("id", "name", "duration_weeks").orderBy("name");

  if (courses.length === 0) {
    await writeJobEvent(jobId, "step_complete", { phase: "enrichment", message: "No courses to enrich" });
    return;
  }

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "enrichment");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${BULK_FEE_SYSTEM}\n\n${addendum}` : BULK_FEE_SYSTEM;

  const scEnrich = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
  if (scEnrich?.stop_requested) { logger.info("Stop requested, aborting", { jobId }); return; }

  const courseNames = courses.map((c: { name: string }) => c.name);
  const result = await extractJson<{
    fee_schedule: Array<{
      course_name: string;
      domestic_total?: number;
      international_total?: number;
      currency?: string;
      period_type?: string;
    }>;
  }>({
    system,
    prompt: bulkFeePrompt(courseNames, truncateMarkdown(feePageText, 35000), {
      currency: siteIntel?.currency ?? undefined,
      country: siteIntel?.country ?? undefined,
    }),
    maxTokens: 32768,
  });

  // Transform LLM output → FeeEntry[] for fuzzy matcher
  const feeEntries: Array<{ course_name: string; student_type: string; amount: number; currency: string; period: string }> = [];
  for (const entry of (result.fee_schedule || [])) {
    const currency = entry.currency || siteIntel?.currency || "USD";
    const period = entry.period_type || "Per Year";
    if (entry.domestic_total && entry.domestic_total > 0) {
      feeEntries.push({ course_name: entry.course_name, student_type: "domestic", amount: entry.domestic_total, currency, period });
    }
    if (entry.international_total && entry.international_total > 0) {
      feeEntries.push({ course_name: entry.course_name, student_type: "international", amount: entry.international_total, currency, period });
    }
  }

  // Fuzzy match fees to courses (token overlap + Levenshtein, threshold 0.5)
  const courseEntries = courses.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
  const matches = matchFeesToCourses(feeEntries, courseEntries);
  logger.info("Fee fuzzy matching", { feeEntries: feeEntries.length, matches: matches.length, courses: courses.length });

  // Insert matched fees with installment breakdown
  let linked = 0;
  for (const { courseId, fee } of matches) {
    const course = courses.find((c: { id: string; duration_weeks?: number }) => c.id === courseId);
    const installments = parseInstallments({
      totalAmount: fee.amount,
      periodType: fee.period,
      durationWeeks: course?.duration_weeks ?? null,
    });

    const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
      .insert({
        job_id: jobId, student_type: fee.student_type,
        total_amount: fee.amount, currency: fee.currency,
        period_type: fee.period,
        installments: installments.length > 0 ? JSON.stringify(installments) : null,
      })
      .returning("id");
    await masterKnex(`${S}.extraction_course_fee_assignments`)
      .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeRow.id })
      .onConflict(["course_id", "course_fee_id"]).ignore();
    linked++;
  }

  await writeJobEvent(jobId, "step_complete", {
    phase: "enrichment",
    message: `Bulk fees: ${linked} course-fee links created (fuzzy matched from ${feeEntries.length} fee entries)`,
    data: { linked, fee_entries: feeEntries.length, unmatched: feeEntries.length - matches.length },
  });
}

async function handleVerificationStep(jobId: string) {
  // Delegate to existing verify worker via queue
  await writeJobEvent(jobId, "step_start", { phase: "verification", message: "Dispatching verification" });
  await queueService.publish(EXTRACTION_QUEUES.VERIFY, { jobId });
  await writeJobEvent(jobId, "step_complete", {
    phase: "verification",
    message: "Verification dispatched to verify worker",
  });
}

async function handleCourseDataStep(
  jobId: string,
  courseId: string,
  dataType: CourseDataType,
) {
  const job = await loadJob(jobId);
  if (!job) return;

  const course = await masterKnex(`${S}.extraction_courses`)
    .where({ id: courseId, job_id: jobId }).first();
  if (!course) throw new Error(`Course ${courseId} not found for job ${jobId}`);

  const sourceUrl = course.source_url || job.institution_url;

  await writeJobEvent(jobId, "step_start", {
    phase: "course_data",
    message: `Extracting ${dataType} for "${course.name}"`,
    data: { course_id: courseId, data_type: dataType },
  });

  // ponytail: stop check before scraping + LLM for course data
  const scCd = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
  if (scCd?.stop_requested) { logger.info("Stop requested, aborting", { jobId }); return; }

  const markdown = await scrapeUrl(sourceUrl);
  if (!markdown) {
    throw new Error(`Failed to scrape course page: ${sourceUrl}`);
  }

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, `course_data_${dataType}`);
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${COURSE_DATA_SYSTEM}\n\n${addendum}` : COURSE_DATA_SYSTEM;

  // Admin-supplied pages for this data type (fees_urls, intakes_urls, …) get appended to
  // the course page — a shared fee table often lives off the course page entirely.
  // ponytail: first 3 only, to bound scrape cost; raise if sites split data wider than that.
  let combined = markdown;
  const guidedForType = parseGuidedUrls(job)[`${dataType}_urls`];
  if (Array.isArray(guidedForType)) {
    for (const extra of guidedForType.slice(0, 3)) {
      if (typeof extra !== "string") continue;
      const extraMd = await scrapeUrl(extra);
      if (extraMd) combined += `\n\n---\nSource: ${extra}\n\n${extraMd}`;
    }
  }

  const pageText = truncateMarkdown(combined, 24000);
  const extracted = await extractJson<Record<string, unknown>>({
    system,
    prompt: courseDataPrompt(sourceUrl, pageText, dataType, job.guidance_notes),
  });

  // Route by data type
  let count = 0;

  switch (dataType) {
    case "course": {
      const updates: Record<string, unknown> = {};
      for (const k of ["name", "short_name", "description", "degree_level", "subject_area", "study_mode", "awarding_institution"]) {
        const v = extracted[k];
        if (v && typeof v === "string" && v.trim()) updates[k] = v.trim();
      }
      const category = normaliseCourseCategory(extracted.course_category);
      if (category) updates.course_category = category;
      if (typeof extracted.duration_weeks === "number" && extracted.duration_weeks > 0) updates.duration_weeks = extracted.duration_weeks;
      if (Array.isArray(extracted.career_paths) && extracted.career_paths.length > 0) updates.career_paths = extracted.career_paths;
      if (Object.keys(updates).length > 0) {
        updates.updated_at = masterKnex.fn.now();
        await masterKnex(`${S}.extraction_courses`).where({ id: courseId }).update(updates);
        count = Object.keys(updates).length - 1; // exclude updated_at
      }
      break;
    }

    case "fees": {
      // Delete existing fee assignments for this course
      await masterKnex(`${S}.extraction_course_fee_assignments`).where({ course_id: courseId }).delete();
      const fees = (extracted.fees as Array<Record<string, unknown>>) || [];
      for (const fee of fees) {
        if (!fee.total_amount || (fee.total_amount as number) <= 0) continue;
        const installments = parseInstallments({
          totalAmount: fee.total_amount as number,
          periodType: (fee.period_type as string) ?? "Per Year",
          durationWeeks: course.duration_weeks ?? null,
        });
        const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
          .insert({
            job_id: jobId,
            name: fee.name ?? null,
            student_type: fee.student_type ?? "both",
            period_type: fee.period_type ?? "Per Year",
            currency: fee.currency ?? "AUD",
            total_amount: fee.total_amount,
            installments: installments.length > 0 ? JSON.stringify(installments) : null,
          })
          .returning("id");
        await masterKnex(`${S}.extraction_course_fee_assignments`)
          .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeRow.id });
        count++;
      }
      // Update course-level fee totals
      if (extracted.domestic_fee_total) {
        await masterKnex(`${S}.extraction_courses`).where({ id: courseId }).update({
          domestic_fee_total: extracted.domestic_fee_total,
          updated_at: masterKnex.fn.now(),
        });
      }
      if (extracted.international_fee_total) {
        await masterKnex(`${S}.extraction_courses`).where({ id: courseId }).update({
          international_fee_total: extracted.international_fee_total,
          updated_at: masterKnex.fn.now(),
        });
      }
      break;
    }

    case "intakes": {
      // Delete existing intake assignments for this course
      await masterKnex(`${S}.extraction_course_intake_assignments`).where({ course_id: courseId }).delete();
      const intakes = (extracted.intakes as Array<Record<string, unknown>>) || [];
      for (const intake of intakes) {
        if (!intake.intake_name) continue;
        const [intakeRow] = await masterKnex(`${S}.extraction_intakes`)
          .insert({
            job_id: jobId, course_id: courseId,
            intake_name: intake.intake_name,
            start_date: intake.start_date ?? null,
            admission_deadline: intake.admission_deadline ?? null,
            intake_month: intake.intake_month ?? null,
            intake_year: intake.intake_year ?? null,
          })
          .returning("id");
        await masterKnex(`${S}.extraction_course_intake_assignments`)
          .insert({ job_id: jobId, course_id: courseId, intake_id: intakeRow.id });
        count++;
      }
      break;
    }

    case "units": {
      // Delete existing unit assignments for this course — the units themselves are
      // shared per job (upsertStudyUnit dedups by name), so only the link is reset.
      await masterKnex(`${S}.extraction_course_study_unit_assignments`).where({ course_id: courseId }).delete();
      const units = (extracted.study_units as Array<Record<string, unknown>>) || [];
      for (const unit of units) {
        if (!unit.unit_name || typeof unit.unit_name !== "string") continue;
        const unitId = await upsertStudyUnit(jobId, {
          unit_code: (unit.unit_code as string) ?? null,
          unit_name: unit.unit_name,
          credit_points: unit.credit_points as number ?? null,
        });
        await masterKnex(`${S}.extraction_course_study_unit_assignments`)
          .insert({ job_id: jobId, course_id: courseId, study_unit_id: unitId })
          .onConflict(["course_id", "study_unit_id"]).ignore();
        count++;
      }
      break;
    }

    case "eligibility": {
      // Delete existing eligibility assignments for this course
      await masterKnex(`${S}.extraction_course_eligibility_assignments`).where({ course_id: courseId }).delete();
      const reqs = (extracted.requirements as Array<Record<string, unknown>>) || [];
      for (const req of reqs) {
        const description = (req.description as string | null) ?? null;
        let scoreType = normaliseScoreType(req.score_type);
        let scoreValue = coerceMoney(req.min_score);
        if (!scoreType && scoreValue == null && !req.min_score_percent) {
          const derived = deriveScoreFromDescription(description);
          if (derived) { scoreType = derived.score_type; scoreValue = derived.value; }
        }
        const isPercentage = scoreType === "percentage";

        const [reqRow] = await masterKnex(`${S}.extraction_eligibility_requirements`)
          .insert({
            job_id: jobId,
            name: req.name ?? null,
            applicable_to: req.applicable_to ?? "both",
            description,
            min_score_percent: isPercentage ? scoreValue : coerceMoney(req.min_score_percent),
            min_degree_level: req.min_degree_level ?? null,
            score_type: scoreType,
            min_score: isPercentage ? null : scoreValue,
          })
          .returning("id");
        await masterKnex(`${S}.extraction_course_eligibility_assignments`)
          .insert({ job_id: jobId, course_id: courseId, eligibility_requirement_id: reqRow.id });
        count++;
      }
      // English requirements
      const engReqs = (extracted.english_requirements as Array<Record<string, unknown>>) || [];
      for (const eng of engReqs) {
        await masterKnex(`${S}.extraction_english_requirements`).insert({
          job_id: jobId, course_id: courseId,
          test_type_name: eng.test_type_name ?? null,
          overall_score: eng.overall_score ?? null,
          listening_score: eng.listening_score ?? null,
          reading_score: eng.reading_score ?? null,
          writing_score: eng.writing_score ?? null,
          speaking_score: eng.speaking_score ?? null,
        });
        count++;
      }
      break;
    }

    case "accreditations": {
      await masterKnex(`${S}.extraction_course_accreditation_assignments`).where({ course_id: courseId }).delete();
      const accs = (extracted.accreditations as Array<Record<string, unknown>>) || [];
      for (const acc of accs) {
        if (!acc.name) continue;
        // Find or create extraction_accreditations row
        const accName = String(acc.name);
        const existingAcc = await masterKnex(`${S}.extraction_accreditations`)
          .whereRaw("LOWER(name) = LOWER(?)", [accName]).first();
        let accId: string;
        if (existingAcc) {
          accId = existingAcc.id;
        } else {
          const [row] = await masterKnex(`${S}.extraction_accreditations`)
            .insert({ name: accName, issuing_organization: acc.issuing_organization ?? null })
            .returning("id");
          accId = row.id;
        }
        await masterKnex(`${S}.extraction_course_accreditation_assignments`)
          .insert({
            job_id: jobId, course_id: courseId,
            extraction_accreditation_id: accId,
          });
        count++;
      }
      break;
    }
  }

  await rememberMemory({
    job_id: jobId, domain, step: `course_data_${dataType}`,
    entity_type: dataType, entity_ref: courseId,
    source_url: sourceUrl,
    source_excerpt: markdown.slice(0, 500),
    ai_output: extracted,
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "course_data",
    message: `Extracted ${count} ${dataType} items for "${course.name}"`,
    data: { course_id: courseId, data_type: dataType, count },
  });
}

/**
 * Whole-job visa-service re-scan — admin-triggered, mirrors handleAgentsStep's shape
 * (iterate guided URLs, extract, write) but reuses the exact prompt/writer the automatic
 * page-worker pipeline already uses for source_type: "visa_service" jobs, since there's no
 * agent-detection/table-parsing complexity here — just scrape, extract, upsert-by-name.
 */
async function handleVisaServicesStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const guided = parseGuidedUrls(job);
  const servicesUrls: string[] = (guided.services_urls as string[]) || [];
  if (servicesUrls.length === 0) throw new Error("No services_urls provided in guided_urls");

  await writeJobEvent(jobId, "step_start", { phase: "visa_services", message: `Extracting visa services from ${servicesUrls.length} URLs` });

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "visa_service_extraction");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${VISA_SERVICE_EXTRACTION_SYSTEM}\n\n${addendum}` : VISA_SERVICE_EXTRACTION_SYSTEM;

  const siteIntel = await masterKnex(`${S}.extraction_site_intelligence`)
    .select("fee_structure", "extraction_hints").where({ job_id: jobId }).first();

  let servicesWritten = 0;
  for (const url of servicesUrls) {
    const sc = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
    if (sc?.stop_requested) { logger.info("Stop requested, aborting", { jobId }); return; }
    await heartbeat(jobId);

    const markdown = await scrapeUrl(url);
    if (!markdown) continue;

    const extracted = await extractJson<{ visa_services: ExtractedVisaService[] }>({
      system,
      prompt: visaServiceExtractionPrompt(url, truncateMarkdown(markdown), job.guidance_notes, siteIntel),
      maxTokens: 65536,
    });

    for (const service of extracted.visa_services || []) {
      if (!service.name) continue;
      await writeVisaService(jobId, { ...service, source_url: service.source_url ?? url });
      servicesWritten++;
    }
  }

  await rememberMemory({
    job_id: jobId, domain, step: "visa_service_extraction",
    entity_type: "visa_service",
    ai_output: { total: servicesWritten, pages: servicesUrls.length },
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "visa_services",
    message: `${servicesWritten} visa services extracted from ${servicesUrls.length} pages`,
    data: { count: servicesWritten, pages: servicesUrls.length },
  });
}

/**
 * Re-extract ONE known visa service by re-scraping its own source_url — the visa-service
 * analog of handleCourseDataStep, for the "re-run this one" action on a single card.
 * Overwrites via updateVisaServiceById rather than the dedup-by-name writer, since we
 * already know exactly which row to update.
 */
async function handleVisaServiceDataStep(jobId: string, visaServiceId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const visaService = await masterKnex(`${S}.extraction_visa_services`)
    .where({ id: visaServiceId, job_id: jobId }).first();
  if (!visaService) throw new Error(`Visa service ${visaServiceId} not found for job ${jobId}`);

  const sourceUrl = visaService.source_url;
  if (!sourceUrl) throw new Error(`Visa service ${visaServiceId} has no source_url to re-scrape`);

  await writeJobEvent(jobId, "step_start", {
    phase: "visa_service_data",
    message: `Re-extracting "${visaService.name}"`,
    data: { visa_service_id: visaServiceId },
  });

  const scVs = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
  if (scVs?.stop_requested) { logger.info("Stop requested, aborting", { jobId }); return; }

  const markdown = await scrapeUrl(sourceUrl);
  if (!markdown) throw new Error(`Failed to scrape visa service page: ${sourceUrl}`);

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "visa_service_extraction");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${VISA_SERVICE_EXTRACTION_SYSTEM}\n\n${addendum}` : VISA_SERVICE_EXTRACTION_SYSTEM;

  const extracted = await extractJson<{ visa_services: ExtractedVisaService[] }>({
    system,
    prompt: visaServiceExtractionPrompt(sourceUrl, truncateMarkdown(markdown), job.guidance_notes),
    maxTokens: 65536,
  });

  // The page may describe more than one service — prefer the one matching this row's
  // existing name (re-scraping the same page shouldn't switch to a different service);
  // fall back to the first result if the name no longer appears.
  const existingNorm = normaliseVisaServiceName(visaService.name);
  const match = (extracted.visa_services || []).find((s) => s.name && normaliseVisaServiceName(s.name) === existingNorm)
    ?? extracted.visa_services?.[0];

  if (!match) throw new Error(`No visa service found on re-scrape of ${sourceUrl}`);

  await updateVisaServiceById(visaServiceId, match);

  await rememberMemory({
    job_id: jobId, domain, step: "visa_service_extraction",
    entity_type: "visa_service", entity_ref: visaServiceId,
    source_url: sourceUrl,
    source_excerpt: markdown.slice(0, 500),
    ai_output: match,
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "visa_service_data",
    message: `Re-extracted "${visaService.name}"`,
    data: { visa_service_id: visaServiceId },
  });
}

// ── Main consumer ───────────────────────────────────────────────────────────

await queueService.consume(EXTRACTION_QUEUES.STEPS, async (msg) => {
  let jobId: string, step: string, courseId: string | undefined, dataType: string | undefined, visaServiceId: string | undefined;
  try {
    ({ jobId, step, courseId, dataType, visaServiceId } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Received step", { jobId, step, courseId, dataType, visaServiceId });

  try {
    switch (step as PipelineStep) {
      case "institution":       await handleInstitutionStep(jobId); break;
      case "branches":          await handleBranchesStep(jobId); break;
      case "agents":            await handleAgentsStep(jobId); break;
      case "discovery":         await handleDiscoveryStep(jobId); break;
      case "courses":           await handleCoursesStep(jobId); break;
      case "enrichment":        await handleEnrichmentStep(jobId); break;
      case "verification":      await handleVerificationStep(jobId); break;
      case "course_data":       await handleCourseDataStep(jobId, courseId!, dataType as CourseDataType); break;
      case "visa_services":     await handleVisaServicesStep(jobId); break;
      case "visa_service_data": await handleVisaServiceDataStep(jobId, visaServiceId!); break;
      default:
        logger.warn("Unknown step", { step });
    }

    await markStepProgress(jobId, step, "done");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error("Step failed", { jobId, step, error: errMsg });
    await markStepProgress(jobId, step, "failed");
    await writeJobEvent(jobId, "step_error", {
      level: "error", phase: step,
      message: `Step "${step}" failed: ${errMsg}`,
      data: { step, courseId, dataType, visaServiceId },
    });
  }
});

logger.info(`Extraction step worker started — consuming "${EXTRACTION_QUEUES.STEPS}" queue`);
