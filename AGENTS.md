# FNOL Voice Agent — Agent Handoff Guide

## Project overview

Meridian Motor Insurance FNOL (first-notice-of-loss) prototype. A caller reports a motor accident through a browser demo or Retell Custom LLM WebSocket. The application extracts structured claim data, verifies a local policy, detects an urgent injury/severe incident, gathers required FNOL fields, recommends services, persists the completed claim, and returns a spoken response.

**Current phase:** documentation/audit complete; no production-code change was made in this phase.

## Architecture summary

`src/server.ts` hosts Express (`/chat/start`, `/chat`, static browser UI) and a `ws` server on the same HTTP server. Each session owns an in-memory `ConversationState`. `ConversationManager` owns the turn orchestration. It makes one extraction-and-surface-response LLM call per normal turn through `ExtractClaimDataService`; deterministic code validates/merges slots, verifies policy, escalates, recommends services, and completes the claim. A Gemini native-SSE provider is primary; Groq is optional fallback. Completion writes local JSON and attempts a Google Sheets append in parallel.

Read the documents in `docs/` before changing this system, especially `handoff.md`, `execution-flow.md`, `fsm.md`, `prompts.md`, and `known-issues.md`.

## Coding conventions

- TypeScript ESM. Imports use `.js` specifiers.
- Keep strict TypeScript; `npm run typecheck` must pass.
- Prefer small services with interfaces injected into `ConversationManager`.
- Treat `Claim`, `Policy`, `ConversationState`, and `ConversationAction` as contracts. Update documentation and tests with any contract change.
- Do not log API keys, full transcripts, policy data, or claim PII in production.
- Current code uses significant `any`; new work should not expand it.

## Business and conversation rules

- The greeting asks whether everyone is safe.
- Policy verification requires policy number plus caller name and allows two failed verification attempts before callback-offer completion.
- `REQUIRED_FNOL_FIELDS` is the collection contract. Conditional fields apply for reported injuries and filed police reports.
- Any `injuriesReported === true` escalates; additional text patterns can also escalate.
- The current flow completes automatically once verified, required fields are collected, and either services have been offered or none are recommended. There is no actual confirmation gate despite legacy helper code.
- The LLM is expected to produce only a JSON object with `responseToUser` and `extractedData`; deterministic code owns persistence and policy lookup.

## FSM invariants and caveats

- Valid declared steps: `safety_check`, `verification`, `collecting_details`, `clarifying`, `recommending_services`, `escalation`, `callback_offer`, `completed`.
- The implementation does **not** explicitly transition from safety check to verification or details; it mostly retains the initial step until a service recommendation/completion/escalation path. Do not assume declared state equals current business phase.
- `verifiedPolicy` is a hard precondition for normal completion.
- `ConversationManager` is not transactional: state is persisted after the awaited turn and local JSON logging is read-modify-write.

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `PORT` | `src/server.ts` | HTTP + WebSocket port; default 3000. |
| `GEMINI_API_KEY` | `src/llm/gemini.ts` | Required primary provider credential. |
| `GEMINI_MODEL` | `src/llm/gemini.ts` | Default in code is `gemini-3.5-flash-lite`; GA production model for low-latency voice AI. |
| `GEMINI_ENDPOINT_BASE_URL` | `src/llm/gemini.ts` | Overrides native Gemini models base URL. |
| `GROQ_API_KEY` | `src/runtime.ts`, `src/llm/groq.ts` | Enables optional fallback. |
| `GROQ_MODEL`, `GROQ_ENDPOINT_BASE_URL` | `src/llm/groq.ts` | Optional fallback settings. |
| `GOOGLE_CREDENTIALS_JSON` | `src/storage/googleSheets.ts` | Service-account JSON; otherwise local `google-credentials.json` is used. |
| `RESEND_API_KEY` | `src/services/notificationService.ts` | Production transactional email API key. |
| `RESEND_FROM_EMAIL` | `src/services/notificationService.ts` | Resend verified sender email address. |
| `NOTIFICATION_EMAIL_TO` | `src/services/notificationService.ts` | Recipient email address for claim confirmations. |

`.env.example` also declares `WEBSOCKET_PORT`, `ENVIRONMENT`, `LLM_PROVIDER`, and OpenRouter variables, but current runtime does not consume them.

## Commands

```sh
npm install
npm run dev
npm run typecheck
npm run demo:conversation-manager
node test-ws.cjs ws://localhost:3000
node test-railway.cjs wss://<deployment>/
```

`npm test` intentionally exits 1; it is not a test suite. No build, CI, Dockerfile, or deploy command exists. `test-railway.cjs` reveals a Railway deployment URL but is only an ad-hoc smoke script.

## Repository map

| Area | Important files |
|---|---|
| Entry/transport | `src/server.ts`, `public/*`, `src/transport/browserSocket.ts` |
| Composition | `src/runtime.ts` |
| Orchestration/FSM | `src/conversation/ConversationManager.ts`, `ConversationState.ts`, `actions.ts`, `types.ts` |
| LLM/extraction | `src/services/extractClaimData.ts`, `src/llm/{provider,gemini,groq,fallback}.ts` |
| Business/persistence | `src/services/{verifyPolicy,recommendServices,generateSummary,claimLogger,normalizeClaimData}.ts`, `src/storage/googleSheets.ts` |
| Contracts/config | `src/types/*`, `src/config/{policies,requiredFields,constants}.ts` |
| Diagnostics | `test-conversations.ts`, `test-ws.cjs`, `test-railway.cjs`, `railway-logs.txt`, `scratch/*` |

## Known pitfalls / debt / backlog

- Retell socket implementation should be revalidated against the provider’s exact current protocol; it has no schema validation or authentication at application level.
- Server logs complete Retell messages/transcripts and internal LLM material; `/view-logs` is unauthenticated and in-memory/unbounded.
- The Google Sheets ID is hard-coded and errors are swallowed. Local JSON writes are non-atomic under concurrent completion.
- The LLM controls surface language and dynamic next-field prompt; it does not receive a schema enforced by `responseJsonSchema`.
- Streaming parses JSON text with a regular expression and simplistic quote handling before full JSON is validated.
- `src/services/geminiClient.ts`, `src/config/prompts.ts`, `EmpathyEngine.ts`, `browserSocket.ts`, debug parsing, some imports/variables, and legacy docs are unused or stale.
- See `docs/optimization-roadmap.md` for ranked work; no work is authorized without a Phase 2 request.

## Future-agent instructions

1. Read `docs/handoff.md`, then relevant focused docs.
2. Confirm intended product behavior before changing prompts/FSM, because current code and historic documents disagree in places.
3. Establish automated unit, integration, and replay tests before modifying critical FNOL logic.
4. Do not treat this prototype as compliance-ready: it handles PII, has no auth/retention/security controls, and must receive insurance/legal/security review before real use.
