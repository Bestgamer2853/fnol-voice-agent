# 01. 95% Probability Questions

> [!HOTSPOT]
> * **Probability:** 95%
> * **Likely Questions:**
>   - How do you explain the system architecture in under 60 seconds?
>   - Why does the state machine override the LLM?
>   - What is the glass-to-glass latency budget and how is it met?

---

### Q1: "Explain your high-level architecture." (⭐⭐⭐⭐⭐)
**Model Answer:**  
*"The system uses a 4-tier decoupled architecture: **Transport**, **Orchestration**, **AI Extraction**, and **Persistence**. 
Retell AI handles voice telephony and WebRTC, streaming transcript text to our Node.js server via WebSockets. 
Our `ConversationManager` acts as an in-memory Finite State Machine (FSM). On every turn, it sends the transcript to Gemini 2.5 Flash Lite via SSE streaming to extract structured JSON data. 
The FSM validates the JSON against business rules—such as policy verification and injury escalations. 
Finally, completed claims are saved via non-blocking async dual-writes to local disk and Google Sheets, triggering a transactional email via Resend."*

---

### Q2: "Why use a Finite State Machine (FSM) instead of letting the LLM drive the conversation?" (⭐⭐⭐⭐⭐)
**Model Answer:**  
*"In insurance, compliance is non-negotiable. Pure LLM agents hallucinate, skip mandatory questions, or get confused by out-of-order user speech. 
My FSM (`ConversationManager.ts`) defines explicit valid states (`safety_check`, `verification`, `collecting_details`, `escalation`, `completed`). 
The LLM is restricted to being an extraction tool; it converts raw human speech into JSON entities. The FSM evaluates those entities and determines the next business step. The LLM never decides business state."*

---

### Q3: "Why did you choose Gemini 2.5 Flash Lite over OpenAI GPT-4o?" (⭐⭐⭐⭐⭐)
**Model Answer:**  
*"Voice AI is fundamentally constrained by **Time-To-First-Token (TTFT)**. Humans expect conversational responses in under 1 second. 
Gemini 2.5 Flash Lite delivers a TTFT of ~350ms using native Server-Sent Events (SSE). GPT-4o has higher reasoning capabilities, but its TTFT often exceeds 1000ms, which creates awkward conversational dead air. For structured JSON extraction, Flash Lite gives us the optimal speed-to-accuracy ratio."*

---

### Q4: "How does the Retell AI WebSocket integration work?" (⭐⭐⭐⭐⭐)
**Model Answer:**  
*"We implement Retell's Custom LLM protocol over raw WebSockets (`/chat`). Retell manages Speech-to-Text (STT) and Voice Activity Detection (VAD). 
When VAD detects the end of an utterance, Retell sends an `update` JSON payload over the WebSocket containing the transcript array and a unique `response_id`. 
Our server processes the turn and sends back a `response` payload containing the text string for Retell to synthesize into Speech-to-Text (TTS)."*

---

### Q5: "How do you handle Barge-in (user interruptions)?" (⭐⭐⭐⭐⭐)
**Model Answer:**  
*"Barge-in is handled natively at the telephony boundary by Retell's VAD. When the caller speaks mid-sentence, Retell cuts off the client-side audio playback, invalidates the active `response_id`, and sends a new `update` transcript payload to our server. 
Our server processes the new turn, ignoring any obsolete in-flight responses."*

---

### Q6: "Why is persistence non-blocking/asynchronous?" (⭐⭐⭐⭐)
**Model Answer:**  
*"Third-party APIs like Google Sheets take 1,000ms to 2,000ms to respond. If we `await` Google Sheets before returning our response to Retell, voice latency explodes to over 2.5 seconds. 
In `ConversationManager.ts`, we trigger `this.persistClaimData()` without `await`. It runs asynchronously in the background using `Promise.allSettled`, allowing the spoken response to return to the user in <800ms."*

---

### Q7: "What is the difference between JSON Schema Extraction and Tool/Function Calling?" (⭐⭐⭐⭐)
**Model Answer:**  
*"Tool calling requires an LLM to decide *if* it wants to execute a function, emit arguments, wait for the backend to execute the function, and then process the result—adding 2 full network round-trips. 
JSON Schema Extraction (`responseJsonSchema` in Gemini) forces the LLM to emit both the conversational text (`responseToUser`) and extracted entities (`extractedData`) in a **single inference pass**. This halves latency."*

---

### Q8: "How do you prevent race conditions if a user speaks twice rapidly?" (⭐⭐⭐⭐)
**Model Answer:**  
*"Because Node.js runs an asynchronous event loop, two fast consecutive turns could trigger concurrent `handleTurn` executions that read and overwrite the same in-memory state. 
In this prototype, we process turns sequentially per WebSocket connection. For production, we would enforce a Redis distributed lock (Redlock) keyed on `callId` to serialize turn execution."*

---

### Q9: "What happens if Google Sheets API hits a rate limit or fails?" (⭐⭐⭐⭐)
**Model Answer:**  
*"We implement an Outbox pattern in `src/services/claimLogger.ts` using `MultiClaimLogger`. It wraps both `LocalFileLogger` and `GoogleSheetsClaimLogger` in `Promise.allSettled`. 
If Google Sheets returns a 429 rate limit or 500 error, the local disk write still succeeds. The claim is preserved on disk, preventing data loss."*

---

### Q10: "How do you handle policy verification securely?" (⭐⭐⭐⭐)
**Model Answer:**  
*"We decouple policy verification from the LLM. When the LLM extracts a policy number, the FSM passes it to `src/services/verifyPolicy.ts`, which performs a deterministic lookup against our mock database (`policies.json`). 
If the policy is unverified, the FSM forces the conversation state to remain in `verification` and prompts the user to re-enter their details."*

---

### Q11: "What are the latency budgets across your pipeline?" (⭐⭐⭐⭐)
**Model Answer:**  
*"Our total target glass-to-glass latency budget is **<800ms**:
- **STT + VAD (Retell):** ~150ms
- **Network WebSocket Transport:** ~50ms
- **Gemini TTFT (LLM Inference):** ~350ms
- **FSM Business Logic:** ~5ms
- **TTS Audio Synthesis (Retell):** ~150ms"*

---

### Q12: "How is the app deployed on Railway?" (⭐⭐⭐⭐)
**Model Answer:**  
*"Railway auto-detects our Node.js repository via Nixpacks, installs dependencies, and runs `npm start`. Railway terminates SSL (providing HTTPS and WSS endpoints for Retell). Environment secrets like `GEMINI_API_KEY` and base64-encoded `GOOGLE_CREDENTIALS_JSON` are injected at runtime."*

---

### Q13: "Why did you use Express with raw `ws` instead of Socket.io?" (⭐⭐⭐⭐)
**Model Answer:**  
*"Socket.io adds a custom framing protocol, heartbeat wrappers, and HTTP long-polling fallbacks. Retell AI strictly requires a standard RFC 6455 WebSocket connection. Using raw `ws` attached to our Express HTTP server ensures strict protocol compatibility with zero overhead."*

---

### Q14: "How does the system handle medical emergency escalations?" (⭐⭐⭐⭐)
**Model Answer:**  
*"If the LLM extracts `injuriesReported: true` OR the user utters distress keywords, the FSM instantly executes `handleEscalation()`. This overrides all missing field collection, marks the claim status as `escalated_medical`, and triggers an immediate spoken instruction telling the caller to seek emergency medical care."*

---

### Q15: "What is the single biggest architectural limitation of this codebase?" (⭐⭐⭐⭐⭐)
**Model Answer:**  
*"The in-memory `ConversationState` map in `ConversationManager.ts`. Because state lives inside Node.js process memory, the server cannot scale horizontally across multiple instances without dropping active call sessions upon redeployment or pod rebalancing."*

---

> [!RECAP]
> 1. Always explain the architecture top-down (Transport -> FSM -> LLM -> Persistence).
> 2. Defend the FSM as an unbreakable compliance boundary preventing LLM hallucinations.
> 3. Quote TTFT (~350ms) and total latency (<800ms) to prove performance engineering rigor.
> 4. Explain single-pass JSON extraction vs 2-pass tool calling to demonstrate LLM optimization expertise.
> 5. Own the in-memory Map limitation immediately to prove Staff-level architectural maturity.
