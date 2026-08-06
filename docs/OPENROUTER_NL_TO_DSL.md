# OpenRouter: NL → *DSL

## Zakres

`NlDslCompiler` zapewnia jedną granicę dla:

```text
NL → intentDSL   przez todo2code
NL → resourceDSL plan
NL → queryDSL
NL → DQL crawl
NL → treeDSL
NL → mathDSL
NL → twinDSL
NL → sceneDSL
```

## Dlaczego Intent pozostaje w todo2code

`todo2code` już posiada:

- `t2c.intent/v1`;
- klasy epistemiczne;
- provenance runtime-owned;
- tryby `deterministic|prefer-llm|require-llm`;
- walidację structured outputs;
- graf i diagnostykę Intent vs Reality.

Starter wywołuje jego CLI:

```bash
t2c extract nl request.md --root <tmp> --out intent.jsonl
```

Konfiguracja:

```dotenv
T2C_ROOT=/home/tom/github/semcod/todo2code
T2C_BIN=/home/tom/github/semcod/todo2code/dist/src/cli.js
T2C_NL_MODE=require-llm
```

## Pozostałe DSL

OpenRouter otrzymuje:

- systemową instrukcję dotyczącą authority i zakazu wymyślania dowodów;
- natural-language request;
- runtime context zawierający dozwolone URI, snapshot, manager policy i dane;
- JSON Schema właściwe dla etapu.

Wysyłane ustawienia:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "strict": true,
      "schema": {}
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
- parser `mathDSL` po odpowiedzi.
