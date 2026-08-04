# 04. Architecture Deep Dive

> [!HOTSPOT]
> * **Probability:** 95% | **Est. Time:** 35m | **Difficulty:** Hard
> * **Likely Questions:**
>   - Walk me through your 4-page C4 architecture presentation deck.
>   - What are the boundaries between transport, orchestration, AI, and persistence?
>   - What is the glass-to-glass latency budget and how is it distributed?

---

## 1. Page 1: System Context & Container Diagram (C4 Level 1 & 2)

```
+----------------+      WebRTC Audio      +-----------------------+
|  Policyholder  | <--------------------> | Retell AI Voice GW    |
+----------------+                        +-----------------------+
                                                      |
                                                      | WS (JSON /chat)
                                                      v
                                          +-----------------------+
                                          | Node.js Server        |
                                          | (Railway Container)   |
                                          +-----------------------+
                                            /         |         \
                                 REST / SSE/          |           \ REST
                                          v           v            v
                                     +--------+  +--------+   +--------+
                                     | Gemini |  | Sheets |   | Resend |
                                     +--------+  +--------+   +--------+
```

### Component Responsibility & Protocol Matrix:
- **Retell AI Gateway:** Managed Voice AI proxy. Handles STT, TTS, and VAD. Translates voice audio into JSON transcript text over a persistent WebSocket connection.
- **Node.js Server (Railway):** Monolithic runtime hosted on Railway PaaS. Runs Express HTTP on port 3000 and mounts raw `ws` WebSocket server on path `/chat`.
- **Google Gemini 2.5 Flash Lite:** Primary LLM extraction engine. Communicates via HTTP/2 REST with native SSE streaming (`@google/genai`).
- **Google Sheets API:** External database sink. Communicates via HTTPS REST using Google OAuth2 Service Account JSON credentials.
- **Resend API:** Transactional email provider. Communicates via HTTPS REST using API Bearer token.

---

## 2. Page 2: Component Architecture (C4 Level 3)

Inside the **Node.js Server Container**, components are decoupled using Dependency Injection:

```
[src/server.ts (Express / WS)]
        │
        ▼
[src/conversation/ConversationManager.ts (FSM State Engine)]
        │
        ├───────────────────────────────┐
        ▼                               ▼
[src/services/extractClaimData.ts]   [src/services/verifyPolicy.ts]
        │                               │
        ▼                               ▼
[src/llm/gemini.ts]                  [policies.json]
        │
        ▼
[src/services/claimLogger.ts (MultiClaimLogger)]
        │
        ├───────────────────────────────┐
        ▼                               ▼
[src/storage/googleSheets.ts]       [src/services/notificationService.ts]
```

---

## 3. Page 3: Sequence & Latency Budget Breakdown (<800ms Target)

```
Caller       Retell AI        Node Server       Gemini 2.5       Google Sheets
  │              │                 │                 │                 │
  │───Speech────►│                 │                 │                 │
  │              │──WS update─────►│                 │                 │
  │              │                 │──Extract JSON──►│                 │
  │              │                 │◄──Stream SSE────│                 │
  │              │                 │ (FSM Evaluate)  │                 │
  │              │◄──WS response───│                 │                 │
  │◄──Audio TTS──│                 │                 │                 │
  │              │                 │──Async Persist (No Await)────────►│
```

### Stage Latency Breakdown:
| Stage | Component | Duration | Notes |
| :--- | :--- | :--- | :--- |
| **STT + VAD** | Retell AI | ~150ms | Audio transcription & utterance end detection |
| **Network Transport** | WebSockets | ~50ms | Payload dispatch over persistent TCP socket |
| **LLM Inference** | Gemini 2.5 Flash Lite | ~350ms | Time-To-First-Token (TTFT) via SSE stream |
| **FSM Validation** | Node.js Runtime | ~5ms | In-memory TypeScript state evaluation |
| **TTS Audio** | Retell AI | ~150ms | Voice audio synthesis |
| **Total Target** | **Glass-to-Glass** | **~705ms** | Fits well within <800ms human pause threshold |

---

## 4. Page 4: Finite State Machine (FSM) State Diagram

```
         ┌────────────────┐
         │  safety_check  │
         └───────┬────────┘
                 │ Safe / No Injury
                 ▼
         ┌────────────────┐
         │  verification  │◄── Policy Check Failed (Max 2 Attempts)
         └───────┬────────┘
                 │ Policy Verified
                 ▼
    ┌──────────────────────────┐
    │    collecting_details    │◄── Clarification Required
    └────────────┬─────────────┘
                 │ All Required Fields Present
                 ▼
    ┌──────────────────────────┐
    │   recommending_services  │
    └────────────┬─────────────┘
                 │ Services Offered / Skipped
                 ▼
         ┌────────────────┐
         │   completed    │
         └────────────────┘
```

---

## 5. Architectural Tradeoffs & Defense Matrix

| Decision | Current Prototype Strategy | Production Scale Evolution | Tradeoff & Defense |
| :--- | :--- | :--- | :--- |
| **Orchestration** | In-Memory TypeScript FSM | Distributed Workflow Engine | FSM guarantees 100% compliance; pure LLMs hallucinate. |
| **Session State** | In-Memory `sessions` Map | Redis Cluster (`ioredis`) | In-Memory is sub-ms fast for demo; Redis needed for multi-pod scale. |
| **LLM Model** | Gemini 2.5 Flash Lite | Gemini + Fallback Pool | Flash Lite has ~350ms TTFT; GPT-4o is too slow (>1000ms). |
| **Persistence** | Non-blocking `Promise.allSettled` | Kafka Event Outbox Queue | Non-blocking prevents 1.5s DB latency from ruining voice stream. |

---

> [!RECAP]
> 1. The architecture separates voice transport (Retell), state orchestration (FSM), entity extraction (Gemini), and persistence (Sheets).
> 2. Dependency Injection in `runtime.ts` decouples components, allowing complete offline unit testing.
> 3. Total voice latency is budgeted at ~705ms, well within the human conversational threshold of <800ms.
> 4. The FSM strictly dictates state transitions; the LLM is restricted to entity extraction and natural language phrasing.
> 5. Async persistence prevents slow third-party API writes from adding latency to the real-time voice loop.
