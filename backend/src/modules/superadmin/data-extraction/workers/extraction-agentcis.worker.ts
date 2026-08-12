// Worker — consumes "extraction_agentcis" queue.
// Fetches an institution from AgentCIS by ID, then stages it into extraction_* tables
// using the same logic as V2's stageInstitution.
//
// Run with: npm run job:extraction-agentcis

import "dotenv/config";
import { config } from "../../../../config.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import {
  writeInstitutionOverview,
  upsertCampus,
  writeJobEvent,
} from "../lib/staging-writer.js";
import {
  coerceLabel,
  isDeactivated,
  pickActiveContact,
  mapCountry,
  mapDegreeLevel,
} from "../lib/agentcis-mappers.js";

const logger = createChildLogger("extraction-agentcis-worker");

const PAGE_SIZE = 50;

// ── API helpers ──

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (config.AGENTCIS_API_KEY) h["Authorization"] = `Bearer ${config.AGENTCIS_API_KEY}`;
  return h;
}

async function fetchInstitutionById(
  id: string,
): Promise<Record<string, unknown> | null> {
  const baseUrl = config.AGENTCIS_BASE_URL;
  if (!baseUrl) return null;
  const headers = apiHeaders();

  // Strategy 1: filter by id
  const filterUrl = `${baseUrl}/search?filter[id]=${encodeURIComponent(id)}&include=branches,products,country,city&page[size]=5`;
  try {
    const res = await fetch(filterUrl, { headers });
    if (res.ok) {
      const json = await res.json();
      const data = (json.data || []) as Record<string, unknown>[];
      const match = data.find((d) => String(d.id) === id) || data[0];
      if (match) return match;
    }
  } catch (e) {
    logger.warn("Filter fetch failed", { id, error: (e as Error).message });
  }

  // Strategy 2: paginate up to 5 pages
  for (let page = 1; page <= 5; page++) {
    try {
      const url = `${baseUrl}/search?page[number]=${page}&page[size]=${PAGE_SIZE}&include=branches,products`;
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const json = await res.json();
      const data = (json.data || []) as Record<string, unknown>[];
      if (!data.length) break;
      const match = data.find((d) => String(d.id) === id);
      if (match) return match;
      if (data.length < PAGE_SIZE) break;
    } catch {
      break;
    }
  }

  return null;
}

// ── Staging logic (port of V2's stageInstitution) ──

async function stageInstitution(inst: Record<string, unknown>): Promise<string | null> {
  const name = (inst.name as string)?.trim();
  if (!name) {
    logger.warn("Skipping institution with no name", { id: inst.id });
    return null;
  }
  if (isDeactivated(inst)) {
    logger.info("Skipping deactivated institution", { name, id: inst.id });
    return null;
  }

  const website = (inst.website as string) || null;
  const activeContact = pickActiveContact(inst);

  // 1. Create extraction_jobs row
  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({
      institution_name: name,
      institution_url: website,
      status: "processing",
      source_type: "agentcis",
      aggregator_name: "AgentCIS",
      pipeline_progress: JSON.stringify({ phase: "institution", current: 0, total: 0 }),
      processing_heartbeat_at: masterKnex.fn.now(),
    })
    .returning("id");

  const jobId = job.id as string;

  try {
    // 2. Institution overview
    await writeInstitutionOverview(jobId, {
      name,
      website,
      email: activeContact.email,
      phone: activeContact.phone,
      address: (inst.street as string) || (inst.address as string) || null,
      city: (inst.city as string) || null,
      state: (inst.state as string) || null,
      country: mapCountry(inst.country),
      zip_code: resolvePostcode(inst),
      description:
        (inst.about as string) ||
        (inst.overview as string) ||
        (inst.description as string) ||
        null,
      logo_url: (inst.logo as string) || (inst.logo_url as string) || null,
      source_url: website,
      facebook_url: (inst.facebook as string) || null,
      instagram_url: (inst.instagram as string) || null,
      twitter_url: (inst.twitter as string) || null,
      linkedin_url: (inst.linkedin as string) || null,
      youtube_url: (inst.youtube as string) || (inst.video_url as string) || null,
    });

    // 3. Branches → campuses
    const allBranches = (inst.branches || []) as Record<string, unknown>[];
    const branches = allBranches.filter((b) => !isDeactivated(b));
    const campusMap: Record<string, string> = {}; // key → campus_id
    const campusIds: string[] = [];

    for (const br of branches) {
      const cName = (coerceLabel(br.name) || coerceLabel(br.campus_name) || "").trim();
      if (!cName) continue;

      const campusId = await upsertCampus(jobId, {
        name: cName,
        address: (br.street as string) || (br.address as string) || null,
        city: (br.city as string) || null,
        state: (br.state as string) || null,
        country: mapCountry(br.country),
        phone: (br.phone_number as string) || (br.phone as string) || null,
        email: (br.email as string) || null,
      });

      if (campusId) {
        campusMap[cName.toLowerCase()] = campusId;
        if (br.id != null) campusMap[String(br.id)] = campusId;
        campusIds.push(campusId);
      }
    }

    // 4. Products → courses + child entities
    const allProducts = (inst.products || []) as Record<string, unknown>[];
    const products = allProducts.filter((p) => !isDeactivated(p));
    let coursesExtracted = 0;

    for (const p of products) {
      const cName = coerceLabel(p.name).trim();
      if (!cName) continue;

      const dLevel = mapDegreeLevel(p.degree_level || p.qualification_type);

      // Insert course
      const [course] = await masterKnex(`${S}.extraction_courses`)
        .insert({
          job_id: jobId,
          name: cName,
          short_name: (p.short_name as string) || null,
          degree_level: dLevel,
          subject_area: (p.subject_area as string) || (p.field_of_study as string) || null,
          description: (p.description as string) || null,
          awarding_institution: (p.awarding_institution as string) || name,
          source_url: (p.url as string) || (p.product_url as string) || website,
          verification_status: "pending",
        })
        .returning("id");

      const courseId = course.id as string;

      // 4a. Course → campus links
      const productCampusIds: string[] = [];
      const pCampuses = (p.branches || p.campuses || []) as unknown[];
      for (const pc of pCampuses) {
        let key: string | null = null;
        if (typeof pc === "number" || typeof pc === "string") key = String(pc);
        else if (pc && typeof pc === "object") {
          const o = pc as Record<string, unknown>;
          if (o.id != null) key = String(o.id);
          else {
            const n = coerceLabel(o.name);
            if (n) key = n.toLowerCase();
          }
        }
        if (key && campusMap[key]) productCampusIds.push(campusMap[key]);
      }
      const linkIds = productCampusIds.length ? productCampusIds : campusIds;
      for (const cid of linkIds) {
        await masterKnex(`${S}.extraction_course_campuses`)
          .insert({ job_id: jobId, course_id: courseId, campus_id: cid })
          .onConflict().ignore();
      }

      // 4b. Fees — simplified: store each fee item as a course fee row
      const rawFees = (p.fees ?? p.fee_items ?? p.fee ?? []) as unknown[];
      const feeArr = Array.isArray(rawFees) ? rawFees : rawFees ? [rawFees] : [];
      for (const fg of feeArr) {
        if (!fg || typeof fg !== "object") continue;
        const feeObj = fg as Record<string, unknown>;
        const amount = Number(feeObj.amount ?? feeObj.fee_amount ?? feeObj.total ?? feeObj.value ?? 0);
        if (!amount) continue;

        const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
          .insert({
            job_id: jobId,
            name: coerceLabel(feeObj.name || feeObj.fee_type || feeObj.type) || "Tuition Fee",
            student_type: String(feeObj.student_type ?? feeObj.applicable_to ?? "international").toLowerCase(),
            period_type: coerceLabel(feeObj.period_type || feeObj.period) || "total",
            currency: String(feeObj.currency ?? (p.currency as string) ?? "AUD").toUpperCase(),
            total_amount: Math.round(amount),
          })
          .returning("id");

        await masterKnex(`${S}.extraction_course_fee_assignments`)
          .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeRow.id })
          .onConflict(["course_id", "course_fee_id"]).ignore();
      }

      // 4c. Intakes
      const rawIntakes = extractIntakes(p);
      for (const ik of rawIntakes) {
        const [intakeRow] = await masterKnex(`${S}.extraction_intakes`)
          .insert({
            job_id: jobId,
            course_id: courseId,
            intake_name: ik.intake_name,
            intake_month: ik.intake_month,
            intake_year: ik.intake_year,
            start_date: ik.start_date,
            end_date: ik.end_date,
            admission_deadline: ik.admission_deadline,
          })
          .returning("id");

        await masterKnex(`${S}.extraction_course_intake_assignments`)
          .insert({ job_id: jobId, course_id: courseId, intake_id: intakeRow.id })
          .onConflict(["course_id", "intake_id"]).ignore();
      }

      // 4d. Study options — mode + duration
      const studyOptions = extractStudyOptions(p);
      for (const opt of studyOptions) {
        const [soRow] = await masterKnex(`${S}.extraction_study_options`)
          .insert({
            job_id: jobId,
            study_mode: opt.study_mode,
            study_load: opt.study_load,
            duration_value: opt.duration_value,
            duration_unit: opt.duration_unit,
          })
          .returning("id");

        await masterKnex(`${S}.extraction_course_study_option_assignments`)
          .insert({ job_id: jobId, course_id: courseId, study_option_id: soRow.id })
          .onConflict(["course_id", "study_option_id"]).ignore();
      }

      // 4e. Eligibility
      const elig = extractEligibility(p);
      if (elig) {
        const [eligRow] = await masterKnex(`${S}.extraction_eligibility_requirements`)
          .insert({
            job_id: jobId,
            name: "Entry Requirements",
            applicable_to: "international",
            min_degree_level: elig.min_degree_level,
            min_score_percent: elig.min_score_percent,
            description: elig.description,
          })
          .returning("id");

        await masterKnex(`${S}.extraction_course_eligibility_assignments`)
          .insert({
            job_id: jobId,
            course_id: courseId,
            eligibility_requirement_id: eligRow.id,
          })
          .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
      }

      coursesExtracted++;

      // Heartbeat every 5 courses
      if (coursesExtracted % 5 === 0) {
        await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
          processing_heartbeat_at: masterKnex.fn.now(),
          pipeline_progress: JSON.stringify({
            phase: "courses",
            current: coursesExtracted,
            total: products.length,
          }),
        });
      }
    }

    // 5. Mark job done
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "done",
      courses_extracted: coursesExtracted,
      pipeline_progress: JSON.stringify({
        phase: "done",
        courses_extracted: coursesExtracted,
        branches_extracted: branches.length,
      }),
      processing_heartbeat_at: masterKnex.fn.now(),
      updated_at: masterKnex.fn.now(),
    });

    await writeJobEvent(jobId, "agentcis_import_complete", {
      message: `Staged ${coursesExtracted} courses, ${branches.length} campuses`,
    });

    return jobId;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    logger.error("AgentCIS staging failed", { jobId, error: msg });
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId }).update({
      status: "failed",
      error_message: msg,
      pipeline_progress: JSON.stringify({ phase: "failed", error: msg }),
      processing_heartbeat_at: masterKnex.fn.now(),
      updated_at: masterKnex.fn.now(),
    });
    return null;
  }
}

// ── Inline extraction helpers (simplified from V2 mappers) ──

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

interface MappedIntake {
  intake_name: string | null;
  intake_month: number | null;
  intake_year: number | null;
  start_date: string | null;
  end_date: string | null;
  admission_deadline: string | null;
}

function extractIntakes(source: Record<string, unknown>): MappedIntake[] {
  const candidates = [
    source.intakes, source.intake, source.course_intakes,
    source.available_intakes, source.start_dates, source.intake_dates,
  ];
  let rawArr: unknown[] = [];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) { rawArr = c; break; }
  }
  if (!rawArr.length) {
    // Scalar intake fields
    if (source.intake_month != null || source.intake_year != null || source.start_date != null) {
      rawArr = [source];
    }
  }

  const out: MappedIntake[] = [];
  for (const raw of rawArr) {
    const mapped = mapOneIntake(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

function mapOneIntake(input: unknown): MappedIntake | null {
  if (input == null) return null;

  if (typeof input === "string" || typeof input === "number") {
    const s = String(input).trim();
    if (!s) return null;
    const { month, year } = parseMonthYear(s);
    if (!month && !year) return null;
    return {
      intake_name: s,
      intake_month: month,
      intake_year: year,
      start_date: null,
      end_date: null,
      admission_deadline: null,
    };
  }

  if (typeof input !== "object") return null;
  const o = input as Record<string, unknown>;

  let month: number | null = null;
  let year: number | null = null;

  const monthRaw = o.intake_month ?? o.month;
  if (typeof monthRaw === "number" && monthRaw >= 1 && monthRaw <= 12) month = monthRaw;
  else if (monthRaw != null) {
    const ms = String(monthRaw).trim().toLowerCase();
    month = MONTH_MAP[ms] ?? MONTH_MAP[ms.slice(0, 3)] ?? null;
    if (!month) { const n = Number(ms); if (n >= 1 && n <= 12) month = n; }
  }

  const yearRaw = o.intake_year ?? o.year;
  if (typeof yearRaw === "number" && yearRaw > 1900) year = yearRaw;
  else if (yearRaw != null) { const n = Number(yearRaw); if (n > 1900) year = n; }

  const label = coerceLabel(o.name ?? o.label ?? o.intake_name ?? o.title);
  if (!month || !year) {
    const parsed = parseMonthYear(label);
    month = month ?? parsed.month;
    year = year ?? parsed.year;
  }

  const startDate = toDateStr(o.start_date ?? o.intake_date ?? o.starts_at);
  const endDate = toDateStr(o.end_date ?? o.ends_at);
  const deadline = toDateStr(o.application_deadline ?? o.admission_deadline ?? o.deadline);

  if (!label && !month && !year && !startDate) return null;

  return {
    intake_name: label || null,
    intake_month: month,
    intake_year: year,
    start_date: startDate,
    end_date: endDate,
    admission_deadline: deadline,
  };
}

function parseMonthYear(s: string): { month: number | null; year: number | null } {
  const txt = s.toLowerCase().trim();
  if (!txt) return { month: null, year: null };
  let month: number | null = null;
  for (const key of Object.keys(MONTH_MAP)) {
    if (new RegExp(`\\b${key}\\b`).test(txt)) { month = MONTH_MAP[key]; break; }
  }
  const yearMatch = txt.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  return { month, year };
}

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

interface MappedStudyOption {
  study_mode: string;
  study_load: string;
  duration_value: number | null;
  duration_unit: string | null;
}

const MODE_MAP: Record<string, string> = {
  "on campus": "on_campus", "on-campus": "on_campus", "campus": "on_campus",
  "classroom": "on_campus", "offline": "on_campus", "in person": "on_campus",
  "online": "online", "distance": "online", "remote": "online",
  "hybrid": "hybrid", "blended": "hybrid", "mixed": "hybrid",
};

function extractStudyOptions(p: Record<string, unknown>): MappedStudyOption[] {
  const modeRaw = p.study_mode ?? p.delivery_mode ?? p.mode;
  const modeTokens = tokenize(modeRaw);
  const modes = modeTokens.map((t) => MODE_MAP[t.toLowerCase()] || null).filter(Boolean) as string[];

  const loadRaw = p.study_load ?? p.load ?? p.attendance_type;
  const loadTokens = tokenize(loadRaw);
  const loadMap: Record<string, string> = {
    "full time": "full_time", "full-time": "full_time", "fulltime": "full_time",
    "part time": "part_time", "part-time": "part_time", "parttime": "part_time",
  };
  const loads = loadTokens.map((t) => loadMap[t.toLowerCase()] || null).filter(Boolean) as string[];

  const dv = Number(p.duration_value ?? p.duration ?? 0) || null;
  const duRaw = String(p.duration_unit ?? p.duration_type ?? "weeks").toLowerCase();
  let du: string | null = null;
  if (duRaw.startsWith("year")) du = "years";
  else if (duRaw.startsWith("month")) du = "months";
  else if (duRaw.startsWith("week")) du = "weeks";
  else if (duRaw.startsWith("day")) du = "days";
  else du = dv ? "weeks" : null;

  const mList = modes.length ? modes : ["on_campus"];
  const lList = loads.length ? loads : ["full_time"];

  const out: MappedStudyOption[] = [];
  for (const m of mList) {
    for (const l of lList) {
      out.push({ study_mode: m, study_load: l, duration_value: dv, duration_unit: du });
    }
  }
  return out;
}

function tokenize(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") return raw.split(/[,;/|]/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(raw)) return raw.flatMap(tokenize);
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return tokenize(o.name ?? o.label ?? o.value);
  }
  return [];
}

interface MappedEligibility {
  min_degree_level: string | null;
  min_score_percent: number | null;
  description: string | null;
}

function extractEligibility(p: Record<string, unknown>): MappedEligibility | null {
  const degreeSources = [
    p.qualification_type, p.qualification, p.degree_level, p.degree,
    p.minimum_qualification, p.min_qualification,
    (p.academic_requirement as Record<string, unknown> | undefined)?.qualification_type,
    (p.entry_requirements as Record<string, unknown> | undefined)?.academic,
  ];

  let minDegree: string | null = null;
  for (const src of degreeSources) {
    if (!src) continue;
    const label = coerceLabel(src).toLowerCase().trim();
    minDegree = mapDegreeLevel(label);
    if (minDegree) break;
  }

  const scoreRaw = p.min_score ?? p.min_percentage ?? p.percentage ??
    (p.academic_requirement as Record<string, unknown> | undefined)?.min_score;
  const minScore = scoreRaw != null ? Number(scoreRaw) || null : null;

  const desc = typeof p.entry_requirements_description === "string"
    ? p.entry_requirements_description
    : typeof (p.academic_requirement as Record<string, unknown> | undefined)?.description === "string"
      ? ((p.academic_requirement as Record<string, unknown>).description as string)
      : null;

  if (!minDegree && minScore == null && !desc) return null;

  return { min_degree_level: minDegree, min_score_percent: minScore, description: desc };
}

// ponytail: inline postcode resolver — full normalizer only needed in worker
function resolvePostcode(obj: Record<string, unknown>): string | null {
  for (const k of ["postcode", "post_code", "postal_code", "zip", "zip_code"]) {
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

// ── Consumer ──

await queueService.consume(EXTRACTION_QUEUES.AGENTCIS, async (msg) => {
  let institutionId: string;
  try {
    ({ institutionId } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Received AgentCIS import", { institutionId });

  if (!config.AGENTCIS_BASE_URL) {
    logger.warn("AGENTCIS_BASE_URL not configured — skipping", { institutionId });
    return;
  }

  try {
    const inst = await fetchInstitutionById(institutionId);
    if (!inst) {
      logger.warn("Institution not found in AgentCIS", { institutionId });
      // Record a failed job so the admin sees it
      await masterKnex(`${S}.extraction_jobs`).insert({
        institution_name: `AgentCIS #${institutionId}`,
        status: "failed",
        source_type: "agentcis",
        aggregator_name: "AgentCIS",
        error_message: `Institution id=${institutionId} not found in AgentCIS`,
        pipeline_progress: JSON.stringify({ phase: "failed", error: "not_found" }),
        processing_heartbeat_at: masterKnex.fn.now(),
      });
      return;
    }

    const jobId = await stageInstitution(inst);
    logger.info("AgentCIS import complete", { institutionId, jobId });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error("AgentCIS import failed", { institutionId, error: msg });
    await masterKnex(`${S}.extraction_jobs`).insert({
      institution_name: `AgentCIS #${institutionId}`,
      status: "failed",
      source_type: "agentcis",
      aggregator_name: "AgentCIS",
      error_message: msg,
      pipeline_progress: JSON.stringify({ phase: "failed", error: msg }),
      processing_heartbeat_at: masterKnex.fn.now(),
    });
  }
});

logger.info(`AgentCIS import worker started — consuming "${EXTRACTION_QUEUES.AGENTCIS}" queue`);
