# Known Limitations & Operating Notes

## 1. Retell Custom LLM WebSocket Protocol
- WebSocket connections are managed per session. In-memory `sessions` map stores conversation state.
- Horizontal scaling across multiple server instances requires a shared session store (e.g. Redis) instead of in-memory `Map`.

## 2. External API Rate Limits
- Google Sheets API quotas can limit high-concurrency batch writes.
- The `MultiClaimLogger` mitigates this by writing failed requests to `outbox.json` locally.

## 3. PII & Audit Logging
- Server logs emit state metrics (`[METRICS]`). Production deployment should obscure sensitive PII (such as full names and addresses) from standard stdout streams.
