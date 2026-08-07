// Superadmin country & city management routes.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../../../shared/errors.js";
import * as repo from "../platform.repository.js";

const CountryIdParam = z.object({ id: z.coerce.number().int().positive() });
const CityIdParam = z.object({ id: z.coerce.number().int().positive() });

const CountryInput = z.object({
  name: z.string().min(1).max(200),
  iso2: z.string().length(2),
  iso3: z.string().length(3),
  phone_code: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  currency_symbol: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const CityInput = z.object({
  name: z.string().min(1).max(200),
  state_name: z.string().nullable().optional(),
});

export async function adminCountryRoutes(app: FastifyInstance) {
  // ── Countries ──

  app.get("/countries", async (_req, reply) => {
    const rows = await repo.listCountriesAdmin();
    return reply.send({ countries: rows });
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
}
