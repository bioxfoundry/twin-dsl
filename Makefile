COMPOSE ?= docker compose
# BuildKit is required for the pip cache mounts in deploy/docling/Dockerfile; without it every
# build re-downloads gigabytes of wheels.
export DOCKER_BUILDKIT = 1
export COMPOSE_DOCKER_CLI_BUILD = 1

.PHONY: verify demo research biofoundry realtime nl-dsl clean \
        up down down-clean restart build logs ps status service-check dashboard prune-cache env

## --- configuration ---------------------------------------------------------
## Create .env from .env.example on first use, so the documented defaults are the ones that
## actually apply. An existing .env is never touched — it holds real credentials.
.env:
	@cp .env.example .env
	@echo "created .env from .env.example — review it before using this beyond localhost"

env: .env

## --- docker ----------------------------------------------------------------
## Start the stack, rebuilding only what changed. Repeat runs reuse the pip cache.
up: .env
	$(COMPOSE) up -d --build

## Stop the stack. Named volumes (clickhouse data, docling models) are kept on purpose,
## so the next `make up` does not re-download models or re-init the database.
down:
	$(COMPOSE) down

## Stop and delete the data volumes too. Costs a full model re-download next time.
down-clean:
	$(COMPOSE) down -v

restart: .env
	$(COMPOSE) down
	$(COMPOSE) up -d --build

## Build images without starting anything.
build: .env
	$(COMPOSE) build

logs:
	$(COMPOSE) logs -f --tail=100

ps status:
	$(COMPOSE) ps

## Check that ClickHouse and Docling answer through their published ports.
service-check:
	CLICKHOUSE_URL=http://127.0.0.1:$${CLICKHOUSE_HTTP_PORT:-18123} \
	DOCLING_URL=http://127.0.0.1:$${DOCLING_PORT:-15001} \
	CLICKHOUSE_USER=$${CLICKHOUSE_USER:-digital_twin} \
	CLICKHOUSE_PASSWORD=$${CLICKHOUSE_PASSWORD:-digital_twin_local} \
	node dist/src/cli/main.js service-check

## Drop the BuildKit cache. Only useful when you actually want a cold rebuild.
prune-cache:
	docker builder prune -f

## --- node ------------------------------------------------------------------
verify:
	npm run verify

demo:
	npm run demo

research:
	npm run demo:research

biofoundry:
	npm run demo:biofoundry

realtime:
	npm run demo:realtime

nl-dsl:
	npm run demo:nl-dsl

dashboard:
	npm run build && node dist/src/cli/main.js dashboard .factory-demo/project/project.projectdsl .factory-demo/runtime 7331

clean:
	npm run clean
