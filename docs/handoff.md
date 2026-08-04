# Next-Agent Handoff

## Current status

Phase 1 documentation only is complete. No source code, prompts, FSM, architecture, dependencies or commits were changed. npm run typecheck passed. Git worktree previously contained untracked scratch/ and test-output.txt; documentation work adds AGENTS.md and docs/ only.

## Read first

1. AGENTS.md
2. docs/MASTER_IMPLEMENTATION_PLAN.md
3. docs/execution-flow.md and docs/fsm.md
4. docs/prompts.md, docs/state-management.md, docs/known-issues.md
5. docs/optimization-roadmap.md and docs/research.md

## Architecture

Express + ws shares port 3000 by default. Browser posts text to HTTP; Retell sends transcript events to WebSocket. Sessions are in-memory. ConversationManager makes one streamed JSON LLM extraction/response call through native Gemini, optional Groq fallback. Deterministic code merges slots, verifies policies.json, escalates, recommends services, creates claim numbers/summaries, and logs to JSON plus Google Sheets.

## Deployment and environment

No deploy configuration is committed. See environment.md for actual variables and the mismatch with .env.example. Existing diagnostics imply Railway, but do not assume it remains live. Never expose contents of .env or google-credentials.json.

## Research

research.md compares current direct Retell/LLM approach to Retell protocol, Gemini structured/Live capabilities, LiveKit, Pipecat, LangGraph and OpenAI Realtime using official/open-source sources. It is intentionally decision-neutral.

## Open issues and backlog

Highest concerns are PII logging/unprotected logs, state/FSM mismatch, unsafe persistence/concurrency, weak structured-output enforcement, retries/tail latency, stale request work and missing tests. See known-issues.md and the ranked roadmap.

## Testing strategy required before changes

Create deterministic unit tests for policy normalization/verification, field tracking, merge/corrections, escalation and recommendations. Add manager integration tests with fake LLM/logger/provider. Add Retell protocol replay tests including response ID ordering/interruption and malformed events. Use de-identified scenario fixtures; block release on FNOL field completeness, correct urgent escalation, no cross-session state, logging idempotency and acceptable latency/error SLOs.

## Interview requirements / narrative

Be ready to explain why deterministic business decisions remain outside the LLM, why one call currently combines extraction and language, how structured outputs and validation should evolve, why event/session persistence matters for FNOL, and the tradeoff between direct Retell WS versus LiveKit/Pipecat/Realtime architectures. Demonstrate metrics, replay evaluation and failure handling rather than only a happy-path demo.

## Next action

Wait for explicit implementation authorization. Use docs/MASTER_IMPLEMENTATION_PLAN.md as the execution control document and start with the P0 regression harness unless the user explicitly scopes a narrower first batch.
