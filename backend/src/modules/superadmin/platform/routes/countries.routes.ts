// Superadmin country & city management routes.

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../../shared/errors.js";
import * as storage from "../../../../shared/storage/storageService.js";
import { buildPaginatedResponse, PaginationSchema, paginationToOffset } from "../../../../shared/pagination.js";
import { config } from "../../../../config.js";
import * as repo from "../platform.repository.js";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const CountryIdParam = z.object({ id: z.coerce.number().int().positive() });
const CityIdParam = z.object({ id: z.coerce.number().int().positive() });

const CountryListQuery = PaginationSchema.extend({
  search: z.string().optional(),
  filter: z.enum(["all", "active", "featured"]).optional(),
});

const Weather = z.object({
  label: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  temp_range: z.string().nullable().optional(),
}).nullable().optional();

const CountryInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  iso2: z.string().length(2),
  iso3: z.string().length(3),
  phone_code: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  currency_symbol: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  flag_emoji: z.string().nullable().optional(),
  capital: z.string().nullable().optional(),
  languages: z.array(z.string()).optional(),
  timezone: z.string().nullable().optional(),
  population: z.number().int().nullable().optional(),
  area_km2: z.number().int().nullable().optional(),
  about: z.string().nullable().optional(),
  why_study_here: z.string().nullable().optional(),
  hero_image_url: z.string().nullable().optional(),
  thumbnail_image_url: z.string().nullable().optional(),
  gallery_images: z.array(z.string()).optional(),
  youtube_embed_url: z.string().nullable().optional(),
  visa_type: z.string().nullable().optional(),
  visa_description: z.string().nullable().optional(),
  visa_processing_time: z.string().nullable().optional(),
  visa_fee: z.string().nullable().optional(),
  avg_tuition_min: z.number().nullable().optional(),
  avg_tuition_max: z.number().nullable().optional(),
  avg_tuition_currency: z.string().nullable().optional(),
  student_count_label: z.string().nullable().optional(),
  universities_count_label: z.string().nullable().optional(),
  cost_of_living_label: z.string().nullable().optional(),
  work_rights_label: z.string().nullable().optional(),
  weather_summer: Weather,
  weather_autumn: Weather,
  weather_winter: Weather,
  weather_spring: Weather,
  is_featured: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
});

const CityInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  state_name: z.string().nullable().optional(),
  hero_image_url: z.string().nullable().optional(),
  thumbnail_image_url: z.string().nullable().optional(),
  about: z.string().nullable().optional(),
  population_label: z.string().nullable().optional(),
  area_label: z.string().nullable().optional(),
  weather_label: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  highlights: z.array(z.string()).optional(),
  is_featured: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  status: z.enum(["active", "pending", "rejected"]).optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
});

export async function withImagePreviews<
  T extends { hero_image_url?: string | null; thumbnail_image_url?: string | null; gallery_images?: string[] | null },
>(country: T): Promise<T> {
  const [hero_image_url, thumbnail_image_url, gallery_images] = await Promise.all([
    storage.resolvePreviewUrl(country.hero_image_url),
    storage.resolvePreviewUrl(country.thumbnail_image_url),
    Promise.all((country.gallery_images ?? []).map((url) => storage.resolvePreviewUrl(url))),
  ]);
  return { ...country, hero_image_url, thumbnail_image_url, gallery_images };
}

export async function withCityImagePreviews<T extends { hero_image_url?: string | null; thumbnail_image_url?: string | null }>(
  city: T,
): Promise<T> {
  const [hero_image_url, thumbnail_image_url] = await Promise.all([
    storage.resolvePreviewUrl(city.hero_image_url),
    storage.resolvePreviewUrl(city.thumbnail_image_url),
  ]);
  return { ...city, hero_image_url, thumbnail_image_url };
}

function normalizeImageInput<
  T extends { hero_image_url?: string | null; thumbnail_image_url?: string | null; gallery_images?: string[] | null },
>(data: T): T {
  return {
    ...data,
    hero_image_url: data.hero_image_url != null ? storage.toStoragePath(data.hero_image_url) : data.hero_image_url,
    thumbnail_image_url:
      data.thumbnail_image_url != null ? storage.toStoragePath(data.thumbnail_image_url) : data.thumbnail_image_url,
    gallery_images: data.gallery_images?.map((url) => storage.toStoragePath(url)) ?? data.gallery_images,
  };
}

interface FilePart {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

async function readMultipartInput(req: FastifyRequest): Promise<{ data: Record<string, unknown>; files: Record<string, FilePart[]> }> {
  const files: Record<string, FilePart[]> = {};
  let data: Record<string, unknown> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      storage.validateFile(part.mimetype, buffer.length, IMAGE_MIME_TYPES);
      (files[part.fieldname] ??= []).push({ buffer, mimetype: part.mimetype, filename: part.filename });
    } else if (part.fieldname === "data") {
      data = JSON.parse(part.value as string);
    }
  }
  return { data, files };
}

async function uploadImage(file: FilePart, prefix: string): Promise<string> {
  const storagePath = storage.buildPath(prefix, file.filename);
  await storage.uploadFile(storagePath, file.buffer, file.mimetype);
  return `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}`;
}

async function resolveUploadedImages(data: Record<string, unknown>, files: Record<string, FilePart[]>, prefix: string) {
  if (files.hero_image?.[0]) data.hero_image_url = await uploadImage(files.hero_image[0], prefix);
  if (files.thumbnail_image?.[0]) data.thumbnail_image_url = await uploadImage(files.thumbnail_image[0], prefix);
  if (Array.isArray(data.gallery_images)) {
    const galleryFiles = files.gallery_image ?? [];
    let next = 0;
    const resolved = await Promise.all(
      (data.gallery_images as (string | null)[]).map((slot) => (slot !== null ? Promise.resolve(slot) : uploadImage(galleryFiles[next++], prefix))),
    );
    data.gallery_images = resolved.filter((u): u is string => u !== null);
  }
  return data;
}

export async function adminCountryRoutes(app: FastifyInstance) {
  // ── Countries ──

  app.get("/countries", async (req, reply) => {
    const { search, filter, ...pagination } = CountryListQuery.parse(req.query);
    const listFilters = { search, filter };
    const { limit, offset } = paginationToOffset(pagination);
    const [rawRows, total, stats] = await Promise.all([
      repo.listCountriesAdmin(limit, offset, listFilters),
      repo.countCountriesAdmin(listFilters),
      repo.countCountryStats(),
    ]);
    const rows = await Promise.all(rawRows.map(withImagePreviews));
    return reply.send({ ...buildPaginatedResponse(rows, total, pagination), stats });
  });

  app.get("/countries/:id", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const country = await repo.findCountryById(id);
    if (!country) throw new NotFoundError("Country not found");
    return reply.send(await withImagePreviews(country));
  });

  app.post("/countries", async (req, reply) => {
    const { data: raw, files } = await readMultipartInput(req);
    const data = normalizeImageInput(CountryInput.parse(await resolveUploadedImages(raw, files, "countries")));
    const row = await repo.insertCountry(data);
    return reply.status(201).send(await withImagePreviews(row));
  });

  app.patch("/countries/:id", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const { data: raw, files } = await readMultipartInput(req);
    const data = normalizeImageInput(CountryInput.partial().parse(await resolveUploadedImages(raw, files, "countries")));
    const existing = await repo.findCountryById(id);
    if (!existing) throw new NotFoundError("Country not found");
    const row = await repo.updateCountry(id, data);
    return reply.send(await withImagePreviews(row));
  });

  app.delete("/countries/:id", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const existing = await repo.findCountryById(id);
    if (!existing) throw new NotFoundError("Country not found");
    await repo.deleteCountry(id);
    return reply.status(204).send();
  });

  // ── Cities ──

  app.get("/countries/:id/cities", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const rawRows = await repo.listCitiesByCountry(id);
    const rows = await Promise.all(rawRows.map(withCityImagePreviews));
    return reply.send({ cities: rows });
  });

  app.post("/countries/:id/cities", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const { data: raw, files } = await readMultipartInput(req);
    const data = normalizeImageInput(CityInput.parse(await resolveUploadedImages(raw, files, "cities")));
    const row = await repo.insertCity({ ...data, country_id: id });
    return reply.status(201).send(await withCityImagePreviews(row));
  });

  app.patch("/cities/:id", async (req, reply) => {
    const { id } = CityIdParam.parse(req.params);
    const { data: raw, files } = await readMultipartInput(req);
    const data = normalizeImageInput(CityInput.partial().parse(await resolveUploadedImages(raw, files, "cities")));
    const row = await repo.updateCity(id, data);
    return reply.send(await withCityImagePreviews(row));
  });

  app.delete("/cities/:id", async (req, reply) => {
    const { id } = CityIdParam.parse(req.params);
    await repo.deleteCity(id);
    return reply.status(204).send();
  });
}
