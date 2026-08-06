# DQL profiles

Subactor/RelCom already uses a DQL profile for validated DOM adaptation. This starter adds a separate, non-conflicting profile:

```text
subactor.dql-crawl/v1
```

## DOM adaptation DQL

Purpose:

- choose an approved page variant;
- emit allowlisted DOM operations;
- validate operation count, content keys and consent;
- never execute arbitrary model output.

## Crawl DQL

Purpose:

- discover pages from `sitemap.xml` or sitemap indexes;
- restrict hosts and paths;
- apply context terms and budgets;
- convert selected pages to Markdown resources;
- preserve URL and content hash.

The crawl profile does not modify the remote page. The DOM profile does not become a general-purpose web crawler. Both preserve the rule:

```text
LLM proposal → parser → validator → fixed executor
```
