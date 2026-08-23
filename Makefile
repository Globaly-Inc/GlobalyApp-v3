SHELL := /bin/bash

.DEFAULT_GOAL := help

WORKER_PROFILES := globalyapp-extraction globalyapp-extraction-pages globalyapp-extraction-verify globalyapp-extraction-step globalyapp-extraction-schedule globalyapp-extraction-agentcis globalyapp-ai-knowledge-crawl globalyapp-ai-knowledge-recrawl
WORKER_PROFILE_FLAGS := $(foreach p,$(WORKER_PROFILES),--profile $(p))

build:
	docker compose build --parallel

build-no-cache:
	docker compose build --parallel --no-cache

up:
	docker compose up -d

up-workers:
	docker compose $(WORKER_PROFILE_FLAGS) up -d

up-extraction:
	docker compose --profile globalyapp-extraction up -d extraction-worker

up-extraction-pages:
	docker compose --profile globalyapp-extraction-pages up -d extraction-pages-worker

up-extraction-verify:
	docker compose --profile globalyapp-extraction-verify up -d extraction-verify-worker

up-extraction-step:
	docker compose --profile globalyapp-extraction-step up -d extraction-step-worker

up-extraction-schedule:
	docker compose --profile globalyapp-extraction-schedule up -d extraction-schedule-worker

up-ai-knowledge-crawl:
	docker compose --profile globalyapp-ai-knowledge-crawl up -d ai-knowledge-crawl-worker ai-knowledge-recrawl-worker

up-ai-knowledge-recrawl:
	docker compose --profile globalyapp-ai-knowledge-recrawl up -d ai-knowledge-recrawl-worker

up-extraction-agentcis:
	docker compose --profile globalyapp-extraction-agentcis up -d extraction-agentcis-worker

down:
	docker compose down

down-workers:
	docker compose $(WORKER_PROFILE_FLAGS) down

down-extraction:
	docker compose --profile globalyapp-extraction stop extraction-worker

down-extraction-pages:
	docker compose --profile globalyapp-extraction-pages stop extraction-pages-worker

down-extraction-verify:
	docker compose --profile globalyapp-extraction-verify stop extraction-verify-worker

down-extraction-step:
	docker compose --profile globalyapp-extraction-step stop extraction-step-worker

down-extraction-schedule:
	docker compose --profile globalyapp-extraction-schedule stop extraction-schedule-worker

down-ai-knowledge-crawl:
	docker compose --profile globalyapp-ai-knowledge-crawl stop ai-knowledge-crawl-worker

down-ai-knowledge-recrawl:
	docker compose --profile globalyapp-ai-knowledge-recrawl stop ai-knowledge-recrawl-worker

down-extraction-agentcis:
	docker compose --profile globalyapp-extraction-agentcis stop extraction-agentcis-worker

restart:
	docker compose restart

migrate-globalyapp:
	docker compose exec backend npm run migrate:globalyapp

migrate-superadmin:
	docker compose exec backend npm run migrate:superadmin

migrate-tenants:
	docker compose exec backend npm run migrate:tenants

seed-globalyapp:
	docker compose exec backend npm run seed:globalyapp

seed-superadmin:
	docker compose exec backend npm run seed:superadmin

logs-frontend:
	docker compose logs -f frontend-dev

logs-backend:
	docker compose logs -f backend

logs-workers:
	docker compose $(WORKER_PROFILE_FLAGS) logs -f auth-worker extraction-worker extraction-pages-worker extraction-verify-worker extraction-step-worker extraction-schedule-worker extraction-agentcis-worker ai-knowledge-crawl-worker

logs-extraction:
	docker compose --profile globalyapp-extraction logs -f extraction-worker

logs-extraction-pages:
	docker compose --profile globalyapp-extraction-pages logs -f extraction-pages-worker

logs-extraction-verify:
	docker compose --profile globalyapp-extraction-verify logs -f extraction-verify-worker

logs-extraction-step:
	docker compose --profile globalyapp-extraction-step logs -f extraction-step-worker

logs-extraction-schedule:
	docker compose --profile globalyapp-extraction-schedule logs -f extraction-schedule-worker

logs-ai-knowledge-crawl:
	docker compose --profile globalyapp-ai-knowledge-crawl logs -f ai-knowledge-crawl-worker

logs-ai-knowledge-recrawl:
	docker compose --profile globalyapp-ai-knowledge-recrawl logs -f ai-knowledge-recrawl-worker

logs-extraction-agentcis:
	docker compose --profile globalyapp-extraction-agentcis logs -f extraction-agentcis-worker

ps:
	docker compose ps

help:
	@echo "Available targets:"
	@echo "  build                       Build all images (parallel)"
	@echo "  build-no-cache              Build all images without cache"
	@echo "  up                          Start core services (postgres, backend, auth-worker, frontend-dev, lavinmq, dragonfly, mailpit)"
	@echo "  up-workers                  Start core services + all extraction workers (all profiles)"
	@echo "  up-extraction               Start only the extraction-worker (profile: globalyapp-extraction)"
	@echo "  up-extraction-pages         Start only the extraction-pages-worker (profile: globalyapp-extraction-pages)"
	@echo "  up-extraction-verify        Start only the extraction-verify-worker (profile: globalyapp-extraction-verify)"
	@echo "  up-extraction-step          Start only the extraction-step-worker (profile: globalyapp-extraction-step)"
	@echo "  up-extraction-schedule      Start only the extraction-schedule-worker (profile: globalyapp-extraction-schedule)"
	@echo "  up-ai-knowledge-crawl       Start only the ai-knowledge-crawl-worker (profile: globalyapp-ai-knowledge-crawl)"
	@echo "  up-ai-knowledge-recrawl     Start only the ai-knowledge-recrawl-worker (profile: globalyapp-ai-knowledge-recrawl)"
	@echo "  up-extraction-agentcis      Start only the extraction-agentcis-worker (profile: globalyapp-extraction-agentcis)"
	@echo "  down                        Stop and remove core services"
	@echo "  down-workers                Stop all extraction workers"
	@echo "  down-extraction             Stop only the extraction-worker"
	@echo "  down-extraction-pages       Stop only the extraction-pages-worker"
	@echo "  down-extraction-verify      Stop only the extraction-verify-worker"
	@echo "  down-extraction-step        Stop only the extraction-step-worker"
	@echo "  down-extraction-schedule    Stop only the extraction-schedule-worker"
	@echo "  down-ai-knowledge-crawl     Stop only the ai-knowledge-crawl-worker"
	@echo "  down-ai-knowledge-recrawl   Stop only the ai-knowledge-recrawl-worker"
	@echo "  down-extraction-agentcis    Stop only the extraction-agentcis-worker"
	@echo "  restart                     Restart running services"
	@echo "  migrate-globalyapp          Run globalyapp DB migrations"
	@echo "  migrate-superadmin          Run superadmin DB migrations"
	@echo "  migrate-tenants             Run tenant DB migrations"
	@echo "  seed-globalyapp             Seed globalyapp DB"
	@echo "  seed-superadmin             Seed superadmin DB"
	@echo "  logs-frontend               Tail frontend-dev logs"
	@echo "  logs-backend                Tail backend logs"
	@echo "  logs-workers                Tail all worker logs"
	@echo "  logs-extraction             Tail extraction-worker logs"
	@echo "  logs-extraction-pages       Tail extraction-pages-worker logs"
	@echo "  logs-extraction-verify      Tail extraction-verify-worker logs"
	@echo "  logs-extraction-step        Tail extraction-step-worker logs"
	@echo "  logs-extraction-schedule    Tail extraction-schedule-worker logs"
	@echo "  logs-ai-knowledge-crawl     Tail ai-knowledge-crawl-worker logs"
	@echo "  logs-ai-knowledge-recrawl   Tail ai-knowledge-recrawl-worker logs"
	@echo "  logs-extraction-agentcis    Tail extraction-agentcis-worker logs"
	@echo "  ps                          List running services"

.PHONY: build build-no-cache up up-workers \
	up-extraction up-extraction-pages up-extraction-verify up-extraction-step up-extraction-schedule up-extraction-agentcis up-ai-knowledge-crawl up-ai-knowledge-recrawl \
	down down-workers \
	down-extraction down-extraction-pages down-extraction-verify down-extraction-step down-extraction-schedule down-extraction-agentcis down-ai-knowledge-crawl down-ai-knowledge-recrawl \
	restart migrate-globalyapp migrate-superadmin migrate-tenants seed-globalyapp seed-superadmin \
	logs-frontend logs-backend logs-workers \
	logs-extraction logs-extraction-pages logs-extraction-verify logs-extraction-step logs-extraction-schedule logs-extraction-agentcis logs-ai-knowledge-crawl logs-ai-knowledge-recrawl \
	ps help
