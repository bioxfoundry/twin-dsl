# Existing projects used by design

- `semcod/todo2code` — Intent Evidence DSL, evidence graph, Intent vs Reality, hash-bound plans and validation. Integrated through a local CLI adapter; not vendored.
- ClickHouse — target read model for full-text and analytical queries. Compose schema included.
- Docling — target document conversion/OCR service. Container adapter included.
- Subactor AQL/OQL/URI Process/TestQL/EQL — authority, execution and evidence gates; source documentation included under `docs/source/`.
- Protobuf/gRPC/Buf — contracts are supplied as `.proto`; Buf configuration can be added when the deployment chooses a registry.
- OpenUSD/glTF/3D Tiles — scene targets documented, not bundled in the MVP runtime.
