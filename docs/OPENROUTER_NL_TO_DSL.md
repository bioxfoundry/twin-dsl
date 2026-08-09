# OpenRouter: NL → patchDSL → *DSL

## Zakres

`NlDslCompiler` zapewnia jedną granicę dla:

```text
NL → intentDSL   (deterministyczna baza todo2code + patchDSL)
NL → resourceDSL plan
NL → queryDSL
NL → DQL crawl
NL → treeDSL
NL → mathDSL
NL → twinDSL
NL → sceneDSL
```

## Rola todo2code w Intent

`todo2code` już posiada:

- `t2c.intent/v1`;
- klasy epistemiczne;
- provenance runtime-owned;
- tryby `deterministic|prefer-llm|require-llm`;
- walidację structured outputs;
- graf i diagnostykę Intent vs Reality.

Starter wywołuje jego CLI w trybie deterministycznym, aby uzyskać stan bazowy:

```bash
t2c extract nl request.md --root <tmp> --out intent.jsonl
```

Konfiguracja:

```dotenv
T2C_ROOT=/home/tom/github/semcod/todo2code
T2C_BIN=/home/tom/github/semcod/todo2code/dist/src/cli.js
T2C_NL_MODE=deterministic
```

Ewentualne wzbogacenie przez model nie jest delegowane do klienta LLM `todo2code`. Przechodzi
przez tę samą lokalną granicę patchDSL co pozostałe artefakty.

## Jedyna granica LLM

OpenRouter otrzymuje:

- `LLM_POLICY subactor.llm-policy/v1` zapisane jako DSL;
- `LLM_CONTEXT subactor.llm-context/v1` z żądaniem, stanem bazowym i dozwolonymi ścieżkami;
- JSON Schema docelowego artefaktu i koperty patcha;
- gramatykę GGML GBNF dla `subactor.patch-dsl/v1`;
- SHA-256 kanonicznego stanu bazowego.

Model nie zwraca Twin, Scene, mathDSL ani tekstu bezpośrednio. Jedynym wynikiem jest:

```text
PATCHDSL "subactor.patch-dsl/v1"
TARGET "math"
BASE_SHA256 "<64 lowercase hex>"
SET "/dsl" "MATH proposed-v1\n..."
END_PATCH
```

Tekst patchDSL znajduje się w ścisłej kopercie `subactor.patch-envelope/v1`. Lokalny algorytm
sprawdza kopertę, gramatykę, target, hash bazy, limit operacji, bezpieczeństwo JSON Pointer i
listę dozwolonych korzeni. Dopiero potem stosuje patch do kopii bazy i przekazuje wynik do
istniejącego parsera oraz walidatora domenowego. Model nie wykonuje patcha i nie zapisuje plików.

Indeks zasobów jest kompaktowany do pól tożsamości/proweniencji i ograniczony przez
`DT_LLM_RESOURCE_CONTEXT_LIMIT` (domyślnie 80). Pełny korpus nadal pozostaje wejściem
deterministycznych walidatorów; limit dotyczy tylko propozycji LLM.

Wysyłane ustawienia:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "strict": true,
      "schema": {
        "properties": {
          "schema": {"const":"subactor.patch-envelope/v1"},
          "patchDsl": {"type":"string"}
        }
      }
    }
  },
  "provider": {
    "require_parameters": true,
    "data_collection": "deny"
  },
  "temperature": 0,
  "stream": false
}
```

Opcjonalnie:

```json
{"plugins":[{"id":"response-healing"}]}
```

## Tryby

### deterministic

Brak sieci. Runtime waliduje wersjonowany fixture lub wynik deterministycznego generatora.

### prefer-llm

Najpierw OpenRouter. Błąd powoduje jawny fallback:

```json
{
  "effectiveMode":"deterministic",
  "degraded":true,
  "reason":"OPENROUTER_..."
}
```

Skrót CLI `llm` jest aliasem `prefer-llm`, a nie `require-llm`.

The developer-safe defaults are a 30-second timeout and one retry/repair attempt per artifact
(`OPENROUTER_TIMEOUT_MS=30000`, `OPENROUTER_MAX_RETRIES=1`). This prevents an unavailable weak
model from occupying a dashboard iteration for many multiples of two minutes. Production may
raise the values explicitly; `prefer-llm` still records the timeout and falls back to the locally
validated deterministic artifact.

### require-llm

Brak klucza, timeout, niezgodna odpowiedź lub błąd schematu kończą operację błędem. Nie występuje ukryty fallback.

## Resource DSL

LLM nie tworzy finalnego `subactor.resource/v1`, ponieważ nie zna treści ani SHA-256. Z NL powstaje wyłącznie:

```text
subactor.resource-plan/v1 status=proposed
```

Dopiero importer odczytuje źródło i materializuje immutable resource URI.

## Test mock

`test/openrouter.test.ts` uruchamia prawdziwy klient Fetch przeciw kontrolowanemu mockowi i sprawdza:

- `json_schema`;
- `strict=true`;
- `require_parameters=true`;
- `data_collection=deny`;
- `response-healing`;
- brak klucza API w wyniku;
- parser patchDSL i parser `mathDSL` po kontrolowanym zastosowaniu patcha;
- odrzucenie złego hasha bazy, targetu, obcej ścieżki i niebezpiecznego JSON Pointer;
- korektę słabszego modelu: kod lokalnego parsera (np. `MATH_HEADER_REQUIRED`) wraca w następnej
  próbie jako `LLM_REPAIR`; Markdown fence i swobodna proza są odrzucane.

## Zweryfikowany GLM-5.2

Przebieg projektu `nanobionic-laboratory-md` z `z-ai/glm-5.2`, limitem 30 s i jedną naprawą:

- MathDSL: LLM PASS, 3.3 s;
- TwinDSL: timeout, jawny deterministic fallback;
- SceneDSL: odpowiedź po 22.2 s odrzucona przez grounding, jawny fallback;
- kompletna iteracja: 124 s, `validation.ok=true`.

Powtórzenie przez dokładnie tę samą ścieżkę co przycisk dashboardu (`POST /api/iterate`) również
przeszło: MathDSL 9.3 s przez Baidu/OpenRouter, Twin i Scene zakończone kontrolowanym timeoutem i
fallbackiem, całość 141.6 s, `validation.ok=true`. `logs/dashboard-7445.log` zawiera odpowiadające
mu zdarzenia `iteration:start` oraz `iteration:complete`.

Po aktywowaniu rzeczywistego providera development `todo2code` zamiast fixture wykonano kolejne
dwa pełne przebiegi. MathDSL przeszedł przez Together (34.7 s), a potem Baidu (36.4 s); SceneDSL
został raz odrzucony przez domain grounding, a pozostałe kosztowne projekcje zakończyły się jawnym
fallbackiem. Obie rewizje miały `validation.ok=true`, po czym pętla osiągnęła `noChange=true` z
diffem `0/0/0` i stabilnym fingerprintem todo2code.

`generation-audit.json` przechowuje model/provider, czas, tokeny, koszt oraz `degraded/reason`.
W trybie developerskim dashboard powinien używać `prefer-llm`; 30 s na artefakt jest rozsądnym
budżetem operacyjnym, podczas gdy deterministyczne CAD/Assembly/TwinState nie zależą od modelu.
