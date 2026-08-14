// Superadmin country & city management routes.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, NotFoundError } from "../../../../shared/errors.js";
import * as storage from "../../../../shared/storage/storageService.js";
import { buildPaginatedResponse, PaginationSchema, paginationToOffset } from "../../../../shared/pagination.js";
import { config } from "../../../../config.js";
import * as repo from "../platform.repository.js";

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

export async function adminCountryRoutes(app: FastifyInstance) {
  // ── Countries ──

  app.get("/countries", async (req, reply) => {
    const { search, filter, ...pagination } = CountryListQuery.parse(req.query);
    const listFilters = { search, filter };
    const { limit, offset } = paginationToOffset(pagination);
    const [rows, total, stats] = await Promise.all([
      repo.listCountriesAdmin(limit, offset, listFilters),
      repo.countCountriesAdmin(listFilters),
      repo.countCountryStats(),
    ]);
    return reply.send({ ...buildPaginatedResponse(rows, total, pagination), stats });
  });

  app.get("/countries/:id", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const country = await repo.findCountryById(id);
    if (!country) throw new NotFoundError("Country not found");
    return reply.send(country);
  });

  app.post("/countries", async (req, reply) => {
    const data = CountryInput.parse(req.body);
    const row = await repo.insertCountry(data);
    return reply.status(201).send(row);
  });

  app.patch("/countries/:id", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const data = CountryInput.partial().parse(req.body);
    const existing = await repo.findCountryById(id);
    if (!existing) throw new NotFoundError("Country not found");
    const row = await repo.updateCountry(id, data);
    return reply.send(row);
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
    const rows = await repo.listCitiesByCountry(id);
    return reply.send({ cities: rows });
  });

  app.post("/countries/:id/cities", async (req, reply) => {
    const { id } = CountryIdParam.parse(req.params);
    const data = CityInput.parse(req.body);
    const row = await repo.insertCity({ ...data, country_id: id });
    return reply.status(201).send(row);
  });

  app.patch("/cities/:id", async (req, reply) => {
    const { id } = CityIdParam.parse(req.params);
    const data = CityInput.partial().parse(req.body);
    const row = await repo.updateCity(id, data);
    return reply.send(row);
  });

  app.delete("/cities/:id", async (req, reply) => {
    const { id } = CityIdParam.parse(req.params);
    await repo.deleteCity(id);
    return reply.status(204).send();
  });

  // ── Images ── manual upload only, returns a permanent public GCS URL.

  app.post("/countries/image", async (req, reply) => {
    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");
    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length, new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]));
    const storagePath = storage.buildPath("countries", file.filename);
    try {
      await storage.uploadFile(storagePath, buffer, file.mimetype);
    } catch {
      throw new AppError("Image upload failed — storage isn't configured correctly on this server.", 503, "STORAGE_UNAVAILABLE");
    }
    return reply.status(201).send({ url: `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}` });
  });

  app.post("/cities/image", async (req, reply) => {
    const file = await req.file();
    if (!file) throw new NotFoundError("No file uploaded");
    const buffer = await file.toBuffer();
    storage.validateFile(file.mimetype, buffer.length, new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]));
    const storagePath = storage.buildPath("cities", file.filename);
    try {
      await storage.uploadFile(storagePath, buffer, file.mimetype);
    } catch {
      throw new AppError("Image upload failed — storage isn't configured correctly on this server.", 503, "STORAGE_UNAVAILABLE");
    }
    return reply.status(201).send({ url: `https://storage.googleapis.com/${config.GCS_BUCKET_NAME}/${storagePath}` });
  });
}
