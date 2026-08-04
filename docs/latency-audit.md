# Latency Audit

## Measured versus estimated

No controlled benchmark or production telemetry is committed. server.ts logs LLM usage and turn elapsed time when supplied by provider. Values below are estimates, not measurements, and exclude caller STT and Retell TTS.

| Stage | Calls/turn | Current behavior | Estimated typical / tail risk |
|---|---:|---|---|
| Retell event to handler | 1 | JSON parse + Map lookup | under 10 ms / event-loop delay |
| Prompt assembly | 1 | string/JSON serialization | under 10 ms |
| Primary Gemini | 1 | SSE, 8s abort, up to 2 retries | 0.5–2.5 s / 8s + retry backoff each |
| Groq fallback | 0–1 | SSE, 8s abort, 1 retry | 0.3–1.5 s / adds provider-exhaustion delay |
| JSON parse/state merge | 1 | in-process | under 10 ms |
| Policy/rules | 0–1 | preloaded policies/pure rules | under 10 ms |
| Completion logging | terminal | local JSON + Sheets Promise.all | 0.2–2s / unbounded external failure |

## Time to first audible text

Server searches streamed JSON for the responseToUser key and forwards fragments early. Earliest audio waits for model connection, first JSON bytes, and that key’s ordering. Since key order is not schema-enforced, the benefit is nondeterministic. Retell owns synthesis/playback.

## Bottlenecks and races

1. One remote structured LLM generation is critical path on every ordinary turn.
2. Gemini makes up to three total 8-second attempts. After failure, Groq can make two more. This is incompatible with predictable low-latency voice behavior.
3. Completion awaits persistence. Google errors are swallowed; local JSON errors become a user-visible 500.
4. Full transcripts/prompt/response logs amplify I/O and expose PII.
5. activeResponseIds prevents stale completion after an await but does not abort stale LLM work.
6. HTTP chat has no per-session lock; concurrent turns can overwrite state. Local JSON read-modify-write and per-process sequence are unsafe across concurrent/process instances.

## Later measurement plan

Instrument p50/p95/p99 for receipt, prompt build, provider connect, first model byte, first forwarded text, finish, parse, state commit and each persistence result. Tag provider/model/route/retry without plaintext PII.
