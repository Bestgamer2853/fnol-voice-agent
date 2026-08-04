# 03. End-to-End Execution Flow

> [!HOTSPOT]
> * **Probability:** 95% | **Est. Time:** 30m | **Difficulty:** Medium
> * **Likely Questions:**
>   - Walk me through every step from when a caller speaks to when Google Sheets is updated.
>   - At what point does the LLM run and how is latency minimized?
>   - Why does persistence not block the voice response?

---

## 1. The 7-Stage Request Lifecycle Pipeline

```
[1. Connection] ──► [2. Audio & STT] ──► [3. WebSocket Chunk] ──► [4. FSM + Gemini]
                                                                        │
[7. Outbox Logging] ◄── [6. Non-Blocking Async] ◄── [5. Voice Audio] ◄──┘
```

---

## 2. Step-by-Step Execution Sequence

### Stage 1: Connection & Handshake
* **Trigger:** Caller dials Retell phone number or starts WebRTC session in browser demo.
* **Network Protocol:** HTTP GET with `Upgrade: websocket` to `wss://<app>/chat`.
* **Execution:** `src/server.ts` handles `wss.on('connection')`:
  - Instantiates a unique `sessionId` UUID.
  - Calls `conversationManager.start()`.
  - Creates initial `ConversationState` in memory (`currentConversationStep = 'safety_check'`).

---

### Stage 2: Audio Transcription & VAD
* **Trigger:** Caller speaks: *"I just got rear-ended on Route 9, my neck hurts, policy number is POL-9988."*
* **Telephony Boundary:** Retell AI performs real-time Speech-to-Text (STT) and Voice Activity Detection (VAD).
* **WebSocket Inbound Payload:** Retell dispatches JSON frame over socket:
  ```json
  {
    "interaction_type": "response_required",
    "response_id": 42,
    "transcript": [
      { "role": "user", "content": "I just got rear-ended on Route 9, my neck hurts, policy POL-9988." }
    ]
  }
  ```

---

### Stage 3: Dynamic Prompt Assembly & Gemini SSE Stream
* **Location:** `src/services/extractClaimData.ts`.
* **FSM Calculation:** `ConversationManager` inspects state (`safety_check`). Calculates missing fields. Sets `fsmInstruction = "Check if user is safe, extract policy number and injury status."`
* **Prompt Assembly:** Merges `systemPrompt` (static rules) + `fsmInstruction` (dynamic step) + `responseJsonSchema` contract.
* **LLM Inference (<350ms TTFT):** Gemini 2.5 Flash Lite returns structured JSON stream:
  ```json
  {
    "responseToUser": "Oh goodness! Please make sure you are in a safe spot. Are you injured?",
    "extractedData": {
      "policyNumber": "POL-9988",
      "locationOfIncident": "Route 9",
      "injuriesReported": true
    }
  }
  ```

---

### Stage 4: Deterministic Business Rule Evaluation
* **Location:** `src/conversation/ConversationManager.ts`.
* **State Mutation:** Merges `extractedData` into `state.claimData`.
* **Policy Lookup:** Detects `policyNumber: "POL-9988"`. Executes `verifyPolicy("POL-9988")` -> Matches in `policies.json` -> Sets `state.verifiedPolicy = true`.
* **Safety Override:** Detects `injuriesReported === true`. Instantly executes `handleEscalation()`, forcing state to `'escalation'` and replacing dialogue with medical safety guidance.

---

### Stage 5: Real-Time Audio Response Dispatch
* **Location:** `src/server.ts`.
* **WebSocket Outbound Payload:** Immediately sends JSON back to Retell:
  ```json
  {
    "response_type": "response",
    "response_id": 42,
    "content": "I see you reported an injury. Please stay calm. Emergency services have been alerted.",
    "content_complete": true,
    "end_call": false
  }
  ```
* **Telephony Boundary:** Retell receives text, synthesizes TTS audio, and streams voice to caller. Total elapsed time: **~680ms**.

---

### Stage 6: Non-Blocking Async Persistence Trigger
* **Location:** `src/conversation/ConversationManager.ts`.
* **Execution:**
  ```typescript
  // Triggered without 'await' to preserve voice latency budget
  this.persistClaimData(sessionId).catch((err) => console.error(err));
  ```

---

### Stage 7: Dual-Write Outbox Persistence
* **Location:** `src/services/claimLogger.ts` (`MultiClaimLogger`).
* **Execution:** Runs `Promise.allSettled`:
  - **Write 1 (`LocalFileLogger`):** Appends claim JSON to `/data/claims.json` on local disk (~2ms).
  - **Write 2 (`GoogleSheetsClaimLogger`):** Appends row to remote Google Sheet (~1200ms).
  - **Write 3 (`NotificationService`):** Triggers Resend API to send HTML claim email (~800ms).

---

## 3. Current vs. Production Architecture Comparison

* 📌 **CURRENT IMPLEMENTATION:** Persistence is fired asynchronously via `Promise.allSettled` directly inside the Node process.
* 🚀 **PRODUCTION-SCALE EVOLUTION:** Publish a `ClaimCompleted` event to an Apache Kafka topic; a background worker consumes the event and writes to PostgreSQL with automatic retries and dead-letter queues.

---

> [!RECAP]
> 1. Inbound voice is converted to transcript JSON text by Retell over WebSockets (`/chat`).
> 2. `ConversationManager` injects dynamic FSM instructions into the Gemini 2.5 Flash Lite prompt.
> 3. Gemini returns structured JSON in <350ms (TTFT) containing both conversational text and extracted entities.
> 4. The TypeScript FSM evaluates policy rules and safety overrides deterministically.
> 5. Spoken responses return to Retell in <800ms while persistence runs asynchronously in the background.
