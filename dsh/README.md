# Daily DSH pin

First-class `@deepseek-ai/dsh` pin for `bin/qq`. This is the daily qq host (the qq session plugin plus whichever sibling qq plugins are present), not a pi2dsh compatibility harness.

Install the locked toolchain with:

```bash
npm ci --prefix dsh --no-audit --no-fund
```

`pins.json` is the machine-readable source of truth. The launcher preloads `qq-dsh-model-compat.mjs` so `qwen-token-plan/deepseek-v4-pro-0813` keeps `supportsDeveloperRole: false`.
