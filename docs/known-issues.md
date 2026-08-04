# Known Issues and Risks

Severity is an engineering prioritization, not a legal/compliance classification.

| Priority | Finding | Evidence | Consequence |
|---|---|---|---|
| P0 | PII is logged verbatim and exposed through unauthenticated GET /view-logs | server.ts raw Retell event and log buffer | policy/transcript disclosure |
| P0 | No authentication/authorization/rate limit for chat, logs, or socket | server.ts | abuse and data exposure |
| P0 | Safety escalation does not set escalationRequired or persist an urgent disposition | manager escalation branch | audit/operational mismatch |
| P1 | Declared FSM differs from actual transitions | manager never assigns most declared states | testing/prompt behavior unreliable |
| P1 | Claim persistence is non-atomic and Sheets failure is swallowed | claimLogger/runtime/googleSheets | lost or silently partial FNOL records |
| P1 | Provider retry/fallback tail can be tens of seconds | gemini/groq retry loops | unacceptable silent voice gaps |
| P1 | Stale in-flight LLM calls are not aborted on interruption | server response-ID guard only | wasted tokens/capacity and confusing events |
| P1 | HTTP same-session races can lose state | no lock/version check | incorrect claim record |
| P1 | Global response cache can cross-contaminate sessions | extraction cache key | incorrect/PII-leaking response |
| P1 | Response streaming relies on regex JSON string scanning | server.ts | malformed/escaped/key-order output behavior |
| P1 | Structured JSON uses MIME type but no enforced schema | extraction/gemini | invalid or incomplete slot extraction |
| P2 | Model availability/default and .env.example disagree | code versus example | deployment failure/confusion |
| P2 | Browser uses innerHTML for confirmation data | public/app.js | injection if values ever become untrusted |
| P2 | No test suite/CI and stale scripts | package.json | regression risk |
| P2 | Current date uses UTC; date normalization uses local Date semantics | extraction/normalize | timezone-boundary errors |
| P2 | Policy fuzzy matching can select ambiguous policy | verifyPolicy Levenshtein first match | identity verification risk |
| P3 | Unbounded runtime log buffer and session cleanup gaps | server.ts | memory growth |

## Frontend appendix

Limited static review: semantic form controls and aria-live regions are positive. The speaker toggle is 36px, below common 44px touch guidance; styles duplicate contradictory mic/speaker visibility rules; `innerHTML` introduces an avoidable injection surface. No browser/device test was run and no design context was supplied, so no visual-quality score is asserted.
