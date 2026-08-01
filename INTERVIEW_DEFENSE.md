# FNOL Voice Agent — Interview Defense & Architecture Q&A

This document prepares the engineering candidate for technical grilling during a Senior/Staff Engineer interview panel.

---

## 1. Top Technical Questions & Defensive Responses

### Q1: "Why did you implement a hybrid Deterministic FSM + LLM Extraction architecture instead of an all-LLM agent (like Vapi/Retell system prompts)?"

**Answer**:
> Pure LLM agents suffer from non-deterministic state drift, hallucinated policy verification, missed required fields, and unpredictable call completion gates.
> By decoupling:
> - **LLM Scope**: Per-turn slot extraction & natural voice response generation.
> - **Deterministic Engine Scope**: Policy lookup, slot validation/merging, required field tracking, FSM step transitions, towing entitlement, escalation rules, and claim persistence.
> 
> This guarantees 100% adherence to business logic (e.g., exactly 2 verification retries, hard policy verification precondition, mandatory injury escalation) while retaining human-like spoken dialogue.

---

### Q2: "How do you handle low-latency voice AI requirements (TTFT < 800ms) over WebSockets?"

**Answer**:
> 1. **Model Selection**: We use `gemini-2.5-flash-lite`, Google's production low-latency voice AI model.
> 2. **Native SSE Streaming**: We stream response tokens directly to the Retell WebSocket (`content_complete: false`) as they arrive.
> 3. **Non-blocking Asynchronous I/O**: Heavy external operations (Google Sheets append, Resend REST email dispatch, call summary generation) run in background promises post-turn rather than blocking the caller's audio stream.
> 4. **Micro-context Prompting**: The extraction prompt only passes the last 3 conversation turns and extracted slot state, minimizing prompt processing overhead.

---

### Q3: "What happens if the caller interrupts the agent mid-sentence?"

**Answer**:
> Retell sends an `update_only` event with the partial transcript as soon as barge-in audio is detected. Our WebSocket server (`src/server.ts`) immediately invokes an `AbortController` signal linked to the active Gemini LLM request, stopping token generation instantly and clearing the turn lock so the new user turn can be processed without race conditions.

---

### Q4: "How does your system prevent race conditions when the user speaks twice rapidly?"

**Answer**:
> Each session maintains an in-memory turn processing mutex (`turnLock`). If a new WebSocket frame arrives while a turn is processing, the system checks whether it's an interruption (`update_only`) or a new turn (`response_required`). If it's a new turn, the previous turn's `AbortController` aborts the prior LLM stream before processing the new turn.

---

### Q5: "What are the known trade-offs or technical debt items in this prototype?"

**Answer**:
> 1. **In-Memory State Storage**: `ConversationState` is currently stored in Node.js memory (`Map<string, Session>`). For multi-instance horizontal scaling, sessions should be moved to Redis with pub/sub WebSocket routing.
> 2. **Local JSON Persistence Concurrency**: Local JSON logging uses file reads/writes, which are non-atomic under heavy concurrent completion calls. Production would use PostgreSQL/DynamoDB with optimistic locking.
> 3. **Schema Validation**: WebSocket payloads rely on manual parsing rather than Zod/TypeBox schemas.
