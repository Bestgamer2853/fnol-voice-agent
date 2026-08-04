# External Research and Comparison

Research current as of 2026-07-31. This is a design comparison, not an implementation recommendation or claim that a framework is required.

## Sources

- [Retell LLM WebSocket protocol](https://docs.retellai.com/api-references/llm-websocket): Retell initiates the socket, identifies a call through the endpoint path, and documents call-details, update-only, response/reminder, config, streaming response, interruption, tools, and metadata events.
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output): Gemini supports a subset of JSON Schema and SDK schema definitions.
- [Gemini Live API practices](https://ai.google.dev/gemini-api/docs/live-api/best-practices): recommends clear ordered instructions, precise tools, small audio chunks, interruption handling, context compression, session resumption and GoAway/generation-complete handling.
- [OpenAI Realtime API reference](https://platform.openai.com/docs/api-reference/realtime): provides realtime calls and voice primitives; a future comparison candidate if model/provider selection changes.
- [LiveKit Agents overview](https://docs.livekit.io/agents/) and [deployment model](https://docs.livekit.io/deploy/custom/deployments/): worker/job lifecycle, load balancing, deployment/observability integrations, and one subprocess per job.
- [Pipecat repository](https://github.com/pipecat-ai/pipecat): open-source realtime voice/multimodal pipeline framework with pluggable transports/services.
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence): state checkpoints/threads and persistent production stores, including recovery from pending writes.

## Comparison

| Capability | This repository | Production patterns above | Gap / observation |
|---|---|---|---|
| Telephony transport | Direct Retell WS with manual event routing | Retell custom LLM supports this, but provider recommends built-in frameworks when appropriate | Validate full protocol, auth and recovery behavior against current spec |
| Voice pipeline | Retell STT/TTS externally; browser Web Speech demo | LiveKit/Pipecat offer explicit media pipeline, turn detection and interruption primitives | Current design is text-turn orchestration, not a self-managed audio pipeline |
| Turn interruption | response IDs suppress stale final state/send | Live API guidance calls for client audio buffer interruption/discard; realtime frameworks coordinate turns | missing cancellation propagation and explicit interruption model |
| Structured data | MIME JSON + handwritten parsing/validation | Gemini offers schema-constrained structured output | no responseJsonSchema; output contract weak |
| State | process Map, final JSON/Sheet log | LangGraph checkpoints; LiveKit jobs/process isolation; common durable store | restart/scale/fault recovery absent |
| Scale | single Node process | worker pools, jobs, load balancing, containers | no horizontal-scale/session-store plan |
| Observability | console + unbounded log endpoint | traces, transcripts, metrics/quality telemetry | no safe structured telemetry or SLOs |
| Persistence | local file + Sheet append | transactional records/outbox/checkpoint stores | non-atomic and spreadsheet is not audit system of record |
| Evaluation | manual/ad-hoc scripts/historic log | replay/evals and traced runs are common production practice | no regression acceptance suite |

## FNOL/insurance-specific implications

FNOL needs a deterministic audit trail for identity verification, collected facts, corrections, safety/escalation disposition, consent/communications, and persistence outcome. Current code has a useful separation between deterministic policy/rules and model language, but does not yet make its state transitions, data lineage, security, or failure outcomes audit-grade. Any production treatment requires insurance operations, privacy, security, accessibility and legal review; framework adoption alone cannot provide those controls.

## Technology assessment

Keep the current direct Retell integration if its custom business controls are genuinely needed, but compare protocol coverage against Retell’s current guide. Consider LiveKit/Pipecat only if owning media/transport, richer interruption handling or multi-provider audio pipelines becomes a stated requirement. Consider LangGraph only if durable checkpointed workflow/human review becomes complex enough to justify a new orchestration dependency. Gemini Live/OpenAI Realtime may reduce hops in a voice-native design, but switching providers is a product, risk and evaluation project—not a latency-only patch.
