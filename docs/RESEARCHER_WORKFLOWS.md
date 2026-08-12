# End-to-end researcher workflows

## 1. Analyze a local folder and customer ZIP

Goal: build a requirements tree and detect inconsistencies.

```text
manager/ + customer/ + customer.zip
→ resource plan
→ converter
→ treeDSL
→ queryDSL
→ evidence result
→ todo2code result record
```

Command:

```bash
npm run demo:research
```

Uses:

- audit of implementation documentation;
- comparison of current specification with archive;
- detection of deprecated components;
- building a source-addressed knowledge tree.

## 2. Internet research via DQL and sitemap

DQL:

```text
DQL biofoundry-web
SITEMAPS [https://example.org/sitemap.xml]
ALLOW_HOSTS [example.org]
INCLUDE [/docs/**, /products/**]
EXCLUDE [/privacy, /login]
CONTEXT [biofoundry, bioreactor, digital twin]
MAX_URLS 100
MAX_SITEMAPS 10
SAME_ORIGIN true
RESPECT_ROBOTS true
OUTPUT markdown
VALIDATE [same-origin, citations, budget]
```

Crawler:

1. reads `urlset` or `sitemapindex`;
2. checks protocol, host, and protection against private addresses;
3. applies include/exclude rules;
4. enforces budget;
5. converts HTML to Markdown;
6. nadaje resource URI;
7. preserves the URL and revision hash.

The Internet is a contextual source. It cannot override manager policy or verified client dimensions.

## 3. Research with a logical question

Question:

> Does the system have sufficient evidence to rebuild the scene?

`queryDSL` finds required documents. `mathDSL` materializes the gateway:

```text
EXPR SceneRebuildAllowed = AND(
  ManagerApproved,
  CustomerDocumentationPresent,
  ProjectStatePresent,
  CapacityWithinLimit
)
```

The result contains a binding of each predicate to the source URI. This is not a free LLM response.

## 4. Research updating Digital Twin

Example:

- manager changes bioreactor limit;
- client adds a new device dimension;
- project saves a new temperature;
- sitemap publishes a new technical instruction.

The Watcher creates a resource diff. The Starter safely rebuilds the entire projection candidate; the map below shows which production incremental planner projections can later be selectively recalculated:

```text
manager change → math + twin + scene
customer geometry → twin + scene
project telemetry → twin + scene
internet context → tree/query; scene only after an explicit relation and validation
archive history → tree/query; no automatic observed state
```

## 5. Research → development

The research result can be passed to `todo2code` as `result` or a run document. Next run:

```text
validated query result
→ t2c Intent Evidence DSL
→ graph + diagnostics
→ code-change plan
→ hash-bound review
→ implementation
→ re-analysis
```

A positive analysis does not automatically mean `DONE`.
