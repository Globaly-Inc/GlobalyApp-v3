# Scrapling service

Self-hosted HTTP wrapper around [Scrapling](https://github.com/D4Vinci/Scrapling)'s
Python scraper, used as the primary tier in `scraper.ts`'s scrape cascade
(Scrapling → Crawl4AI → Firecrawl). Not provisioned by this repo's
`docker-compose.yml` — same as Crawl4AI, it's just an external URL + API key
the backend calls.

## Run it

```bash
docker build -t scrapling-service .
docker run -p 8000:8000 -e SCRAPLING_API_KEY=your-secret scrapling-service
```

## Deploy it

Same shape as the existing Crawl4AI deployment: any host that can run a
long-lived Docker container works (Railway, Fly.io, a VPS). Point the
backend's `SCRAPLING_BASE_URL` at wherever it ends up and set
`SCRAPLING_API_KEY` to match `-e SCRAPLING_API_KEY` above.

Note: the browser tiers (`StealthyFetcher`, `DynamicFetcher`) need real CPU/
memory — don't put this on the smallest instance tier.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /scrape` — body `{ "url": "..." }`, header `X-API-Key: <SCRAPLING_API_KEY>`
  if set. Returns `{ markdown, html, tier_used, blocked, error }`.
