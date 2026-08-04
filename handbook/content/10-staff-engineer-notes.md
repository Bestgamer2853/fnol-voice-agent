# 10. Staff Engineer Voluntary Notes

> [!HOTSPOT]
> * **Probability:** 80% | **Est. Time:** 20m | **Difficulty:** Medium
> * **Likely Questions:**
>   - What architectural critiques do you voluntarily offer about your own codebase?
>   - How would you defend your prototype design vs. production evolution?

---

## 1. Top 6 Senior Voluntary Callouts

### Callout 1: In-Memory State vs. Stateless Pod Scaling
* **What to say:** *"Before we dive into details, I want to voluntarily acknowledge the primary architectural limitation of this prototype: state is held in an in-memory Node.js `Map`. While optimal for sub-millisecond local lookups during our demo, taking this to production requires externalizing state to Redis so we can run stateless container pods behind a Network Load Balancer."*

---

### Callout 2: Decoupling Voice Processing from DB Persistence
* **What to say:** *"One design decision I made early on was strictly separating our real-time voice latency budget from our persistence layer. Downstream APIs like Google Sheets take over a second to respond. By triggering `persistClaimData()` asynchronously without `await`, we ensure voice response times stay below 800 milliseconds regardless of database health."*

---

### Callout 3: Why We Used a Hybrid FSM Instead of Pure LLM Agents
* **What to say:** *"In insurance, regulatory compliance prohibits non-deterministic LLM behavior. We couldn't risk an LLM skipping policy verification or mishandling medical injuries. We built a hybrid model where the LLM is purely a natural language extraction tool, while a deterministic TypeScript state machine owns the business rules and state transitions."*

---

### Callout 4: Single-Pass JSON Extraction vs. Tool Calling
* **What to say:** *"Instead of using LLM tool calling—which requires two network round-trips (one for the tool call, one for the response)—we designed a single-pass prompt enforcing a structured JSON schema (`responseJsonSchema`). The LLM returns both the conversational spoken text and the extracted entities in a single inference pass, cutting LLM latency in half."*

---

### Callout 5: The Resilient Dual-Write Outbox Pattern
* **What to say:** *"For persistence, we implemented `MultiClaimLogger` using `Promise.allSettled`. If Google Sheets hits a 429 rate limit, `Promise.allSettled` prevents the error from bubbling up or aborting the local disk write. The claim is saved locally first, acting as a lightweight Outbox pattern."*

---

### Callout 6: Idempotency & Message Deduplication
* **What to say:** *"In a production voice system, network hiccups cause retries. To make our state updates idempotent, every turn payload carries a unique `response_id` from Retell. If we receive a duplicate `response_id`, our state machine detects it and ignores the duplicate execution."*

---

## 2. Staff Architecture Posture Matrix

| Topic | Mid-Level Response | Staff-Level Response |
| :--- | :--- | :--- |
| **Runtime** | "JavaScript is easy for backend." | "Node's non-blocking I/O event loop handles concurrent I/O-bound WebSockets efficiently." |
| **Testing** | "I run the server and test manually." | "We use Dependency Injection (`runtime.ts`) to mock LLM and DB, running offline unit tests on the FSM." |
| **Fault Tolerance** | "We catch errors and print them." | "We use `Promise.allSettled` for local outbox fallback and publish events to a durable Kafka queue." |
| **LLM Model** | "Google AI is good." | "Gemini 2.5 Flash Lite offers ~350ms TTFT, which fits inside our <800ms total voice latency budget." |

---

> [!RECAP]
> 1. Voluntarily call out your in-memory Map prototype limitation before the interviewer asks.
> 2. Explain non-blocking async persistence as a deliberate P95 latency optimization.
> 3. Defend the TypeScript FSM as an unbreakable regulatory compliance boundary.
> 4. Highlight single-pass JSON extraction over tool calling to demonstrate LLM latency optimization.
> 5. Frame prototype limitations strictly as intentional tradeoffs made for speed of delivery.
