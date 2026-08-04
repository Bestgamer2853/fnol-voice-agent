# Environment, Configuration, and Operations

## Effective configuration

| Variable | Runtime consumer | Effective default / meaning |
|---|---|---|
| PORT | server.ts | 3000; serves HTTP and WebSocket on one listener |
| GEMINI_API_KEY | llm/gemini.ts | primary native Gemini credential |
| GEMINI_MODEL | llm/gemini.ts | gemini-3.6-flash in code; validate model availability |
| GEMINI_ENDPOINT_BASE_URL | llm/gemini.ts | Google models endpoint override |
| GROQ_API_KEY | runtime.ts / llm/groq.ts | enables fallback provider |
| GROQ_MODEL / GROQ_ENDPOINT_BASE_URL | llm/groq.ts | optional fallback configuration |
| GOOGLE_CREDENTIALS_JSON | storage/googleSheets.ts | service account JSON; otherwise local credential path |

## Declared but unused/stale configuration

.env.example declares WEBSOCKET_PORT, ENVIRONMENT, LLM_PROVIDER, OPENROUTER_API_KEY and OPENROUTER_MODEL. No current production source reads them. The example says provider can be openrouter, but runtime never configures OpenRouter. Do not assume example configuration is an interface contract.

## Local artifacts and secrets

.env, data/claims.json, and google-credentials.json are ignored. The current local environment contains those paths; do not copy, log, commit, or include their values in documentation. The runtime contains a hard-coded spreadsheet ID. There is no secret manager, config validation, startup health check, Dockerfile, CI, or release/deploy manifest.

## Starting and testing

Use npm install then npm run dev. npm run typecheck passes as of this documentation phase. npm test intentionally fails. Demo scripts referenced by package.json point to absent src/demo files, so they are stale. test-ws.cjs is an ad-hoc local WebSocket smoke script; test-railway.cjs is an ad-hoc remote smoke script.

## Deployment reality

Git history and test-railway.cjs imply a Railway deployment, but no Railway configuration is versioned. A later deployment plan must specify build artifact, Node version, health/readiness, WebSocket proxy settings, secrets, per-call resource limits, autoscaling/session affinity, data store, monitoring, rollback and key rotation.
