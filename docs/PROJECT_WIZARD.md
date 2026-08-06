# Living project wizard

```bash
node dist/src/cli/main.js project-create "Plant Twin" ./projects/plant generic "Manager intent"
```

Generated services:

- ClickHouse read projection;
- Docling conversion service;
- TypeScript living runtime watcher;
- optional mounted local `todo2code` checkout.

Generated project commands:

```bash
node vendor/runtime/dist/src/cli/main.js project-verify project.projectdsl
docker compose run --rm runtime project-iterate /project/project.projectdsl /project/.living-runtime deterministic
docker compose up -d --build
```

Each directory is a separate Compose project with its own generated default ports and ClickHouse volume. `COMPOSE_PROJECT_NAME` can override the generated name.
