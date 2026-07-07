# Shore Sentinel Token Efficiency Tracking

This repo includes a lightweight tracker for estimating whether Graphify-first work reduces OpenAI/Hermes context usage.

## What it tracks

The tracker records per-task estimates in a local JSONL file:

```text
.token-efficiency/shore-sentinel.jsonl
```

The data file is intentionally gitignored. It is local operational telemetry, not source code.

Each record can include:

- task name
- whether Graphify was queried first
- Graphify query text and budget
- graph commit/nodes/links when available
- candidate files returned by Graphify
- files actually read after Graphify
- estimated tokens without Graphify
- estimated tokens with Graphify
- estimated tokens saved
- optional actual provider input/output tokens if available

## Log a task

From the repo root:

```bash
npm run token:efficiency -- log \
  --task "Find API port" \
  --graph-query "What is the API port of shore sentinel?" \
  --graph-query-budget 1000 \
  --candidate-files ".env.example,docker-compose.yml,api/Dockerfile" \
  --files-read ".env.example,docker-compose.yml" \
  --estimated-without 6000 \
  --estimated-with 1800 \
  --notes "Graphify narrowed the search before direct file reads."
```

## Summarize the data

```bash
npm run token:efficiency -- summary
```

Machine-readable summary:

```bash
npm run token:efficiency -- summary --json
```

## Check current Graphify metadata

```bash
npm run token:efficiency -- graph-meta
```

## Interpretation rules

- Treat values as estimates unless `actual_input_tokens` / `actual_output_tokens` are supplied.
- Graphify code-only refreshes can show zero LLM extraction tokens; that does not automatically prove agent-session savings.
- The most useful trend is whether Graphify-first queries consistently reduce broad file reads.
- When ARX is asked to pull token efficiency data, it should run the summary command and explain:
  - tasks logged
  - Graphify-first rate
  - query hit rate
  - estimated tokens saved
  - files avoided
  - top savings tasks
  - whether actual provider token counts were present or estimates only
