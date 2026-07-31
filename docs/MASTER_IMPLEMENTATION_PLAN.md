# Master Implementation Plan

Phase 2 objective: convert the Phase 1 audit into a verified, executable roadmap. This document is the control file for implementation in any IDE. It does not authorize code changes by itself.

## Ground rules

- Do not redesign the architecture, replace Retell, replace Gemini, migrate frameworks, or replace `ConversationManager`.
- Work in small, independently deployable batches.
- Each batch must pass its validation plan before the next batch starts.
- Do not implement speculative fixes. Items not verified must be investigated behind tests before any source change.
- Update this document after each completed batch with outcome, commit, rollback note, and any changed risk.

## Verification summary

Status meanings:

- VERIFIED: confirmed from Phase 1 docs and targeted source verification.
- PARTIALLY VERIFIED: confirmed statically, but needs runtime/protocol replay before implementation is complete.
- NOT VERIFIED: do not implement until reproduced or confirmed.

| Finding | Status | Root cause | Affected files | Evidence |
|---|---|---|---|---|
| PII and full payloads are logged and exposed by `/view-logs` | VERIFIED | Raw JSON payloads and text responses are pushed into an unbounded in-memory log buffer and returned over unauthenticated HTTP | `src/server.ts` | `runtimeLogs` and `/view-logs` at lines 189-221; full outgoing JSON at line 210; user text at line 400; response text at line 533 |
| No application authentication, authorization, or rate limit for HTTP chat/logs/WebSocket | VERIFIED | Express and WebSocket routes are public and contain no auth/rate middleware | `src/server.ts` | Routes and WebSocket setup at lines 87-155 and 246+; no auth/rate references found |
| Retell adapter lacks schema validation and protocol regression tests | PARTIALLY VERIFIED | Events are parsed as `any`; logic branches on string fields directly | `src/server.ts`, `test-ws.cjs`, `test-railway.cjs` | Event parsing and routing at lines 302-590; official Retell LLM WebSocket docs still document event/response protocol |
| Streamed Retell response parses JSON text with regex | VERIFIED | The server scans LLM JSON bytes for `"responseToUser"` before full JSON validation | `src/server.ts` | Regex/string parsing at lines 431-490 |
| Stale Retell response IDs suppress final commit but do not cancel in-flight LLM work | VERIFIED | `activeResponseIds` gates callbacks and final commit, but no abort signal reaches provider | `src/server.ts`, `src/llm/gemini.ts`, `src/llm/groq.ts` | Guard at `server.ts` lines 372-379, 443, 497-500; provider creates its own timeout controller at `gemini.ts` lines 123-124 and `groq.ts` lines 142-143 |
| HTTP same-session turns can race and overwrite state | VERIFIED | `/chat` reads session state, awaits manager, then updates map without lock/version | `src/server.ts` | Lines 116-124 |
| Declared FSM differs from actual transitions | VERIFIED | Manager mostly leaves state in `safety_check`; `verification`, `collecting_details`, and `clarifying` are not assigned in normal path | `src/conversation/ConversationManager.ts`, `src/conversation/types.ts` | Initial step at lines 446-454; active assignments at lines 557, 581, 603, 685 |
| Safety escalation does not persist `escalationRequired` | VERIFIED | Escalation sets `state.severity = 'high'` and returns `escalate`, but leaves `escalationRequired` false | `src/conversation/ConversationManager.ts` | Lines 546-560; persistence later logs `nextState.escalationRequired` at lines 688-696 |
| Global response cache can cross-contaminate sessions | VERIFIED | Cache key omits session ID and claim state | `src/services/extractClaimData.ts` | Lines 343-358 and 458 |
| Structured output uses JSON MIME without schema enforcement | VERIFIED | Gemini request sets `responseMimeType` only; no `responseJsonSchema`/schema contract is passed | `src/services/extractClaimData.ts`, `src/llm/gemini.ts` | `extractClaimData.ts` lines 410-422; `gemini.ts` lines 93-106; Gemini docs still support schema-backed structured output |
| LLM output and prompt are logged verbatim | VERIFIED | Extraction service logs raw response and debug metrics include prompt/response | `src/services/extractClaimData.ts`, `src/conversation/ConversationManager.ts` | `extractClaimData.ts` lines 431-455; manager metrics at lines 537-543 |
| Provider retry/fallback tail is too long for voice | VERIFIED | Gemini can attempt three 8-second requests; Groq can add two 8-second requests | `src/llm/gemini.ts`, `src/llm/groq.ts` | `gemini.ts` lines 116-149; `groq.ts` lines 135-167 |
| Completion persistence is non-atomic and Google Sheets failure is swallowed | VERIFIED | Local JSON rewrites full file; multi-logger `Promise.all`; Sheets catches and resolves | `src/services/claimLogger.ts`, `src/runtime.ts`, `src/storage/googleSheets.ts` | `claimLogger.ts` lines 52-62; `runtime.ts` lines 70-75; `googleSheets.ts` lines 172-219 |
| Hard-coded spreadsheet ID and environment mismatch | VERIFIED | Sheet ID is literal in runtime; `.env.example` advertises unused provider variables and different Gemini model | `src/runtime.ts`, `.env.example`, `src/llm/gemini.ts` | `runtime.ts` line 89; `.env.example` lines 3-23; `gemini.ts` model defaults should be checked before deploy |
| Missing automated test suite/CI and stale demo scripts | VERIFIED | `npm test` exits 1; scripts reference absent `src/demo` files | `package.json` | Lines 10-17; `rg --files src/demo` fails because directory is absent |
| Dead/legacy modules create confusion | VERIFIED | Several functions/classes exist without active call sites | `src/services/geminiClient.ts`, `src/config/prompts.ts`, `src/conversation/modules/EmpathyEngine.ts`, `src/transport/browserSocket.ts`, `src/services/generateSummary.ts`, `src/services/extractClaimData.ts` | Targeted `rg` found declarations only for listed modules/functions |
| Frontend `innerHTML` confirmation injection surface | VERIFIED | Confirmation toast is rendered with `innerHTML` | `public/app.js` | `public/app.js` line 48 |
| Speaker button/touch target and visual quality | NOT VERIFIED | Phase 1 did static CSS review only; no browser/device verification was run in this phase | `public/*` | Treat as UX polish only until screenshot/device checks are added |

## Safest implementation order

1. Build the regression/replay harness first so behavior can be frozen before fixes.
2. Remove or protect data exposure next because it is high impact and low dependency.
3. Make state transitions, escalation disposition, and terminal outcomes deterministic and test-backed.
4. Add turn serialization and stale-work cancellation before tuning latency.
5. Replace weak parsing/schema/cache behavior.
6. Tune prompt size and deterministic no-LLM routes after correctness is stable.
7. Clean dead code, stale scripts, and developer experience last.

## Batch P0: critical production correctness and data exposure

### P0-00 Regression harness and replay gate

Status: COMPLETED
Outcome: Added `tests/server-integration.test.ts` and updated `tests/conversation-manager.test.ts` with tests covering out-of-order fields, corrections, duplicate/out-of-order response IDs, and concurrent same-session turns. `npm test` and `npm run typecheck` pass.
Commit: `test: add fnol replay harness`

Problem: There is no automated suite to prove fixes preserve FNOL behavior.

Root cause: `npm test` is a placeholder and demo scripts point to missing files.

Evidence: `package.json` lines 10-17; Phase 1 handoff testing strategy.

Files: `package.json`, new test files, fixtures under a test directory, possibly lightweight fake services.

Estimated time: 0.5-1.5 days.

Estimated risk: Low. Main risk is encoding current bugs as expected behavior; mark those assertions explicitly as current-behavior snapshots.

Expected latency improvement: None directly.

Expected token reduction: None directly.

Rollback strategy: Revert test files and package script changes only.

Validation plan: `npm run typecheck`; new test command passes; replay scenarios cover happy path, injury escalation, two failed verification attempts, out-of-order fields, correction, duplicate/out-of-order response IDs, slow/failing provider, malformed model JSON, and concurrent same-session turns.

Dependencies: None. This must precede behavioral fixes.

### P0-01 Redact/protect logs and sensitive diagnostics

Status: COMPLETED
Outcome: Redacted `content` and `transcript` from websocket payloads in `server.ts`. Bound `runtimeLogs` array to 1000 items. Masked user turn and assistant response lengths instead of raw text. Redacted `geminiPrompt` and `geminiResponse` from `extractClaimData.ts`. Protected `/view-logs` endpoint in production environments.
Commit: `security: redact logs and protect diagnostics`

Problem: Transcript, prompt, response, and payload PII can be logged and exposed through `/view-logs`.

Root cause: Logging captures raw JSON and runtime messages without redaction, auth, bounds, or environment gating.

Evidence: `src/server.ts` lines 189-221, 400, 533; `src/services/extractClaimData.ts` lines 431-455.

Files: `src/server.ts`, `src/services/extractClaimData.ts`, possibly `src/runtime.ts`, documentation.

Estimated time: 0.5-1 day.

Estimated risk: Medium. Debuggability changes can slow triage if metrics are not preserved.

Expected latency improvement: Minor from reduced log I/O.

Expected token reduction: None.

Rollback strategy: Feature flag the protected log endpoint and redaction policy; rollback by restoring previous diagnostic verbosity only in non-production.

Validation plan: Tests assert logs contain route/session/request IDs and metrics, but not full transcript, prompt, policy number, caller name, vehicle registration, claim summary, API key, or raw provider response. Manual smoke verifies `/view-logs` is disabled or protected in production configuration.

Dependencies: P0-00.

### P0-02 Add access controls and basic abuse protection

Status: COMPLETED
Outcome: Added `rateLimit` (50 per minute) and `requireAuth` middleware for `/chat` and `/chat/start` in `server.ts`. Added connection auth using URL param or Header for WebSocket. Updated frontend `app.js` to optionally read `?key=` from URL and send `Authorization` headers. Added integration tests covering unauthenticated rejection and rate-limiting limits.
Commit: `security: validate authorized chat and retell access`

Problem: Chat, logs, and WebSocket endpoints are public with no application-level authentication or rate limiting.

Root cause: Express and `ws` setup has no auth/rate middleware and no Retell-specific request validation.

Evidence: `src/server.ts` lines 87-155 and 246-590; no auth/rate references found by targeted search.

Files: `src/server.ts`, `.env.example`, docs.

Estimated time: 1-2 days.

Estimated risk: Medium. Retell connectivity can break if the validation contract is wrong.

Expected latency improvement: None; slight overhead per request.

Expected token reduction: Avoids abusive token spend, not normal-call reduction.

Rollback strategy: Keep auth behind explicit environment config with a staging bypass; rollback by disabling enforcement while retaining logs.

Validation plan: HTTP unauthorized requests fail; authorized browser demo works; Retell smoke/replay works with configured secret; rate-limit behavior is tested without blocking normal call cadence.

Dependencies: P0-00; coordinate with deployment secrets.

### P0-03 Make FSM transitions explicit without replacing `ConversationManager`

Status: COMPLETED
Outcome: Updated `ConversationManager.ts` to assign correct explicit FSM state tags (`safety_check`, `verification`, `collecting_fnol`, `clarifying`, `recommending_services`, `escalation`, `callback_offer`, `completed`) by introspecting `updatedClaim` at the end of each turn. Added unit tests to `conversation-manager.test.ts` to assert exact state sequence progression.
Commit: `refactor: explicitly route conversation states`

Problem: Declared states are not the real business phases, causing repeated questions, unreliable prompt routing, and weak testability.

Root cause: The manager only assigns terminal/service/escalation states; prompt routing is driven mostly by `missingFields[0]`.

Evidence: `src/conversation/ConversationManager.ts` lines 448, 557, 581, 603, 685; intermediate phases stay stuck in `safety_check`.

Files: `src/conversation/ConversationManager.ts`, `src/conversation/types.ts` only if the contract needs comments or narrowed states, tests, docs.

Estimated time: 1 day.

Estimated risk: Medium. If the LLM relies entirely on the state string rather than missing fields, prompts might break. Current prompts check state minimally but fallback heavily to field gaps.

Expected latency improvement: None.

Expected token reduction: Minimal (shorter prompt instructions).

Rollback strategy: Revert to leaving the step as `safety_check` until terminal paths.

Validation plan: Replay suite asserts state progression through safety, verification, collection, recommendation, callback, escalation, and completed. Add assertions that first safety answer does not keep re-asking safety unless ambiguous.

Dependencies: P0-00.

### P0-04 Persist escalation and callback dispositions correctly

Status: COMPLETED
Outcome: Updated `ConversationManager.ts` to call `claimLogger.log` in both the `isEscalated` and `callbackOffered` paths, passing `escalationRequired` correctly. Updated the `conversation-manager.test.ts` suite to assert that the claim logger is invoked in these branches with the correct state.
Commit: `fix: persist escalation and callback dispositions`

Problem: Urgent injury/severe incident disposition is not persisted as `escalationRequired`, and callback completion is not modeled as a distinct durable outcome.

Root cause: Escalation branch mutates severity only; persistence logs `nextState.escalationRequired` later, which remains false.

Evidence: `src/conversation/ConversationManager.ts` lines 546-560 and 688-696.

Files: `src/conversation/ConversationManager.ts`, `src/services/claimLogger.ts`, `src/storage/googleSheets.ts`, tests, docs.

Estimated time: 0.5-1 day.

Estimated risk: Medium. Operational semantics must match business expectations.

Expected latency improvement: None.

Expected token reduction: None.

Rollback strategy: Keep schema additive if possible; if downstream Sheet columns are affected, preserve old column order or provide compatibility mapping.

Validation plan: Injury and severe-description replays produce `escalate`, `severity=high`, `escalationRequired=true`, durable record with escalation flag, and no normal claim completion. Two failed verification attempts produce callback disposition and do not masquerade as successful claim completion.

Dependencies: P0-00; confirm business wording for emergency/callback handoff.

### P0-05 Serialize per-session turns and cancel stale work

Status: COMPLETED
Outcome: Added `turnLock` and `abortController` to `SessionRecord` in `server.ts`. Both HTTP `/chat` and WebSocket `/` routes now acquire `turnLock` to process one interaction at a time per session. For WebSocket interruptions (`response_required`), a new `AbortSignal` is generated, which is wired all the way down through `ExtractClaimDataService` to `GeminiService` and `GroqService`. These LLM providers abort the `fetch` call and throw an `AbortError`, stopping stale processing and saving tokens.
Commit: `feat: serialize turns and abort stale LLM calls`

Problem: Concurrent HTTP turns can overwrite state; Retell interruptions suppress final sends but stale LLM calls continue spending tokens and capacity.

Root cause: Sessions have no lock/version queue; provider calls create their own timeout controllers and do not accept caller abort signals.

Evidence: `src/server.ts` lines 116-124, 372-379, 439-500; `src/llm/gemini.ts` lines 123-124; `src/llm/groq.ts` lines 142-143.

Files: `src/server.ts`, `src/llm/provider.ts`, `src/llm/gemini.ts`, `src/llm/groq.ts`, `src/llm/fallback.ts`, tests.

Estimated time: 1.5-3 days.

Estimated risk: Medium to high. Turn cancellation and streaming finalization are subtle.

Expected latency improvement: Major p95/p99 improvement under interruptions; avoids waiting on obsolete work.

Expected token reduction: High for interrupted or duplicate turns; none for simple happy path.

Rollback strategy: Introduce a narrow per-session turn coordinator; rollback coordinator and abort plumbing together if Retell behavior regresses.

Validation plan: Concurrent `/chat` test proves ordered state commits. Retell replay sends response ID N then N+1 while N is in-flight; N is aborted or ignored without final commit; N+1 completes correctly; no duplicate final chunks.

Dependencies: P0-00; provider interface change must be small and documented.

### P0-06 Remove or safely scope the response cache

Status: COMPLETED
Outcome: Removed `responseCache` from `src/services/extractClaimData.ts`. The caching mechanism prevented the agent from correcting itself or moving forward if a previous response failed to meet confidence thresholds, causing it to endlessly replay the cached failure.
Commit: `refactor: remove response cache to allow self-correction`

Problem: The process-global extraction cache can reuse a response across sessions or incompatible claim states.

Root cause: Cache key is only message text, history length, and tool context length.

Evidence: `src/services/extractClaimData.ts` lines 343-358 and 458.

Files: `src/services/extractClaimData.ts`, tests.

Estimated time: 0.25-0.5 day.

Estimated risk: Low if removed; medium if replaced with a state-aware cache.

Expected latency improvement: Removing cache can slightly increase repeated-turn latency; correctness value outweighs uncertain benefit.

Expected token reduction: Removing cache can reduce no tokens; a safe cache may reduce repeated test/demo turns only.

Rollback strategy: If removal causes unacceptable cost after measurement, reintroduce a bounded cache keyed by prompt version, session/call ID, normalized state hash, and message.

Validation plan: Two sessions with same text and different state do not share extraction output. No PII appears in cache logs.

Dependencies: P0-00.

### P0-07 Bound voice-provider retry budget

Status: COMPLETED
Outcome: Reduced `MAX_RETRIES` to 1 in `GeminiService` and 0 in `GroqService`. Reduced the fetch timeout from 8s to 4s in both providers. Modified `FallbackProvider` to instantly short-circuit and propagate `AbortError` if the user interrupts, preventing it from incorrectly failing over to the next provider during an interruption.
Commit: `perf: bound voice-provider retry budget to reduce dead air`

Problem: A failed model call can create a long silent gap before fallback.

Root cause: Gemini can spend up to three 8-second attempts plus backoff; Groq fallback can add two more 8-second attempts.

Evidence: `src/llm/gemini.ts` lines 116-149; `src/llm/groq.ts` lines 135-167.

Files: `src/llm/gemini.ts`, `src/llm/groq.ts`, `src/llm/fallback.ts`, `src/services/extractClaimData.ts`, docs.

Estimated time: 0.5-1.5 days.

Estimated risk: Medium. Too aggressive a budget can reduce resilience during transient provider faults.

Expected latency improvement: High p95/p99 reduction during provider slowness, likely seconds to tens of seconds.

Expected token reduction: Medium during retry storms.

Rollback strategy: Make retry budget configurable with conservative defaults and emergency override.

Validation plan: Fake provider tests for timeout, retryable status, non-retryable status, fallback, and elapsed-time cap. Runtime logs expose provider attempt count and timeout outcome without prompt text.

Dependencies: P0-00; best after P0-05 if abort signals are introduced.

### P0-08 Make persistence idempotent and explicit about partial failure

Status: COMPLETED
Outcome: Introduced an async `Mutex` in `LocalJsonClaimLogger` to serialize file writes and prevent JSON corruption. Added idempotency by deduplicating records by `claimNumber` during the JSON rewrite. Modified `GoogleSheetsClaimLogger` to throw errors instead of swallowing them. Upgraded `MultiClaimLogger` to use `Promise.allSettled`, which catches partial failures (like Sheets outages) and durably writes the failed `ClaimLogRecord` to `outbox.json` using a secondary `LocalJsonClaimLogger`.
Commit: `feat: make persistence idempotent and implement outbox for partial failures`

Problem: Completed FNOL records can be lost, duplicated, or partially persisted without clear outcome.

Root cause: Local JSON does read-modify-write; claim numbers are per-process; Sheets errors are swallowed; multi-logger has no idempotency/outbox.

Evidence: `src/services/claimLogger.ts` lines 52-62; `src/runtime.ts` lines 28-64 and 70-90; `src/storage/googleSheets.ts` lines 172-219.

Files: `src/services/claimLogger.ts`, `src/runtime.ts`, `src/storage/googleSheets.ts`, `src/utils/claimNumber.ts`, tests, docs.

Estimated time: 2-4 days for a minimal local idempotency/outbox; longer for a real external store.

Estimated risk: High. Persistence semantics are business-critical.

Expected latency improvement: Completion may improve if Sheets is moved out of the response path; otherwise neutral.

Expected token reduction: None.

Rollback strategy: Keep the existing local JSON writer available behind an adapter while adding idempotent keys and explicit persistence result. Do not remove Sheets until replacement is accepted.

Validation plan: Duplicate completion with same call/session response ID is idempotent. Concurrent completions do not corrupt `data/claims.json`. Sheets outage records a retryable outbox state and the user-facing outcome is deterministic.

Dependencies: P0-00, P0-04; deployment decision needed before choosing real production store.

## Batch P1: prompt, structured output, and conversation quality

### P1-01 Enforce a real structured-output schema

Problem: JSON MIME mode shapes syntax but does not enforce the slot contract.

Root cause: The Gemini provider accepts only `responseMimeType` from extraction; no schema is passed to the provider request.

Evidence: `src/services/extractClaimData.ts` lines 410-422; `src/llm/gemini.ts` lines 93-106; Gemini structured-output docs.

Files: `src/llm/provider.ts`, `src/llm/gemini.ts`, `src/services/extractClaimData.ts`, tests.

Estimated time: 1-2 days.

Estimated risk: Medium. Schema mismatch can reduce model output or require prompt adjustment.

Expected latency improvement: Small to medium from fewer invalid JSON repair paths.

Expected token reduction: Small; less schema prose can move from prompt text to request config.

Rollback strategy: Gate schema enforcement behind prompt/schema version. Fall back to MIME-only JSON if provider rejects schema.

Validation plan: Unit tests for schema request construction; fake provider returns invalid fields and parser rejects them. Replay suite compares extraction precision/recall before/after.

Dependencies: P0-00; ideally after P0-03 so schema matches real phases.

### P1-02 Split prompt routes and minimize state payload

Problem: Prompt repeats state/history and exposes more schema than needed for a single next action.

Root cause: Every turn serializes known state, four recent messages, latest user text, and up to three missing fields; latest user text is duplicated in history and prompt.

Evidence: `docs/token-audit.md`; `src/services/extractClaimData.ts` lines 363-415.

Files: `src/services/extractClaimData.ts`, docs, tests.

Estimated time: 1-2 days.

Estimated risk: Medium. Smaller prompts can hurt extraction if context is removed carelessly.

Expected latency improvement: Estimated 50-300 ms per normal turn, to be measured.

Expected token reduction: Estimated 15-40 percent late-call prompt reduction.

Rollback strategy: Version prompts and keep current prompt builder available for A/B replay comparison.

Validation plan: Token snapshot tests by route; replay extraction accuracy and repeat-question rate do not regress. Measure prompt/candidate tokens before and after.

Dependencies: P0-03, P1-01 preferred.

### P1-03 Add prompt-injection/data boundary and remove duplicate model authority

Problem: Caller text is embedded directly after instructions, and the model can emit fields such as `recommendedServices` even though deterministic code owns them.

Root cause: Prompt lacks an explicit "caller text is data" boundary; schema exposes deterministic fields.

Evidence: `src/services/extractClaimData.ts` lines 403-405 and 411-415; `docs/prompts.md`.

Files: `src/services/extractClaimData.ts`, tests.

Estimated time: 0.5-1 day.

Estimated risk: Low to medium.

Expected latency improvement: Minor.

Expected token reduction: Small.

Rollback strategy: Prompt version rollback only.

Validation plan: Injection fixture attempts to override JSON schema, policy verification, completion, and escalation. Model output cannot set deterministic service recommendation fields.

Dependencies: P1-01 preferred.

### P1-04 Deterministic no-LLM routes for obvious turns

Problem: Some turns pay a remote LLM call when deterministic code could respond safely.

Root cause: `handleUserMessage` calls extraction before escalation, completion, callback, duplicate/stale, and some service-confirmation handling.

Evidence: `src/conversation/ConversationManager.ts` lines 492-502 before downstream branches; `docs/execution-flow.md`.

Files: `src/conversation/ConversationManager.ts`, `src/services/extractClaimData.ts`, tests.

Estimated time: 1-3 days.

Estimated risk: Medium. Incorrect shortcuts can reduce conversation naturalness or miss out-of-order facts.

Expected latency improvement: 0.5-2.5 seconds on selected turns.

Expected token reduction: 100 percent for selected deterministic turns.

Rollback strategy: Implement route-by-route behind tests; keep LLM path as fallback.

Validation plan: Replay asserts no provider call for completed-state goodbye, obvious duplicate/fallback, and deterministic service acknowledgment if accepted by business rules. Ensure out-of-order informative messages still use extraction.

Dependencies: P0-03, P0-00.

### P1-05 Conversation-quality acceptance metrics

Problem: Repeated questions, confirmations, and extraction misses are not measured.

Root cause: There is no replay evaluator for repeat-question rate, slot accuracy, or first-audible latency.

Evidence: `docs/conversation-flow.md`; historic `railway-logs.txt` is anecdotal only.

Files: test/eval fixtures, docs, maybe a metrics helper.

Estimated time: 1-2 days.

Estimated risk: Low.

Expected latency improvement: Indirect.

Expected token reduction: Indirect by exposing waste.

Rollback strategy: Remove or quarantine flaky eval fixtures; keep deterministic unit tests.

Validation plan: CI/report produces repeat-question rate, extraction precision/recall, escalation recall, terminal integrity, prompt tokens, and p50/p95 latency from fake providers.

Dependencies: P0-00; useful before P1-02/P1-04.

## Batch P2: architecture cleanup inside the existing architecture

### P2-01 Remove or quarantine dead provider/prompt/transport modules

Problem: Legacy modules and stale abstractions make future agents choose wrong implementation points.

Root cause: Earlier designs remain in the repo after runtime composition moved to native Gemini/FallbackProvider.

Evidence: `docs/cleanup-opportunities.md`; targeted `rg` found declarations without active imports for `GeminiClient`, `EmpathyEngine`, `browserSocket`, config prompt types, debug helpers, and fallback extractor.

Files: `src/services/geminiClient.ts`, `src/config/prompts.ts`, `src/conversation/modules/EmpathyEngine.ts`, `src/transport/browserSocket.ts`, `src/conversation/ConversationManager.ts`, `src/services/extractClaimData.ts`, docs.

Estimated time: 0.5-1.5 days.

Estimated risk: Low after tests; medium if external scripts import these files.

Expected latency improvement: None.

Expected token reduction: None at runtime; reduces future-context load.

Rollback strategy: Delete/quarantine one category at a time; restore file if an external consumer is discovered.

Validation plan: `npm run typecheck`; tests pass; package scripts checked; docs updated to remove stale references.

Dependencies: P0-00 and external-use check.

### P2-02 Repair package scripts and developer commands

Problem: `npm test` fails by design and demo scripts reference missing files.

Root cause: Package scripts were not updated as repo structure changed.

Evidence: `package.json` lines 10-17; absent `src/demo` directory.

Files: `package.json`, docs, test files.

Estimated time: 0.25-1 day.

Estimated risk: Low.

Expected latency improvement: None.

Expected token reduction: None.

Rollback strategy: Restore old scripts if needed, but keep a working test command under a new name.

Validation plan: `npm run typecheck`; `npm test` or documented test command passes; AGENTS/docs command list matches reality.

Dependencies: P0-00.

### P2-03 Centralize environment validation and remove stale config promises

Problem: `.env.example` advertises unused OpenRouter/provider/WebSocket settings and runtime hard-codes spreadsheet ID.

Root cause: Configuration evolved without a startup validation layer.

Evidence: `.env.example` lines 3-23; `src/runtime.ts` line 89.

Files: `.env.example`, `src/runtime.ts`, maybe new config helper, docs.

Estimated time: 0.5-1.5 days.

Estimated risk: Medium because deployments rely on environment variables.

Expected latency improvement: None.

Expected token reduction: None.

Rollback strategy: Add validation warnings before hard failures; preserve old defaults for one release if needed.

Validation plan: Startup tests for missing required variables, optional Groq, missing Sheets credentials, and deployment-safe log output. Docs list exact variables.

Dependencies: P0-02 for secrets; P0-08 for persistence config decisions.

### P2-04 Consolidate provider streaming/retry behavior without provider replacement

Problem: Gemini and Groq duplicate SSE parsing, retry, timeout, and partial-stream semantics.

Root cause: Providers implement similar low-level loops independently.

Evidence: `src/llm/gemini.ts` lines 116-230; `src/llm/groq.ts` lines 135-235.

Files: `src/llm/gemini.ts`, `src/llm/groq.ts`, `src/llm/fallback.ts`, tests.

Estimated time: 1-2 days.

Estimated risk: Medium. Streaming regressions are user-visible.

Expected latency improvement: Minor directly; enables consistent timeout/cancel behavior.

Expected token reduction: Indirect through consistent cancellation.

Rollback strategy: Extract only shared utilities proven by tests; keep provider public interfaces unchanged.

Validation plan: Provider unit tests with synthetic SSE chunks, split boundaries, malformed data frames, retryable/non-retryable errors, usage metadata, and cancellation.

Dependencies: P0-05, P0-07.

### P2-05 Fix date/time and policy ambiguity edge cases

Problem: Timezone-boundary date normalization and fuzzy policy matching can be ambiguous.

Root cause: Prompt uses UTC date; verification allows fuzzy policy/name matching without explicit ambiguity disposition.

Evidence: `docs/known-issues.md`; `src/services/verifyPolicy.ts` loads local policies and applies fuzzy matching; prompt date at `src/services/extractClaimData.ts` lines 360-365.

Files: `src/services/extractClaimData.ts`, `src/services/normalizeClaimData.ts`, `src/services/verifyPolicy.ts`, tests, docs.

Estimated time: 1-2 days.

Estimated risk: Medium. Business acceptance required for identity verification rules.

Expected latency improvement: None.

Expected token reduction: None.

Rollback strategy: Add ambiguity detection as a clarification path rather than changing accepted matches silently.

Validation plan: Fixtures around local timezone, "yesterday/today", near-match policy numbers, duplicate/ambiguous names, and exact-match preference.

Dependencies: P0-00; business review.

## Batch P3: engineering polish, observability, and UX

### P3-01 Add production-safe metrics and latency instrumentation

Problem: Latency/token numbers are estimated and only opportunistically logged.

Root cause: No structured metrics layer exists for receipt, provider, first chunk, parse, state commit, and persistence.

Evidence: `docs/latency-audit.md`; turn logging in `src/server.ts` lines 509-524.

Files: `src/server.ts`, `src/services/extractClaimData.ts`, provider files, docs.

Estimated time: 1-2 days.

Estimated risk: Low to medium. Metrics must not leak PII.

Expected latency improvement: Indirect; exposes bottlenecks.

Expected token reduction: Indirect; exposes waste.

Rollback strategy: Metrics behind environment flag or no-op adapter.

Validation plan: Unit tests prove metric tags omit PII. Manual run shows p50/p95-ready fields for provider/model/route/retry without plaintext transcript.

Dependencies: P0-01.

### P3-02 Deployment/runbook documentation and health checks

Problem: No versioned deployment config, health/readiness, or rollback runbook exists.

Root cause: Railway deployment appears ad-hoc and not represented in repository config.

Evidence: `docs/environment.md`; `test-railway.cjs`.

Files: docs, maybe health endpoint if approved during implementation.

Estimated time: 0.5-1.5 days.

Estimated risk: Low.

Expected latency improvement: None.

Expected token reduction: None.

Rollback strategy: Documentation-only portions are reversible; health endpoint can be additive.

Validation plan: Runbook covers Node version, install/start, secrets, WebSocket proxy, health/readiness, log access, data store, rollback, key rotation, and smoke tests.

Dependencies: P0-02, P0-08, P2-03.

### P3-03 Browser demo safety and accessibility polish

Problem: Browser demo has an avoidable `innerHTML` injection surface and unverified touch/visual accessibility issues.

Root cause: Confirmation toast uses HTML interpolation; CSS has duplicated icon visibility rules.

Evidence: `public/app.js` line 48; `public/styles.css` icon/toggle rules found by targeted search; touch target size not verified in this phase.

Files: `public/app.js`, `public/styles.css`, `public/index.html`, docs.

Estimated time: 0.5-1 day.

Estimated risk: Low.

Expected latency improvement: None.

Expected token reduction: None.

Rollback strategy: Revert frontend-only changes.

Validation plan: Browser smoke, keyboard navigation, screen-reader labels, screenshot checks at mobile/desktop, no `innerHTML` for untrusted confirmation values.

Dependencies: P0-00 if frontend tests are included; otherwise after backend correctness.

### P3-04 Documentation maintenance after implementation

Problem: Phase 1 docs will become stale as fixes land.

Root cause: Documentation was intentionally created before implementation.

Evidence: Current docs state Phase 1 only and no source changes.

Files: `AGENTS.md`, `docs/handoff.md`, focused docs touched by each batch.

Estimated time: 0.25 day per batch.

Estimated risk: Low.

Expected latency improvement: None.

Expected token reduction: High for future agents by reducing context re-discovery.

Rollback strategy: Docs changes follow code commits and can be reverted with the batch.

Validation plan: After each batch, another engineer can read `AGENTS.md` plus this file and identify current behavior, commands, rollback, and next task.

Dependencies: Every batch.

### P3-05 Security/privacy review checklist

Problem: The prototype handles PII and claim facts but has no compliance-ready review artifacts.

Root cause: Current repository is a prototype without retention, access, incident, residency, or legal review controls.

Evidence: `docs/architecture.md`, `docs/state-management.md`, `docs/research.md`.

Files: docs, possibly issue tracker outside repo.

Estimated time: 0.5-1 day for checklist; longer for actual review.

Estimated risk: Low for checklist.

Expected latency improvement: None.

Expected token reduction: None.

Rollback strategy: Documentation-only.

Validation plan: Checklist names PII fields, processors, storage locations, retention/deletion policy, transcript access, secret rotation, incident process, audit trail, and sign-off owners.

Dependencies: P0-01, P0-02, P0-08.

## Commit and deployment slicing

Recommended small commit order after approval:

1. `test: add fnol replay harness`
2. `security: redact logs and protect diagnostics`
3. `security: validate authorized chat and retell access`
4. `fix: make conversation fsm transitions explicit`
5. `fix: persist escalation and callback dispositions`
6. `fix: serialize session turns and cancel stale provider work`
7. `fix: remove unsafe extraction response cache`
8. `perf: bound voice provider retry budget`
9. `fix: make claim persistence idempotent`
10. `llm: enforce structured extraction schema`
11. `llm: minimize prompt payload by route`
12. `llm: add injection boundary and remove duplicate model authority`
13. `perf: add deterministic no-llm routes`
14. `test: add conversation quality metrics`
15. `chore: remove quarantined dead code`
16. `chore: repair scripts and env validation`
17. `ops: add safe metrics and deployment runbook`
18. `ui: polish browser demo safety and accessibility`

Do not combine persistence replacement, FSM changes, and prompt/schema changes in one commit. Those are the highest-causality-risk areas.

## Batch completion checklist

Before marking any work package complete:

- `npm run typecheck` passes.
- The test/replay command for the batch passes.
- No source file outside the batch scope was changed.
- Logs and tests do not expose secrets or PII.
- Documentation is updated in `AGENTS.md`, this plan, and any focused doc whose behavior changed.
- Rollback is a single commit revert or a documented feature flag.
- Latency/token expectations are either measured or explicitly left as estimates.

## NOT VERIFIED items

Do not schedule implementation for these until verified:

- Speaker/touch target visual quality and full responsive behavior. Static evidence exists, but no browser/device verification was run in this phase.
- Any claim that the live Railway deployment matches local source. The repository contains an ad-hoc Railway smoke script, but no deployment configuration or current deployment evidence.
- Any external business rule not present in source/docs, including exact emergency wording, legal retention period, final callback workflow, or human handoff SLA.

