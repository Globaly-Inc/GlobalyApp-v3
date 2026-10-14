// Picks a cover and up to MAX_GALLERY_IMAGES real photos from a scraped page for the org's Media
// section. Extraction keeps image links in the snapshot (`![alt](src)`); the site-analysis model
// classifies them (siteAnalysisPrompt), and every pick — the model's or this file's fallback — goes
// through isPublicCampusPhoto, so a headshot, an ad, another site's image or a signed link never
// reaches a public profile.

import { isSameSite, siteOf } from "./html-utils.js";

export const MAX_GALLERY_IMAGES = 10;
/** Candidates offered to the model — enough for a homepage's photos, small enough for the prompt. */
export const MAX_IMAGE_CANDIDATES = 40;

/** Model kinds that are campus imagery; portrait / logo / advert / other are never shown. */
export const PHOTO_KINDS = new Set(["campus", "building", "facility", "group_activity"]);

export type ImageCandidate = { url: string; alt: string };
/** `classified`: the model judged the candidates — its gallery stands even when empty (it rejected
 * them all), and no fallback may pick those same images again. */
export type OverviewMedia = { cover: string | null; gallery: string[]; classified: boolean };

/** URLs whose path or extension marks them as chrome, not photos. */
const NOT_A_PHOTO = /\.(svg|gif|ico)(\?|$)|logo|icon|favicon|sprite|avatar|badge|flag|placeholder|spinner|loader|pixel|tracking|emoji/i;
/** A person's own photo — a staff/faculty/student profile, not campus imagery. */
const PERSONAL = /\b(staff|faculty|profiles?|headshots?|portraits?|team|people|student[-_ ]profiles?)\b/i;
/** Query params of a signed or token-gated link — private, and it expires anyway. */
const SIGNED = /^(x-amz-signature|x-amz-credential|signature|token|sig|expires|auth|access_token|x-goog-signature)$/i;
const SIZE_PARAMS = ["w", "width", "size", "h", "height"];
const MIN_PHOTO_PX = 400;
/** Third-party image hosts a site serves its OWN photos from. ponytail: a fixed list — add a host
 * when a real institution's photos are lost to it. */
const IMAGE_CDNS = /(^|\.)(cloudfront\.net|imgix\.net|ctfassets\.net|wixstatic\.com|squarespace-cdn\.com|cloudinary\.com|akamaized\.net|azureedge\.net|b-cdn\.net|sitecorecontenthub\.cloud)$/i;

/** True when `url` is a public, non-personal photo the institution itself serves. */
export function isPublicCampusPhoto(url: string, alt: string, siteUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol) || NOT_A_PHOTO.test(url)) return false;
  let site: string;
  try {
    site = siteOf(siteUrl);
  } catch {
    return false;
  }
  if (!isSameSite(u.hostname, site) && !IMAGE_CDNS.test(u.hostname)) return false;
  if ([...u.searchParams.keys()].some((k) => SIGNED.test(k))) return false;
  let path: string;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    return false; // a malformed %-escape: skip this image, never fail the caller
  }
  if (PERSONAL.test(path.replace(/[-_/]/g, " ")) || PERSONAL.test(alt)) return false;
  // Thumbnails: ?w=150 / ?width=300, and WordPress's "-150x150." resized copies.
  if (SIZE_PARAMS.some((k) => { const n = Number(u.searchParams.get(k)); return n > 0 && n < MIN_PHOTO_PX; })) return false;
  const wp = /-(\d{2,4})x(\d{2,4})\.\w+$/.exec(u.pathname);
  if (wp && (Number(wp[1]) < MIN_PHOTO_PX || Number(wp[2]) < MIN_PHOTO_PX)) return false;
  return true;
}

/** Distinct photo candidates from markdown image links, absolute against `pageUrl`, already
 * filtered by isPublicCampusPhoto — the list the model may choose from, and nothing else. */
export function imageCandidates(markdown: string, pageUrl: string, logoUrl: string | null, max = MAX_IMAGE_CANDIDATES): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  for (const m of markdown.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    let url: string;
    try {
      url = new URL(m[2]!, pageUrl).toString();
    } catch {
      continue;
    }
    const alt = m[1]!.trim();
    if (url === logoUrl || out.some((c) => c.url === url) || !isPublicCampusPhoto(url, alt, pageUrl)) continue;
    out.push({ url, alt });
    if (out.length === max) break;
  }
  return out;
}

/** The fallback when no model pick exists: the first usable photos, in page order. */
export function pickGalleryImages(markdown: string, pageUrl: string, logoUrl: string | null, max = MAX_GALLERY_IMAGES): string[] {
  return imageCandidates(markdown, pageUrl, logoUrl, max).map((c) => c.url);
}

/** og:image / twitter:image from a page's HTML — the image the site itself chose to represent it. */
export function metaImages(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!content || !(key === "og:image" || key === "og:image:url" || key === "og:image:secure_url" || key === "twitter:image")) continue;
    try {
      const url = new URL(content.replace(/&amp;/g, "&"), pageUrl).toString();
      if (!out.includes(url)) out.push(url);
    } catch { /* not a URL */ }
  }
  return out;
}

/**
 * What to write onto the overview: each field only while it is unset (null). An array — even [] —
 * or a "" cover is a decision already made (picked, or cleared by an admin) and is never refilled.
 */
export function mediaPatch(
  stored: { cover_url?: string | null; gallery_images?: string[] | null },
  picked: { cover: string | null; gallery: string[] | null; classified?: boolean },
): { cover_url?: string; gallery_images?: string[] } {
  const patch: { cover_url?: string; gallery_images?: string[] } = {};
  // A classified empty gallery is written as [] — a decision, so later writers don't refill it.
  if (stored.gallery_images == null && picked.gallery && (picked.gallery.length || picked.classified)) patch.gallery_images = picked.gallery;
  const cover = picked.cover ?? picked.gallery?.[0];
  if (stored.cover_url == null && cover) patch.cover_url = cover;
  return patch;
}

/**
 * The model's classified picks → the media actually stored. Only URLs from `candidates` (the model
 * can't invent one), only campus kinds, re-checked by the guard, capped at MAX_GALLERY_IMAGES.
 * Cover: the page's own og/twitter image when it passes the guard, else the model's cover if it is a
 * candidate, else the first media photo.
 */
export function chooseOverviewMedia(
  candidates: ImageCandidate[],
  model: { cover_url?: unknown; media_images?: unknown },
  meta: string[],
  siteUrl: string,
): OverviewMedia {
  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  const classified = candidates.length > 0 && Array.isArray(model.media_images);
  const picks = Array.isArray(model.media_images) ? model.media_images : [];
  // What the model called a portrait / logo / advert / other may not be the cover either.
  const rejected = new Set(picks.filter((p) => typeof p?.url === "string" && !PHOTO_KINDS.has(String(p.kind))).map((p) => p.url as string));
  const coverOk = (url: string, alt: string) => !rejected.has(url) && isPublicCampusPhoto(url, alt, siteUrl);
  const gallery: string[] = [];
  for (const p of picks) {
    const url = typeof p?.url === "string" ? p.url : null;
    const c = url ? byUrl.get(url) : undefined;
    if (!c || !PHOTO_KINDS.has(String(p.kind)) || gallery.includes(c.url) || !isPublicCampusPhoto(c.url, c.alt, siteUrl)) continue;
    gallery.push(c.url);
    if (gallery.length === MAX_GALLERY_IMAGES) break;
  }
  const modelCover = typeof model.cover_url === "string" ? byUrl.get(model.cover_url) : undefined;
  const cover = meta.find((u) => coverOk(u, ""))
    ?? (modelCover && coverOk(modelCover.url, modelCover.alt) ? modelCover.url : undefined)
    ?? gallery[0]
    ?? null;
  return { cover, gallery, classified };
}
