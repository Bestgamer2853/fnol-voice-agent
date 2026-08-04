# 14. Code Navigation Mode ("Explain This File")

> [!HOTSPOT]
> * **Probability:** 95%
> * **Likely Questions:**
>   - Open `ConversationManager.ts`: Explain why it owns the state machine.
>   - Open `extractClaimData.ts`: How are prompts dynamically constructed per turn?
>   - Open `claimLogger.ts`: How does `Promise.allSettled` protect local persistence?

---

<h2 id="conversationmanager-ts">1. 📄 src/conversation/ConversationManager.ts</h2>

1. **Purpose:** The core brain and FSM state orchestrator. Ensures non-deterministic LLM output strictly obeys insurance rules.
2. **Execution Order:** Called on every incoming WebSocket message after initial connection handshake.
3. **Who calls this file?** `src/server.ts` via `conversationManager.handleTurn(callId, transcript)`.
4. **What files does it call?** `extractClaimData.ts`, `verifyPolicy.ts`, `claimLogger.ts`, `requiredFields.ts`.
5. **Key Exports:** Class `ConversationManager`.
6. **Critical Functions:**
   - `handleConnection(ws, callId)`: Initializes in-memory `ConversationState`.
   - `handleTurn(callId, transcript)`: Runs extraction, evaluates policy, handles escalations, fires async persistence.
   - `handleEscalation(state)`: Forces state to `'escalation'` if injuries are reported.
7. **Important Interfaces:** `ConversationState`, `ExtractClaimDataService`, `ClaimLoggerService`.
8. **State Changes:** Mutates `sessions` Map (updates `currentConversationStep`, `claimData`, `verifiedPolicy`).
9. **Common Interview Questions:** *"How do you prevent the LLM from hallucinating claim approvals?"*
10. **Typical Modifications:** Adding new state transition guardrails or state timeout cleanups.
11. **Production Improvements:** Externalize `sessions` Map to Redis and wrap `handleTurn` in a Redlock mutex.
12. **Related Architecture Diagram:** Page 2 (Component Architecture) & Page 4 (FSM Diagram).
13. **Related Handbook Chapters:** Chapter 03, Chapter 05, Chapter 06.
14. **Common Mistakes:** Thinking `ConversationManager` calls Gemini directly (it uses `ExtractClaimDataService` interface).

---

<h2 id="server-ts">2. 📄 src/server.ts</h2>

1. **Purpose:** Network entry point. Co-locates Express HTTP REST routes and raw WebSocket `/chat` server on Port 3000.
2. **Execution Order:** Runs continuously upon container boot (`npm start`).
3. **Who calls this file?** Railway container / Node.js runtime.
4. **What files does it call?** `src/runtime.ts` (`createRuntime()`), `ws` library.
5. **Key Exports:** Express app, HTTP server instance.
6. **Critical Functions:**
   - `wss.on('connection')`: Handles Retell AI socket connection.
   - `ws.on('message')`: Parses Retell Custom LLM JSON payloads (`event === 'update'`).
7. **Important Interfaces:** `RetellWebSocketMessage`, `RetellResponsePayload`.
8. **State Changes:** None directly (delegates all state to `ConversationManager`).
9. **Common Interview Questions:** *"Why use raw `ws` with Express instead of Socket.io?"*
10. **Typical Modifications:** Adding HTTP auth middleware or custom health-check probes (`GET /health`).
11. **Production Improvements:** Place behind NGINX / ALB for SSL termination and connection rate limiting.
12. **Related Architecture Diagram:** Page 1 (System Context) & Page 2 (Component Architecture).
13. **Related Handbook Chapters:** Chapter 04, Chapter 05, Chapter 07.
14. **Common Mistakes:** Claiming this file processes audio (it only handles JSON text over WS).

---

<h2 id="gemini-ts">3. 📄 src/llm/gemini.ts</h2>

1. **Purpose:** Google Gemini SDK wrapper and native SSE streaming adapter.
2. **Execution Order:** Called synchronously during `extractClaimData.ts` execution.
3. **Who calls this file?** `src/services/extractClaimData.ts`.
4. **What files does it call?** `@google/genai` (Google Generative AI SDK).
5. **Key Exports:** `createGeminiLLMProvider()`, `GeminiLLMProvider`.
6. **Critical Functions:** `generateResponse(params)`: Executes streaming Gemini call with `responseJsonSchema`.
7. **Important Interfaces:** `LLMProvider`, `LLMResponse`.
8. **State Changes:** None (Pure I/O adapter).
9. **Common Interview Questions:** *"Why Gemini 2.5 Flash Lite over GPT-4o?"*
10. **Typical Modifications:** Changing model parameters (`temperature`, `topP`, `maxOutputTokens`).
11. **Production Improvements:** Wrap in a Circuit Breaker (`opossum`) with automatic failover to Groq/Claude.
12. **Related Architecture Diagram:** Page 1 (System Context) & Page 3 (Sequence Diagram).
13. **Related Handbook Chapters:** Chapter 01, Chapter 07.
14. **Common Mistakes:** Forgetting that Gemini uses native SSE streaming under the hood.

---

<h2 id="extractclaimdata-ts">4. 📄 src/services/extractClaimData.ts</h2>

1. **Purpose:** Dynamic prompt engineering and structured JSON extraction engine.
2. **Execution Order:** Runs on every conversational turn inside `ConversationManager.handleTurn()`.
3. **Who calls this file?** `ConversationManager.ts`.
4. **What files does it call?** `src/llm/gemini.ts` (`LLMProvider`), `requiredFields.ts`.
5. **Key Exports:** `createExtractClaimDataService()`, `GeminiExtractClaimDataService`.
6. **Critical Functions:**
   - `extract(input)`: Assembles `systemPrompt`, `fsmInstruction`, and conversation history, then calls LLM.
   - `extractFallbackClaimPatch(text)`: Regex fallback parser if LLM emits malformed JSON.
7. **Important Interfaces:** `ExtractClaimDataService`, `ClaimDataExtractionResult`.
8. **State Changes:** None (returns extracted patch to `ConversationManager`).
9. **Common Interview Questions:** *"How do you instruct the LLM what to ask next?"*
10. **Typical Modifications:** Adding new dynamic system prompt instructions or tuning field extraction prompts.
11. **Production Improvements:** Cache static prompt headers to utilize Gemini Context Caching.
12. **Related Architecture Diagram:** Page 2 (Component Architecture).
13. **Related Handbook Chapters:** Chapter 05, Chapter 07.
14. **Common Mistakes:** Confusing this service with `ConversationManager` (this file only extracts; it doesn't enforce state).

---

<h2 id="verifypolicy-ts">5. 📄 src/services/verifyPolicy.ts</h2>

1. **Purpose:** Deterministic policy verification lookup service.
2. **Execution Order:** Called when `claimData.policyNumber` is detected in state.
3. **Who calls this file?** `ConversationManager.ts`.
4. **What files does it call?** `src/config/policies.json`.
5. **Key Exports:** `createVerifyPolicyService()`, `verifyPolicy()`.
6. **Critical Functions:** `verifyPolicy(policyNumber, callerName)`: Matches inputs against mock policy database.
7. **Important Interfaces:** `VerifyPolicyService`, `PolicyRecord`.
8. **State Changes:** None (returns policy match object or `null`).
9. **Common Interview Questions:** *"Why isn't policy verification performed by the LLM?"*
10. **Typical Modifications:** Replacing local JSON lookup with a real SQL/REST database query.
11. **Production Improvements:** Connect to Guidewire / DuckCreek Policy Core REST API via Redis-cached client.
12. **Related Architecture Diagram:** Page 2 (Component Architecture).
13. **Related Handbook Chapters:** Chapter 02, Chapter 06.
14. **Common Mistakes:** Believing policy verification calls an external live API (it uses `policies.json`).

---

<h2 id="claimlogger-ts">6. 📄 src/services/claimLogger.ts</h2>

1. **Purpose:** Resilient dual-write outbox persistence coordinator.
2. **Execution Order:** Fired asynchronously (without `await`) at the end of every completed turn.
3. **Who calls this file?** `ConversationManager.ts` (`persistClaimData()`).
4. **What files does it call?** `googleSheets.ts`, `notificationService.ts`, `LocalFileLogger`.
5. **Key Exports:** `MultiClaimLogger`, `LocalFileLogger`, `ClaimLoggerService`.
6. **Critical Functions:** `log(record)`: Executes `Promise.allSettled` across all loggers.
7. **Important Interfaces:** `ClaimLoggerService`, `ClaimLogRecord`.
8. **State Changes:** Appends claim records to local disk `/data/claims.json`.
9. **Common Interview Questions:** *"Why use `Promise.allSettled` instead of `Promise.all`?"*
10. **Typical Modifications:** Adding a new database destination logger (e.g. Postgres, DynamoDB).
11. **Production Improvements:** Replace direct disk writes with an Apache Kafka / AWS SQS publisher.
12. **Related Architecture Diagram:** Page 2 (Component Architecture) & Page 3 (Sequence Diagram).
13. **Related Handbook Chapters:** Chapter 04, Chapter 05, Chapter 09.
14. **Common Mistakes:** Thinking this file blocks the voice response thread (it runs non-blocking).

---

<h2 id="googlesheets-ts">7. 📄 src/storage/googleSheets.ts</h2>

1. **Purpose:** Google Sheets API integration adapter.
2. **Execution Order:** Executed asynchronously inside `MultiClaimLogger`.
3. **Who calls this file?** `src/services/claimLogger.ts`.
4. **What files does it call?** `googleapis` SDK.
5. **Key Exports:** `GoogleSheetsClaimLogger`.
6. **Critical Functions:**
   - `initialize()`: Decodes base64 `GOOGLE_CREDENTIALS_JSON` and authenticates OAuth2 client.
   - `log(record)`: Maps `Claim` payload into row array and calls `sheets.spreadsheets.values.append`.
7. **Important Interfaces:** `ClaimLoggerService`.
8. **State Changes:** Appends new row to remote Google Spreadsheet.
9. **Common Interview Questions:** *"How do you securely pass Google Service Account credentials in production?"*
10. **Typical Modifications:** Adding new column headers to `HEADER_ROW` array.
11. **Production Improvements:** Batch row appends using a buffer queue to prevent API rate limits.
12. **Related Architecture Diagram:** Page 1 (System Context) & Page 2 (Component Architecture).
13. **Related Handbook Chapters:** Chapter 07, Chapter 09.
14. **Common Mistakes:** Storing raw JSON key files in git instead of base64 environment variables.

---

<h2 id="notificationservice-ts">8. 📄 src/services/notificationService.ts</h2>

1. **Purpose:** Resend transactional email notification service.
2. **Execution Order:** Triggered upon claim completion or emergency medical escalation.
3. **Who calls this file?** `src/services/claimLogger.ts` (`NotificationClaimLogger`).
4. **What files does it call?** `resend` SDK.
5. **Key Exports:** `createNotificationService()`, `ResendNotificationService`.
6. **Critical Functions:** `sendClaimNotification(record)`: Formats HTML email template and calls Resend API.
7. **Important Interfaces:** `NotificationService`.
8. **State Changes:** Sends external email to `NOTIFICATION_EMAIL_TO`.
9. **Common Interview Questions:** *"How do you prevent email API failures from crashing the server?"*
10. **Typical Modifications:** Customizing the HTML claim summary email template.
11. **Production Improvements:** Move email dispatch to a dedicated background queue worker (BullMQ).
12. **Related Architecture Diagram:** Page 1 (System Context) & Page 2 (Component Architecture).
13. **Related Handbook Chapters:** Chapter 07, Chapter 09.
14. **Common Mistakes:** Calling Resend synchronously during the WebSocket audio turn.

---

<h2 id="runtime-ts">9. 📄 src/runtime.ts</h2>

1. **Purpose:** Central Dependency Injection (DI) factory and service wireup container.
2. **Execution Order:** Executed once at application startup inside `server.ts`.
3. **Who calls this file?** `src/server.ts`.
4. **What files does it call?** Instantiates all services in `src/services/*`, `src/llm/*`, `src/storage/*`.
5. **Key Exports:** `createRuntime()`, `RuntimeDependencies`.
6. **Critical Functions:** `createRuntime()`: Reads environment variables and constructs service graph.
7. **Important Interfaces:** `RuntimeDependencies`.
8. **State Changes:** Instantiates singleton service instances.
9. **Common Interview Questions:** *"What is the benefit of Dependency Injection in this project?"*
10. **Typical Modifications:** Swapping LLM providers (e.g. replacing Gemini with OpenAI client).
11. **Production Improvements:** Use a formal IoC container like InversifyJS or NestJS DI module.
12. **Related Architecture Diagram:** Page 2 (Component Architecture).
13. **Related Handbook Chapters:** Chapter 05, Chapter 06.
14. **Common Mistakes:** Thinking `runtime.ts` handles runtime request execution (it only wires dependencies at boot).

---

<h2 id="conversationstate-ts">10. 📄 src/types/ConversationState.ts</h2>

1. **Purpose:** Primary data contract defining in-memory state and FSM step types.
2. **Execution Order:** Type-checked at compile time.
3. **Who calls this file?** Imported by `ConversationManager.ts`, `extractClaimData.ts`, `actions.ts`.
4. **What files does it call?** `src/types/Claim.ts`, `src/types/Policy.ts`.
5. **Key Exports:** Interface `ConversationState`, type `ConversationStep`.
6. **Critical Interfaces:**
   ```typescript
   export interface ConversationState {
     currentConversationStep: ConversationStep;
     claimData: Partial<Claim>;
     verifiedPolicy: Policy | null;
     pendingClarifications: string[];
     verificationAttempts: number;
   }
   ```
7. **State Changes:** Defines the structure mutated by `ConversationManager`.
8. **Common Interview Questions:** *"What fields are required in the state object?"*
9. **Typical Modifications:** Adding new FSM step names to `ConversationStep` union type.
10. **Production Improvements:** Add Zod schema validation to validate state hydration from Redis.
11. **Related Architecture Diagram:** Page 4 (FSM Diagram).
12. **Related Handbook Chapters:** Chapter 02, Chapter 06.
13. **Common Mistakes:** Confusing `ConversationState` (FSM session meta) with `Claim` (extracted business payload).

---

<h2 id="types-ts">11. 📄 src/types/actions.ts / types.ts</h2>

1. **Purpose:** Global domain interfaces for `Claim`, `Policy`, and service contracts.
2. **Execution Order:** Type-checked at compile time.
3. **Who calls this file?** Imported throughout `src/**/*`.
4. **What files does it call?** None (Pure type definitions).
5. **Key Exports:** Interfaces `Claim`, `Policy`, `TrackableFnolField`.
6. **Critical Interfaces:**
   - `Claim`: Ingested insurance record (Vehicles, Location, Injuries, Police Report).
   - `Policy`: Verified policy entitlement schema.
7. **State Changes:** None.
8. **Common Interview Questions:** *"How do you ensure TypeScript type safety across services?"*
9. **Typical Modifications:** Adding new fields to `Claim` interface (e.g. `weatherConditions`).
10. **Production Improvements:** Export OpenAPI / JSON Schema definitions generated automatically from TS types.
11. **Related Architecture Diagram:** Page 2 & Page 4.
12. **Related Handbook Chapters:** Chapter 02, Chapter 09.
13. **Common Mistakes:** Treating `types.ts` as executable code (types are erased at runtime by `tsc`).

---

> [!RECAP]
> 1. `ConversationManager.ts` is the central brain; it owns the FSM and evaluates rules.
> 2. `server.ts` handles network transport (`ws` + Express) without touching business logic.
> 3. `extractClaimData.ts` builds dynamic FSM prompts and calls Gemini Flash Lite via native SSE.
> 4. `claimLogger.ts` implements resilient outbox dual-writing via `Promise.allSettled`.
> 5. `runtime.ts` uses Dependency Injection to decouple concrete services for offline unit testing.
