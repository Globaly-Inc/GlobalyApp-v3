# Scrapling HTTP wrapper — mirrors the self-hosted Crawl4AI service's contract
# (POST /scrape, X-API-Key auth) so scraper.ts can treat it the same way.
#
# Internal cascade, cheapest first, escalates only on a short/blocked response:
#   1. Fetcher          — plain HTTP + TLS fingerprint impersonation
#   2. StealthyFetcher  — headless browser, solves Cloudflare Turnstile
#   3. DynamicFetcher   — full Playwright Chromium (last resort)
#
# ponytail: Scrapling's Response has no .markdown of its own (only its CLI/shell
# extras do this conversion) — markdownify() is scrapling's own approach, just
# called directly since we only need the [fetchers] extra, not [shell]/[ai].

import logging
import os

from fastapi import FastAPI, Header, HTTPException
from markdownify import markdownify
from pydantic import BaseModel
from scrapling.fetchers import DynamicFetcher, Fetcher, StealthyFetcher

MIN_CONTENT_LEN = 200
API_KEY = os.environ.get("SCRAPLING_API_KEY")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("scrapling-service")

app = FastAPI()


class ScrapeRequest(BaseModel):
    url: str


class ScrapeResponse(BaseModel):
    markdown: str
    html: str
    tier_used: str | None = None
    blocked: bool = False
    error: str | None = None


def to_markdown(page) -> tuple[str, str]:
    """Returns (markdown, html) for a Scrapling Response, or ("", "") if blocked/empty."""
    if page is None or getattr(page, "status", 200) in (403, 503):
        return "", ""
    html = str(page.html_content or "")
    return markdownify(html), html


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/scrape", response_model=ScrapeResponse)
def scrape(req: ScrapeRequest, x_api_key: str | None = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid API key")

    last_error = None
    logger.info(f"scrape start: {req.url}")

    try:
        page = Fetcher.get(req.url, impersonate="chrome", timeout=10)
        markdown, html = to_markdown(page)
        if len(markdown) >= MIN_CONTENT_LEN:
            logger.info(f"scrape OK via fetcher: {req.url} ({len(markdown)} chars)")
            return ScrapeResponse(markdown=markdown, html=html, tier_used="fetcher")
        logger.info(f"fetcher tier insufficient for {req.url}, escalating to stealthy")
    except Exception as err:  # noqa: BLE001 — any tier failing just escalates
        last_error = str(err)
        logger.warning(f"fetcher tier errored for {req.url}: {last_error}, escalating to stealthy")

    try:
        page = StealthyFetcher.fetch(
            req.url, headless=True, network_idle=True, solve_cloudflare=True, timeout=25_000,
        )
        markdown, html = to_markdown(page)
        if len(markdown) >= MIN_CONTENT_LEN:
            logger.info(f"scrape OK via stealthy: {req.url} ({len(markdown)} chars)")
            return ScrapeResponse(markdown=markdown, html=html, tier_used="stealthy")
        logger.info(f"stealthy tier insufficient for {req.url}, escalating to dynamic")
    except Exception as err:  # noqa: BLE001
        last_error = str(err)
        logger.warning(f"stealthy tier errored for {req.url}: {last_error}, escalating to dynamic")

    try:
        page = DynamicFetcher.fetch(req.url, headless=True, network_idle=True, timeout=30_000)
        markdown, html = to_markdown(page)
        blocked = len(markdown) < MIN_CONTENT_LEN
        if blocked:
            logger.warning(f"scrape blocked at dynamic tier (last tier): {req.url}")
        else:
            logger.info(f"scrape OK via dynamic: {req.url} ({len(markdown)} chars)")
        return ScrapeResponse(
            markdown=markdown,
            html=html,
            tier_used="dynamic",
            blocked=blocked,
            error=last_error if blocked else None,
        )
    except Exception as err:  # noqa: BLE001
        logger.error(f"dynamic tier errored (last tier) for {req.url}: {err}")
        return ScrapeResponse(markdown="", html="", blocked=True, error=str(err))
