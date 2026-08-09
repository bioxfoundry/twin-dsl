# Autonomy examples

## Full verification

```bash
npm install
npm run verify
```

## Focused autonomy suite

```bash
npm test -- --test-name-pattern='authority|fixture|rate limit|lease|improvement'
npm run demo:autonomy
cat .autonomy-demo/summary.json
```

## Start a project

```bash
node dist/src/cli/main.js project-create \
  "Customer Biofoundry" \
  ./projects/customer-biofoundry \
  biofoundry \
  "Maintain a validated Biofoundry twin from manager, customer, code and runtime evidence."
```

## Import arbitrary local data

The command copies external data under `imports/`, preserving its availability inside Docker.
The angle-bracket paths below are illustrative mount points; replace them with paths that exist
on the host running the command:

```bash
node vendor/runtime/dist/src/cli/main.js project-add-source \
  project.projectdsl customer <customer-root>/specification.pdf

node vendor/runtime/dist/src/cli/main.js project-add-source \
  project.projectdsl archive <customer-root>/history.zip

node vendor/runtime/dist/src/cli/main.js project-add-source \
  project.projectdsl development <development-checkout>
```

Inspect `imports/manifest.jsonl` for provenance.

## Add website research

```bash
node vendor/runtime/dist/src/cli/main.js project-add-website \
  project.projectdsl \
  https://example.com/docs \
  "biofoundry, bioreactor, digital twin, safety"
```

Review the generated `config/research.dql` before the first crawl.

## Run one iteration

```bash
docker compose run --rm runtime \
  project-iterate \
  /project/project.projectdsl \
  /project/.living-runtime \
  deterministic
```

## Inspect state

```bash
docker compose run --rm runtime project-status /project/.living-runtime
cat .living-runtime/candidate/improvement.dsl
cat .living-runtime/latest.json
```

## Continuous mode

```bash
docker compose up -d --build --wait
docker compose logs -f runtime
```

## Safe transition from fixture to canonical todo2code

```bash
bash scripts/bootstrap-todo2code.sh
```

Then change:

```text
POLICY_ALLOW_DEVELOPMENT_FIXTURE false
POLICY_REQUIRE_DEVELOPMENT_ACCEPTANCE true
```

The runtime automatically prefers a built `todo2code` CLI over the fixture.
