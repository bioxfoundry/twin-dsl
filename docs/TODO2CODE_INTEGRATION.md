# todo2code integration

Canonical repository:

```text
https://github.com/semcod/todo2code
```

The similarly named `semcod/todo2coded` repository was not found and is not used.

## Runtime relationship

```text
human/agent NL
→ todo2code extract nl
→ t2c.intent/v1
→ Subactor query/resource/twin pipeline
```

The adapter never changes `todo2code` sources. It invokes the local compiled CLI.

```dotenv
T2C_ROOT=/home/tom/github/semcod/todo2code
T2C_BIN=/home/tom/github/semcod/todo2code/dist/src/cli.js
```

Verification:

```bash
cd "$T2C_ROOT"
npm install
npm run verify

cd /path/to/digital-twin-runtime-starter
npm run doctor
```

Live intent conversion:

```bash
OPENROUTER_API_KEY=... \
T2C_NL_MODE=require-llm \
node dist/src/cli/main.js nl-to-dsl \
  intent examples/nl-to-dsl/request.md out/intent.json require-llm
```

If `todo2code` is unavailable, `require-llm` fails. Offline package tests use an explicit fixture and do not pretend that the external CLI ran.
