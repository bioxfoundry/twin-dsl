# Verification report — 0.2.0

Date: 2026-08-06

## Gates executed

The following command completed successfully in the build environment:

```bash
npm run verify
```

Verified results:

```text
TypeScript strict check:             PASS
Protobuf contract files:             7 PASS
Node unit/integration tests:          8/8 PASS
Offline query/tree/math pipeline:     PASS
NL → DSL fixtures:                    8/8 PASS
OpenRouter structured-output mock:    PASS
DQL sitemap/context crawler fixture:  PASS
Folder + ZIP researcher workflow:     PASS
Biofoundry initial build:             PASS
Biofoundry no-change path:             PASS
Biofoundry real-time update:          PASS
Biofoundry blocked publication:       PASS
```

## Reproducible demo values

Base query pipeline:

```text
Resources indexed: 3
Source snapshot: 2b3319ef3e60243c4885af7c519d65d72d9ee9749c8a2534568c38ff07025569
Result URI: urn:subactor:query-result:sha256:779a06c70158d56bbcb08bd11748d132bc28b468cf334b33c644b629e4be80c7
Result validation: true
mathDSL Executable: true
```

Researcher workflow:

```text
Search backend: memory
Local resources: 2
Web fixture pages: 2
Source snapshot: 85184674f56f8fedfce44bc30a2408900cca8b6da51d75e47e7ca363c86a521b
Result URI: urn:subactor:query-result:sha256:771584e68a8578458a19b62b5ec561604825dd05ba689638ffb1afea942f3cad
Validated: true
EvidenceReady: true
```

Biofoundry initial build:

```text
Source snapshot: 2e04052e2af4b0cd4d13cd5c112a0b59a1e6acb7e4af2dd1f75bcd92764289c3
Tree URI: urn:subactor:tree:sha256:0618e992cc30e7f0d9ce4863f69436d471f5ee4d525782b950d7406e1685db32
Math URI: urn:subactor:math:sha256:b5cae3cc822a7601cdc906319834d5328ed171ab4af8d4192f5c62b1875b1051
Twin URI: urn:subactor:twin:sha256:71b31aa08a7150bb609c35c63a77ee2087909073a58b48f79bff24a8865211c2
Scene URI: urn:subactor:scene:sha256:eb74e5f0047cd2883197cefa3b65e0145b39ef281bf98f8a5ed97ab3a8d15e99
Validation: true
```

Real-time Biofoundry simulation verified that:

1. a temperature change changes the source snapshot, Twin URI, Scene URI and OpenUSD attribute;
2. an unchanged snapshot returns `noChange=true` without a new scene;
3. exceeding the manager's active-bioreactor limit produces `SceneRebuildAllowed=false`;
4. a blocked candidate does not overwrite `current/scene.usda`.

The complete console transcript is stored in `verification/verify.log`.

## Controlled tests versus live tests

The following boundaries were tested with deterministic fixtures or controlled mocks:

- OpenRouter request shape and response validation — controlled HTTP mock, not a paid live model call;
- web research — sitemap/HTML fixtures plus the same crawler and network-safety code used by live mode;
- `todo2code` — public repository contracts and a contract-compatible fixture; the package calls a local real checkout when `T2C_ROOT` and `T2C_BIN` are configured;
- ClickHouse and Docling — adapters and Docker Compose definitions are included, but containers were not started because Docker is unavailable in the build environment;
- 3D output — deterministic OpenUSD ASCII (`.usda`) was generated; no external CAD/BIM validator or renderer was available.

No OpenRouter API key or other secret is included in the package.
