# Real-time 3D Biofoundry Digital Twin

## Źródła i precedence

1. **Manager** — twarde bramki i authority.
2. **Customer** — wymagania oraz zweryfikowane wymiary.
3. **Project** — stan obserwowany.
4. **Internet** — kontekst researchowy.
5. **Archive ZIP** — dowody historyczne.
6. **Derived** — wyniki query, math i symulacji.

Źródło niższego poziomu nie nadpisuje wyższego bez jawnej reguły.

## Start runtime

```bash
node dist/src/cli/main.js biofoundry-build \
  examples/biofoundry/biofoundry.config.json \
  .biofoundry-run \
  deterministic
```

Runtime:

1. skanuje katalogi;
2. bezpiecznie odczytuje ZIP-y bez ekstrakcji na dysk;
3. uruchamia opcjonalny DQL/sitemap crawl;
4. konwertuje materiały do Markdown;
5. materializuje `resource/v1`;
6. tworzy snapshot;
7. porównuje go z poprzednim;
8. buduje `treeDSL`;
9. buduje lub proponuje `mathDSL`, `twinDSL`, `sceneDSL`;
10. wykonuje twarde bramki;
11. generuje `.usda`;
12. zapisuje receipt.

## Real-time watcher

```bash
node dist/src/cli/main.js biofoundry-watch \
  examples/biofoundry/biofoundry.config.json \
  .biofoundry-live \
  prefer-llm
```

W danym momencie działa najwyżej jeden build. Zmiany napływające podczas builda zostaną wykryte w następnym skanie.

## Przykłady zmian

### Temperatura 37 → 39°C

Zmienia się:

- hash `current-state.json`;
- source snapshot;
- `twinUri`;
- `sceneUri`, ponieważ binding wskazuje immutable Twin URI;
- atrybut `subactor:temperatureC` w OpenUSD.

### Nowe urządzenie klienta

Po dodaniu elementu do `equipment-spec.json`:

- `treeDSL` otrzymuje nowy zasób/revision;
- `twinDSL` otrzymuje komponent;
- `scene.diff.json` zawiera `added`;
- OpenUSD otrzymuje nowy prim.

### Przekroczenie limitu

Gdy `activeBioreactors > maxActiveBioreactors`:

```text
CapacityWithinLimit=false
SceneRebuildAllowed=false
```

Kandydat jest zapisany do audytu, lecz `current/` nie jest nadpisywany.

### Manager wycofuje zgodę

`approved=false` blokuje publikację niezależnie od wyniku LLM.

## Geometry fidelity

Scena startera jest konceptualna. Używa primitive `Cube`, `Cylinder`, `Sphere` i `Scope`. Nie udaje CAD/BIM. Integracja produkcyjna może podmienić asset URI na IFC, STEP, USD lub glTF po weryfikacji geometrii.

## Brak zmiany

Jeżeli content snapshot jest identyczny z poprzednim, runtime zwraca `noChange=true`. Nie wywołuje OpenRouter, nie zmienia `observedAt`, nie tworzy nowego Twin/Scene URI i nie zapisuje nowej sceny.
