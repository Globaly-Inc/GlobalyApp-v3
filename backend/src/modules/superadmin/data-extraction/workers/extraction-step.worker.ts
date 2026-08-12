// Worker — consumes "extraction_steps" queue.
// Routes admin-triggered step re-runs: institution, branches, agents,
// discovery, courses, enrichment, verification, course_data.
//
// Run with: npm run job:extraction-step

import "dotenv/config";
import { createHash } from "node:crypto";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { scrapeMarkdown } from "../lib/scraper.js";
import { truncateMarkdown, domainOf } from "../lib/html-utils.js";
import { extractJson } from "../lib/llm-client.js";
import {
  institutionExtractionPrompt, INSTITUTION_EXTRACTION_SYSTEM,
  campusExtractionPrompt, CAMPUS_EXTRACTION_SYSTEM,
  agentExtractionPrompt, AGENT_EXTRACTION_SYSTEM,
  courseListPrompt, COURSE_LIST_SYSTEM,
  bulkFeePrompt, BULK_FEE_SYSTEM,
  courseDataPrompt, COURSE_DATA_SYSTEM,
} from "../lib/extraction-prompts.js";
import {
  writeInstitutionOverview,
  replaceCampuses,
  upsertAgent,
  writeAgentLocations,
  insertQueueItem,
  writeJobEvent,
  normaliseCampusName,
  type ExtractedCampus,
  type InstitutionOverview,
} from "../lib/staging-writer.js";
import { parseAddress } from "../lib/address-parser.js";
import { normalizeAgentRow } from "../lib/agent-normalizers.js";
import { recallMemory, rememberMemory, buildSystemAddendum } from "../lib/memory-client.js";
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

function sha1(...parts: (string | null | undefined)[]): string {
  return createHash("sha1").update(parts.map(p => p ?? "").join("|")).digest("hex");
}

// ── Step handlers ───────────────────────────────────────────────────────────

async function handleInstitutionStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const guided = parseGuidedUrls(job);
  const contactUrls: string[] = (guided.contact_urls as string[]) || [];

  // Build URL list: institution_url + contact_urls + /contact guess
  const baseUrl = job.institution_url;
  const guessContact = (() => {
    try { return new URL("/contact", new URL(baseUrl).origin).href; } catch { return null; }
  })();
  const urlsToScrape = [...new Set([
    baseUrl,
    ...contactUrls,
    ...(contactUrls.length === 0 && guessContact ? [guessContact] : []),
  ])];

  await writeJobEvent(jobId, "step_start", { phase: "institution", message: `Scraping ${urlsToScrape.length} URLs for institution data` });

  // Recall memory
  const domain = domainOf(baseUrl);
  const recalled = await recallMemory(domain, "institution");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${INSTITUTION_EXTRACTION_SYSTEM}\n\n${addendum}` : INSTITUTION_EXTRACTION_SYSTEM;

  // Scrape all in parallel
  const scrapeResults = await Promise.all(urlsToScrape.map(u => scrapeUrl(u)));
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

  // Fallback paths if no guided URLs
  const origin = (() => {
    try { return new URL(job.institution_url).origin; } catch { return ""; }
  })();
  const fallbackPaths = ["/campuses", "/locations", "/contact", "/about"];
  const urlsToScrape = branchUrls.length > 0
    ? branchUrls
    : fallbackPaths.map(p => `${origin}${p}`);

  await writeJobEvent(jobId, "step_start", { phase: "branches", message: `Scraping ${urlsToScrape.length} URLs for campus data` });

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "branches");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${CAMPUS_EXTRACTION_SYSTEM}\n\n${addendum}` : CAMPUS_EXTRACTION_SYSTEM;

  let allCampuses: ExtractedCampus[] = [];

  // Phase 1: Scrape provided URLs
  for (const url of urlsToScrape) {
    await heartbeat(jobId);
    const markdown = await scrapeUrl(url);
    if (!markdown) continue;

    const pageText = truncateMarkdown(markdown, 15000);
    const result = await extractJson<{ campuses: ExtractedCampus[] }>({
      system,
      prompt: campusExtractionPrompt(url, pageText),
    });
    if (result.campuses?.length) allCampuses.push(...result.campuses);
  }

  // Phase 2: If empty and no guided URLs, try homepage + /about
  if (allCampuses.length === 0 && branchUrls.length === 0) {
    const fallback2 = [job.institution_url, `${origin}/about`];
    for (const url of fallback2) {
      await heartbeat(jobId);
      const markdown = await scrapeUrl(url);
      if (!markdown) continue;
      const pageText = truncateMarkdown(markdown, 15000);
      const result = await extractJson<{ campuses: ExtractedCampus[] }>({
        system,
        prompt: campusExtractionPrompt(url, pageText, true),
      });
      if (result.campuses?.length) {
        allCampuses.push(...result.campuses);
        break;
      }
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

  // Replace existing campuses, re-link junctions
  const idMap = await replaceCampuses(jobId, allCampuses);

  await rememberMemory({
    job_id: jobId, domain, step: "branches",
    entity_type: "campus",
    ai_output: allCampuses,
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "branches",
    message: `${idMap.size} campuses extracted`,
    data: { count: idMap.size },
  });
}

async function handleAgentsStep(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) return;

  const guided = parseGuidedUrls(job);
  const agentUrls: string[] = (guided.agents_urls as string[]) || [];

  if (agentUrls.length === 0) {
    throw new Error("No agents_urls provided in guided_urls");
  }

  await writeJobEvent(jobId, "step_start", { phase: "agents", message: `Extracting agents from ${agentUrls.length} URLs` });

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "agents");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${AGENT_EXTRACTION_SYSTEM}\n\n${addendum}` : AGENT_EXTRACTION_SYSTEM;

  let totalAgents = 0;

  for (const url of agentUrls) {
    // ponytail: stop check per agent page
    const sc = await masterKnex(`${S}.extraction_jobs`).select("stop_requested").where({ id: jobId }).first();
    if (sc?.stop_requested) { logger.info("Stop requested, aborting", { jobId }); return; }

    await heartbeat(jobId);
    const markdown = await scrapeUrl(url);
    if (!markdown) continue;

    const pageText = truncateMarkdown(markdown, 20000);
    const result = await extractJson<{ agents: Record<string, unknown>[] }>({
      system,
      prompt: agentExtractionPrompt(url, pageText, job.institution_name),
    });

    for (const rawAgent of (result.agents || [])) {
      // Normalize
      const normalized = normalizeAgentRow(rawAgent as any);
      const name = (rawAgent.name as string) || "";
      if (!name.trim()) continue;

      // Generate external_id: sha1(name|country|email|source_url)
      const externalId = sha1(name, normalized.country, normalized.email, url);

      const agentData: Record<string, unknown> = {
        name,
        country: normalized.country,
        state: normalized.state,
        city: normalized.city,
        address: normalized.address,
        postcode: normalized.postcode,
        phone: normalized.phone,
        email: normalized.email,
        website: normalized.website,
        source_url: url,
      };

      const agentId = await upsertAgent(jobId, agentData, externalId);

      // Write agent locations (single location from the extraction)
      if (normalized.city || normalized.country) {
        await writeAgentLocations(agentId, jobId, [{
          country: normalized.country,
          state: normalized.state,
          city: normalized.city,
          address: normalized.address,
          postcode: normalized.postcode,
        }]);
      }

      totalAgents++;
    }
  }

  // Write agent extraction run history
  await masterKnex(`${S}.extraction_agent_extraction_runs`).insert({
    job_id: jobId,
    source: "step_worker",
    urls_scraped: agentUrls.length,
    agents_found: totalAgents,
    status: "completed",
  });

  await rememberMemory({
    job_id: jobId, domain, step: "agents",
    entity_type: "agent",
    ai_output: { total: totalAgents },
  });

  await writeJobEvent(jobId, "step_complete", {
    phase: "agents",
    message: `${totalAgents} agents extracted from ${agentUrls.length} URLs`,
    data: { count: totalAgents },
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

    // Real courses found — queue each for extraction
    if (result.courses?.length) {
      for (const course of result.courses) {
        const courseUrl = course.url || url;
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

async function handleCoursesStep(jobId: string) {
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

  await writeJobEvent(jobId, "step_complete", {
    phase: "courses",
    message: `${items.length} pages re-dispatched to extraction queue`,
    data: { count: items.length },
  });
}

async function handleEnrichmentStep(jobId: string) {
  // ponytail: stub — Phase 6 will complete this with fee-matcher.ts
  // For now, attempt basic bulk fee extraction from fee page
  const job = await loadJob(jobId);
  if (!job) return;

  await writeJobEvent(jobId, "step_start", { phase: "enrichment", message: "Starting enrichment (bulk fees)" });

  const siteIntel = await masterKnex(`${S}.extraction_site_intelligence`)
    .where({ job_id: jobId }).first();

  // Find fee page URL
  const origin = (() => {
    try { return new URL(job.institution_url).origin; } catch { return ""; }
  })();
  const candidatePaths = ["/fees", "/tuition", "/tuition-fees", "/course-fees", "/costs", "/pricing"];
  let feePageText: string | null = null;

  // Check site intelligence for high-value pages
  if (siteIntel?.navigation_patterns) {
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
      phase: "enrichment",
      message: "Enrichment skipped — no fee page found. Full enrichment available in Phase 6.",
      level: "warn",
    });
    return;
  }

  // Load courses for this job
  const courses = await masterKnex(`${S}.extraction_courses`)
    .where({ job_id: jobId }).select("id", "name").orderBy("name");

  if (courses.length === 0) {
    await writeJobEvent(jobId, "step_complete", {
      phase: "enrichment", message: "No courses to enrich",
    });
    return;
  }

  const domain = domainOf(job.institution_url);
  const recalled = await recallMemory(domain, "enrichment");
  const addendum = buildSystemAddendum(recalled);
  const system = addendum ? `${BULK_FEE_SYSTEM}\n\n${addendum}` : BULK_FEE_SYSTEM;

  // ponytail: stop check before fee extraction LLM call
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

  // ponytail: simple name matching, full fuzzy matcher in Phase 6
  let linked = 0;
  const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const entry of (result.fee_schedule || [])) {
    const target = normName(entry.course_name);
    const match = courses.find((c: { name: string }) => normName(c.name) === target)
      || courses.find((c: { name: string }) => normName(c.name).includes(target) || target.includes(normName(c.name)));
    if (!match) continue;

    const currency = entry.currency || siteIntel?.currency || "USD";
    for (const [studentType, total] of [
      ["domestic", entry.domestic_total],
      ["international", entry.international_total],
    ] as const) {
      if (!total || total <= 0) continue;
      const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
        .insert({
          job_id: jobId, student_type: studentType,
          total_amount: total, currency,
          period_type: entry.period_type || "Per Year",
        })
        .returning("id");
      await masterKnex(`${S}.extraction_course_fee_assignments`)
        .insert({ job_id: jobId, course_id: match.id, course_fee_id: feeRow.id })
        .onConflict(["course_id", "course_fee_id"]).ignore();
      linked++;
    }
  }

  await writeJobEvent(jobId, "step_complete", {
    phase: "enrichment",
    message: `Bulk fees: ${linked} course-fee links created`,
    data: { linked },
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

  const pageText = truncateMarkdown(markdown, 24000);
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
        const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
          .insert({
            job_id: jobId,
            name: fee.name ?? null,
            student_type: fee.student_type ?? "both",
            period_type: fee.period_type ?? "Per Year",
            currency: fee.currency ?? "AUD",
            total_amount: fee.total_amount,
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
      // Delete existing unit assignments for this course
      await masterKnex(`${S}.extraction_course_study_unit_assignments`).where({ course_id: courseId }).delete();
      const units = (extracted.study_units as Array<Record<string, unknown>>) || [];
      for (const unit of units) {
        if (!unit.unit_name) continue;
        const [unitRow] = await masterKnex(`${S}.extraction_study_units`)
          .insert({
            job_id: jobId,
            unit_code: unit.unit_code ?? null,
            unit_name: unit.unit_name,
            credit_points: unit.credit_points ?? null,
          })
          .returning("id");
        await masterKnex(`${S}.extraction_course_study_unit_assignments`)
          .insert({ job_id: jobId, course_id: courseId, study_unit_id: unitRow.id });
        count++;
      }
      break;
    }

    case "eligibility": {
      // Delete existing eligibility assignments for this course
      await masterKnex(`${S}.extraction_course_eligibility_assignments`).where({ course_id: courseId }).delete();
      const reqs = (extracted.requirements as Array<Record<string, unknown>>) || [];
      for (const req of reqs) {
        const [reqRow] = await masterKnex(`${S}.extraction_eligibility_requirements`)
          .insert({
            job_id: jobId,
            name: req.name ?? null,
            applicable_to: req.applicable_to ?? "both",
            description: req.description ?? null,
            min_score_percent: req.min_score_percent ?? null,
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

// ── Main consumer ───────────────────────────────────────────────────────────

await queueService.consume(EXTRACTION_QUEUES.STEPS, async (msg) => {
  let jobId: string, step: string, courseId: string | undefined, dataType: string | undefined;
  try {
    ({ jobId, step, courseId, dataType } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Received step", { jobId, step, courseId, dataType });

  try {
    switch (step as PipelineStep) {
      case "institution":   await handleInstitutionStep(jobId); break;
      case "branches":      await handleBranchesStep(jobId); break;
      case "agents":        await handleAgentsStep(jobId); break;
      case "discovery":     await handleDiscoveryStep(jobId); break;
      case "courses":       await handleCoursesStep(jobId); break;
      case "enrichment":    await handleEnrichmentStep(jobId); break;
      case "verification":  await handleVerificationStep(jobId); break;
      case "course_data":   await handleCourseDataStep(jobId, courseId!, dataType as CourseDataType); break;
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
      data: { step, courseId, dataType },
    });
  }
});

logger.info(`Extraction step worker started — consuming "${EXTRACTION_QUEUES.STEPS}" queue`);
