# Ranked Optimization Backlog

Estimates are directional and require measurement. Risk reflects risk of changing a claims workflow.

| Rank | Improvement | Impact | Difficulty | Risk | Latency reduction | Token reduction | Engineering value | Interview value |
|---:|---|---|---|---|---|---|---|---|
| 1 | Remove/redact unauthenticated transcript/prompt logs; protect endpoints | Critical | M | M | none | none | very high | very high |
| 2 | Define explicit FSM transitions/invariants and test every terminal route | Critical | M | M | indirect | small | very high | very high |
| 3 | Durable transactional claim/session store with idempotency/outbox | Critical | L | H | completion reliability | none | very high | very high |
| 4 | Per-session serialized turns plus abort propagation | High | M | M | avoids stale tail | avoids cancelled-turn cost | high | high |
| 5 | Enforce JSON schema and separate validation/error disposition | High | M | M | lowers repair loops | lowers malformed retries | high | high |
| 6 | Bound provider retry budget by voice deadline and add circuit/telemetry | High | M | M | p95/p99 major | failed-attempt cost | high | high |
| 7 | Replace weak/global response cache or remove after benchmarking | High | S | L | avoids wrong cache behavior | uncertain | high | high |
| 8 | Persist escalation/callback outcomes and operator handoff | High | M | M | none | none | high | very high |
| 9 | Make prompt/state schema minimal, versioned and route-specific | Medium | M | M | 50–300ms inferred | 15–40% inferred | high | high |
| 10 | Separate deterministic response routes from LLM extraction/generation | Medium | M | M | 0.5–2.5s on selected turns | 100% selected turns | high | high |
| 11 | Implement replay/evaluation/contract test suite and CI | High | M | L | prevents regression | exposes waste | very high | very high |
| 12 | Production deployment/runbook/health/metrics | High | M | M | indirect | none | high | high |
| 13 | Remove stale code/scripts/docs after coverage | Medium | S–M | L | minor | none | medium | medium |
| 14 | Improve browser safety/a11y surfaces | Medium | S | L | none | none | medium | medium |

## Sequencing

Phase 2 should begin with confirming business requirements and writing replay tests, then resolve security/data exposure and FSM truth before optimizing model behavior. Do not combine provider migration, persistence replacement and prompt/FSM changes in one release; that would make causality and insurance acceptance testing unclear.
