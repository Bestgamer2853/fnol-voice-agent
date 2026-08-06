# State Management and Persistence

## Lifecycle

server.ts stores SessionRecord in a process-local Map keyed by UUID. TTL is one hour; pruning runs only on HTTP get-or-create, not on WebSocket close. Restart loses active calls and multiple instances cannot share sessions.

ConversationManager mostly spreads immutable state, but directly mutates state.severity in escalation. Claim primitive values overwrite on merge; vehicle fields shallow-merge. There is no per-field provenance, version, or structured correction event.

## Durable writes

- Local logger reads the full claims JSON array, appends, then rewrites it.
- Sheets logger initializes headers/format once and appends a row. Credentials come from GOOGLE_CREDENTIALS_JSON or repository-local google-credentials.json.
- MultiClaimLogger awaits both. Google catches errors and resolves; local failure rejects the caller turn. This permits silent partial persistence.

For a normal completed claim, the manager awaits the logger before transitioning to `completed` and returning the “claim logged” response. Retell may only close after a subsequent final acknowledgement, so a hang-up cannot race the normal claim record write.

The completed record holds the full claim, verified policy, full conversation history, summary, timestamp and escalation flag. Sheets flattens structure. Browser returns a simulated name-derived example.com email.

## Required future decisions

Before real use: define PII ownership, encryption, access, retention/deletion, residency, audit and incident controls. Adopt an atomic system of record or explicit outbox/idempotency model; retain durable per-turn checkpoints using call ID + response ID.
