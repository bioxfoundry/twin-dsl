COMPOSE ?= docker compose
PORT ?= 7331
MODE ?= deterministic
FACTORY_DEMO_PROJECT := .factory-demo/project/project.projectdsl
FACTORY_DEMO_RUNTIME := .factory-demo/runtime
WORKSPACE_PROJECT := $(abspath ../projects/nanobionic-laboratory-md/project.projectdsl)
WORKSPACE_RUNTIME := $(abspath ../projects/nanobionic-laboratory-md/.living-runtime)
SPEC_SOURCE_DIR ?= $(CURDIR)/../nanobionic-laboratory/A. SPECIFIKACIJA
SPEC_MARKDOWN_DIR ?= $(CURDIR)/../nanobionic-laboratory-md/A. SPECIFIKACIJA
SPEC_DSL_DIR ?= $(CURDIR)/../nanobionic-laboratory-md-dsl/A. SPECIFIKACIJA
SPEC_BLUEPRINT ?= $(abspath ../projects/nanobionic-laboratory-md/baseline/scene-blueprint.json)
SPEC_INTENT_INDEX ?= $(abspath ../projects/nanobionic-laboratory-md/.living-runtime/current/intent-dsl.index.json)
SPEC_TWIN ?= $(abspath ../projects/nanobionic-laboratory-md/.living-runtime/current/twin.json)
SPEC_SCENE ?= $(abspath ../projects/nanobionic-laboratory-md/.living-runtime/current/scene.json)
SPEC_REPORT ?= $(abspath ../.ci-reports/specification-dsl-validation/final.json)
ifneq ($(wildcard $(WORKSPACE_PROJECT)),)
DASHBOARD_PROJECT ?= $(WORKSPACE_PROJECT)
DASHBOARD_RUNTIME ?= $(WORKSPACE_RUNTIME)
else
DASHBOARD_PROJECT ?= $(FACTORY_DEMO_PROJECT)
DASHBOARD_RUNTIME ?= $(FACTORY_DEMO_RUNTIME)
endif
# BuildKit is required for the pip cache mounts in deploy/docling/Dockerfile; without it every
# build re-downloads gigabytes of wheels.
export DOCKER_BUILDKIT = 1
export COMPOSE_DOCKER_CLI_BUILD = 1

.PHONY: verify demo research biofoundry realtime nl-dsl clean \
        up down down-clean restart build logs ps status service-check endpoints dashboard dashboard-demo \
        specification-validate prune-cache env

## --- configuration ---------------------------------------------------------
## Create .env from .env.example on first use, so the documented defaults are the ones that
## actually apply. An existing .env is never touched — it holds real credentials.
.env:
	@cp .env.example .env
	@echo "created .env from .env.example — review it before using this beyond localhost"

env: .env

## --- docker ----------------------------------------------------------------
## Start persistent services, wait for their Compose healthchecks, then probe from the host.
## The runtime is a one-shot `doctor` job and runs only after its dependencies are healthy.
up: .env
	$(COMPOSE) up -d --build --wait clickhouse docling
	@$(MAKE) --no-print-directory service-check
	$(COMPOSE) run --rm runtime
	@$(MAKE) --no-print-directory endpoints

## Stop the stack. Named volumes (clickhouse data, docling models) are kept on purpose,
## so the next `make up` does not re-download models or re-init the database.
down:
	$(COMPOSE) down

## Stop and delete the data volumes too. Costs a full model re-download next time.
down-clean:
	$(COMPOSE) down -v

restart: .env
	$(COMPOSE) down
	@$(MAKE) --no-print-directory up

## Build images without starting anything.
build: .env
	$(COMPOSE) build

logs:
	$(COMPOSE) logs -f --tail=100

ps status:
	$(COMPOSE) ps

## Check ClickHouse and Docling through their published host ports, including custom .env ports.
service-check: .env
	@set -a; . ./.env; set +a; \
		CLICKHOUSE_URL="http://127.0.0.1:$${CLICKHOUSE_HTTP_PORT:-18123}" \
		DOCLING_URL="http://127.0.0.1:$${DOCLING_PORT:-15001}" \
		CLICKHOUSE_USER="$${CLICKHOUSE_USER:-digital_twin}" \
		CLICKHOUSE_PASSWORD="$${CLICKHOUSE_PASSWORD:-digital_twin_local}" \
		node dist/src/cli/main.js service-check

## Print the local host endpoints after `make up`.
endpoints: .env
	@set -a; . ./.env; set +a; \
		echo "ClickHouse HTTP: http://127.0.0.1:$${CLICKHOUSE_HTTP_PORT:-18123}  (container :8123)"; \
		echo "ClickHouse native: 127.0.0.1:$${CLICKHOUSE_NATIVE_PORT:-19000}  (container :9000)"; \
		echo "Docling health/API: http://127.0.0.1:$${DOCLING_PORT:-15001}/health  (container :5001)"; \
		echo "Dashboard: NOT started by make up; from the workspace root run 'make dashboard' to open http://127.0.0.1:7331/"; \
		echo "Workspace factory: from the workspace root run 'make dashboard PORT=7332' when port 7331 is occupied"

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

## Validate the key specification PDF family through Markdown, intentDSL and the active Twin.
specification-validate:
	@test -d "$(SPEC_SOURCE_DIR)" || { echo "SPEC_SOURCE_DIR_MISSING:$(SPEC_SOURCE_DIR)"; exit 2; }
	@test -d "$(SPEC_MARKDOWN_DIR)" || { echo "SPEC_MARKDOWN_DIR_MISSING:$(SPEC_MARKDOWN_DIR)"; exit 2; }
	@test -d "$(SPEC_DSL_DIR)" || { echo "SPEC_DSL_DIR_MISSING:$(SPEC_DSL_DIR)"; exit 2; }
	@test -f "$(SPEC_BLUEPRINT)" || { echo "SPEC_BLUEPRINT_MISSING:$(SPEC_BLUEPRINT)"; exit 2; }
	@test -f "$(SPEC_INTENT_INDEX)" || { echo "SPEC_INTENT_INDEX_MISSING:$(SPEC_INTENT_INDEX)"; exit 2; }
	@test -f "$(SPEC_TWIN)" || { echo "SPEC_TWIN_MISSING:$(SPEC_TWIN)"; exit 2; }
	@test -f "$(SPEC_SCENE)" || { echo "SPEC_SCENE_MISSING:$(SPEC_SCENE)"; exit 2; }
	@npm run build >/dev/null
	@node dist/src/cli/main.js specification-dsl-validate \
		"$(SPEC_SOURCE_DIR)" "$(SPEC_MARKDOWN_DIR)" "$(SPEC_DSL_DIR)" \
		"$(SPEC_BLUEPRINT)" "$(SPEC_INTENT_INDEX)" "$(SPEC_TWIN)" "$(SPEC_SCENE)" "$(SPEC_REPORT)"

dashboard:
	@npm run build
	@if [ "$(DASHBOARD_PROJECT)" = "$(FACTORY_DEMO_PROJECT)" ]; then node scripts/ensure-factory-demo.mjs; fi
	@echo "Dashboard project: $(DASHBOARD_PROJECT)"
	@url="http://127.0.0.1:$(PORT)/"; \
		probe="$$(node scripts/dashboard-port-check.mjs "$(DASHBOARD_PROJECT)" "$(PORT)")" || { \
			echo "hint: stop the conflicting process or choose another port with 'make dashboard PORT=7332'"; exit 2; }; \
		echo "$$probe"; \
		case "$$probe" in DASHBOARD_PORT_REUSE:*) \
			if command -v xdg-open >/dev/null 2>&1; then xdg-open "$$url" >/dev/null 2>&1 & \
			elif command -v open >/dev/null 2>&1; then open "$$url"; \
			elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$$url"; \
			else echo "dashboard already running: $$url"; fi; exit 0;; \
		esac; \
		node dist/src/cli/main.js dashboard "$(DASHBOARD_PROJECT)" "$(DASHBOARD_RUNTIME)" "$(PORT)" "$(MODE)" & server_pid=$$!; \
		trap 'kill $$server_pid 2>/dev/null || true' EXIT INT TERM; \
		ready=0; for attempt in $$(seq 1 50); do \
		node -e 'fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' "$${url}api/state" && { ready=1; break; }; \
			kill -0 $$server_pid 2>/dev/null || exit 1; sleep 0.2; \
		done; \
		[ $$ready -eq 1 ] || { echo "DASHBOARD_READINESS_TIMEOUT:$$url"; exit 1; }; \
		if command -v xdg-open >/dev/null 2>&1; then xdg-open "$$url" >/dev/null 2>&1 & \
		elif command -v open >/dev/null 2>&1; then open "$$url"; \
		elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$$url"; \
		else echo "dashboard ready: $$url (open this URL in a browser)"; fi; \
		wait $$server_pid

dashboard-demo:
	@$(MAKE) --no-print-directory dashboard \
		DASHBOARD_PROJECT="$(FACTORY_DEMO_PROJECT)" \
		DASHBOARD_RUNTIME="$(FACTORY_DEMO_RUNTIME)"

clean:
	npm run clean
