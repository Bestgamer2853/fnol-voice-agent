# 02. Repository Explorer & Comprehensive File Matrix

> [!HOTSPOT]
> * **Probability:** 95% | **Est. Time:** 40m | **Difficulty:** Hard
> * **Likely Questions:**
>   - How is the codebase structured into layers?
>   - Where does the entrypoint live and how are HTTP and WebSockets co-located?
>   - Which file owns the Finite State Machine (FSM) and why?
>   - How does Dependency Injection work in `runtime.ts`?

---

## 1. Top-Level Repository Directory Map

```
/fnol-voice-agent
├── src/                    # Primary source code directory
│   ├── config/             # Environment constants, policies DB, required fields schema
│   ├── conversation/       # Core FSM Engine & State Machine contracts
│   ├── llm/                # LLM API providers (Gemini, Groq, Fallback interface)
│   ├── services/           # Domain services (Extraction, Policy Verification, Logging)
│   ├── storage/            # External database & storage adapters (Google Sheets)
│   ├── transport/          # Inbound network adapters (Browser WebSocket)
│   ├── types/              # Global TypeScript interfaces & contract definitions
│   ├── runtime.ts          # Dependency Injection (DI) Container
│   └── server.ts           # Express HTTP + WS Entry Point
├── public/                 # Static HTML/JS frontend demo UI
├── handbook/               # SPA Staff Engineer Handbook & Study Guide
├── scripts/                # Python diagram generators & maintenance utilities
├── tests/                  # Automated test suites & test conversation runners
└── docs/                   # Original PRD, architecture reviews, and forensic audits
```

---

## 2. Comprehensive Architectural File Matrix

To understand the repository instantly, the codebase is grouped into **6 Architectural Layers**. Every file has a clear responsibility, execution trigger, and failure blast radius.

### 🌐 Layer 1: Transport & Network Gateway
*Manages external connections, WebSockets, HTTP routes, and real-time SSE stream parsing.*

| File Path | Role & Responsibility | Execution Trigger | Key Calls / Inputs | Blast Radius if Broken |
| :--- | :--- | :--- | :--- | :--- |
| **[`src/server.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/server.ts)** | **Network Entrypoint & Transport.** Hosts Express HTTP REST API and raw `ws` WebSocket server on Port 3000. Serves static UI, handles Retell WebSocket frames (`response_required`), parses SSE streams, and sends audio responses. | Continuous process boot (`npm start`) + Inbound WebSocket frames | Injects `runtime.ts`, invokes `ConversationManager` | 🚨 **Total Outage:** App cannot boot; WebSockets & HTTP endpoints fail. |

---

### ⚙️ Layer 2: Composition & Dependency Injection
*Wires all services, adapters, and loggers together for clean dependency injection and testability.*

| File Path | Role & Responsibility | Execution Trigger | Key Calls / Inputs | Blast Radius if Broken |
| :--- | :--- | :--- | :--- | :--- |
| **[`src/runtime.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/runtime.ts)** | **Composition Root (DI Container).** Instantiates all concrete implementations (Gemini, Groq, Sheets, Resend, Loggers) and wires them into `ConversationManagerDependencies`. | Executed once at server boot in `server.ts` | Imports LLMs, Storage, and Services | 🚨 **Total Boot Failure:** Dependency resolution breaks; server cannot initialize. |

---

### 🧠 Layer 3: FSM State Machine & Orchestration
*The central brain of the agent. Enforces insurance business rules, tracks state, and manages turn progression.*

| File Path | Role & Responsibility | Execution Trigger | Key Calls / Inputs | Blast Radius if Broken |
| :--- | :--- | :--- | :--- | :--- |
| **[`src/conversation/ConversationManager.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/conversation/ConversationManager.ts)** | **FSM Brain & Orchestrator.** Manages conversation state, invokes extraction, runs policy verification, evaluates escalation, checks completion, and triggers outbox logging. | Invoked on every user turn (`handleUserMessage`) | `extractClaimData.ts`, `verifyPolicy.ts`, `claimLogger.ts` | 🚨 **System Brain Death:** Turns stall; agent cannot progress state or complete claims. |
| **[`src/conversation/ConversationState.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/conversation/ConversationState.ts)** | **State Contract.** Defines the `ConversationState` interface tracking claim data, collected/missing fields, retries, and severity. | Referenced across state transitions | `Claim.ts`, `Policy.ts`, `types.ts` | ⚠️ **Compile Error:** TypeScript state contracts break across the system. |
| **[`src/conversation/actions.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/conversation/actions.ts)** | **Action Contracts.** Defines standard turn actions (`respond`, `escalate`, `offer_callback`, `complete`). | Returned by `ConversationManager` | `Claim.ts` | ⚠️ **Action Mismatch:** WebSocket cannot format proper response payload. |

---

### 🤖 Layer 4: Intelligence & Entity Extraction
*Handles LLM integration, prompt engineering, streaming JSON parsing, and multi-provider fallback.*

| File Path | Role & Responsibility | Execution Trigger | Key Calls / Inputs | Blast Radius if Broken |
| :--- | :--- | :--- | :--- | :--- |
| **[`src/services/extractClaimData.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/services/extractClaimData.ts)** | **Dynamic Prompt & Extraction Engine.** Constructs dynamic prompts per turn, invokes LLM provider, and executes fallback regex slot extraction. | Invoked by `ConversationManager.ts` per turn | `llmProvider` (`gemini.ts`), `requiredFields.ts` | 🚨 **Extraction Failure:** Agent cannot extract claim fields from user text. |
| **[`src/llm/gemini.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/llm/gemini.ts)** | **Primary LLM Provider.** Connects to Google Gemini API over native SSE streaming (`streamGenerateContent`) with backoff retry. | Called by `extractClaimData.ts` | Gemini REST API (`gemini-2.5-flash-lite`) | ⚠️ **LLM Failover Triggered:** Retries 1x then falls back to Groq provider. |
| **[`src/llm/groq.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/llm/groq.ts)** | **Secondary LLM Provider.** Connects to Groq OpenAI-compatible API (Llama 3.3 70B) for zero-downtime failover. | Called when Gemini provider fails | Groq API | ℹ️ **Graceful Degradation:** Falls back to offline system message if both fail. |
| **[`src/llm/fallback.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/llm/fallback.ts)** | **Fallback Chain Provider.** Wraps multiple `LlmProvider` instances and tries them sequentially. | Wraps Gemini & Groq in `runtime.ts` | Array of `LlmProvider` | ⚠️ **Resilience Failure:** Single provider outage crashes extraction. |

---

### 🛡️ Layer 5: Business Rules & Domain Services
*Enforces policy verification, medical escalations, field completeness contracts, and service recommendations.*

| File Path | Role & Responsibility | Execution Trigger | Key Calls / Inputs | Blast Radius if Broken |
| :--- | :--- | :--- | :--- | :--- |
| **[`src/services/verifyPolicy.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/services/verifyPolicy.ts)** | **Policy Verification Engine.** Performs normalization, exact lookup, Levenshtein distance fallback (≤ 2), and Jaro-Winkler name fuzzy match (> 0.85). | Called when policyNumber + callerName are extracted | `src/config/policies.json` | 🚨 **Verification Block:** Valid callers rejected; claim filing blocked. |
| **[`src/services/recommendServices.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/services/recommendServices.ts)** | **Recommendation Engine.** Evaluates deterministic rules (towing, roadside, adjuster callback, repair garage). | Called when all 11 required fields are collected | `Claim.ts`, `Policy.ts` | ℹ️ **Service Skip:** Service recommendations skipped; claim completes directly. |
| **[`src/services/generateSummary.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/services/generateSummary.ts)** | **Summary Generator.** Constructs a structured, deterministic summary string of the completed claim. | Called during `completeClaim()` | `Claim.ts`, `Policy.ts`, `ConversationState.ts` | ⚠️ **Empty Summary:** Claim logged with default description. |
| **[`src/config/requiredFields.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/config/requiredFields.ts)** | **Field Collection Contract.** Exports 11 mandatory base FNOL fields + 3 conditional fields (`injuryDetails`, etc.). | Imported by FSM & Extraction services | N/A | 🚨 **Contract Violation:** System forgets required fields; incomplete claims logged. |
| **[`src/config/policies.json`](file:///Users/deiveeganaryan/fnol-voice-agent/src/config/policies.json)** | **Dummy Policy Database.** JSON array of 5 pre-configured policies (Arjun Rao, Priya Nair, Vikram Shah, etc.). | Read by `verifyPolicy.ts` on boot | N/A | 🚨 **Verification Outage:** Policy lookup fails for all callers. |

---

### 💾 Layer 6: Persistence & Outbox Logging
*Handles asynchronous multi-destination logging (Local Disk JSON, Google Sheets API, Resend Email).*

| File Path | Role & Responsibility | Execution Trigger | Key Calls / Inputs | Blast Radius if Broken |
| :--- | :--- | :--- | :--- | :--- |
| **[`src/services/claimLogger.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/services/claimLogger.ts)** | **Outbox Persistence Engine.** `LocalJsonClaimLogger` uses Mutex for disk writes. `MultiClaimLogger` runs `Promise.allSettled` and writes to `data/outbox.json` on partial failure. | Triggered out-of-band on claim completion | `googleSheets.ts`, `notificationService.ts` | ⚠️ **Local Backup Active:** Failed writes saved to `outbox.json`; voice call unimpeded. |
| **[`src/storage/googleSheets.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/storage/googleSheets.ts)** | **Google Sheets Adapter.** Appends completed claim records as a 22-column row to Google Sheets via Google API v4. Auto-initializes headers. | Called inside `MultiClaimLogger` | Google Auth / Service Account | ℹ️ **Outbox Fallback:** 429 quota error caught; record saved to `outbox.json`. |
| **[`src/services/notificationService.ts`](file:///Users/deiveeganaryan/fnol-voice-agent/src/services/notificationService.ts)** | **Email Notification Service.** Dispatches HTML & plain-text claim confirmations via Resend REST API. Handles onboarding email fallback. | Called by `NotificationClaimLogger` wrapper | Resend API SDK | ℹ️ **Notification Skipped:** Email failure caught & logged; claim persistence unaffected. |

---

## 3. Visual Call Dependency Graph

```mermaid
graph TD
    subgraph Layer1["🌐 Layer 1: Transport"]
        Server["src/server.ts (HTTP + WS)"]
    end

    subgraph Layer2["⚙️ Layer 2: Composition"]
        Runtime["src/runtime.ts (DI Container)"]
    end

    subgraph Layer3["🧠 Layer 3: FSM Brain"]
        CM["ConversationManager.ts (State Engine)"]
    end

    subgraph Layer4["🤖 Layer 4: Intelligence"]
        Extract["extractClaimData.ts"]
        Gemini["src/llm/gemini.ts (SSE Stream)"]
        Groq["src/llm/groq.ts (Fallback)"]
    end

    subgraph Layer5["🛡️ Layer 5: Business Rules"]
        Verify["verifyPolicy.ts (Levenshtein + Jaro-Winkler)"]
        Recommend["recommendServices.ts"]
        Policies["policies.json"]
    end

    subgraph Layer6["💾 Layer 6: Persistence & Outbox"]
        MultiLogger["claimLogger.ts (MultiClaimLogger)"]
        LocalDisk["data/claims.json"]
        OutboxDisk["data/outbox.json (Local Backup)"]
        Sheets["googleSheets.ts (Sheets API)"]
        Resend["notificationService.ts (Resend Email)"]
    end

    Server --> Runtime
    Runtime -->|Injects Services| CM
    Retell[Retell WebSocket] -.->|response_required| Server
    Server -->|handleUserMessage| CM

    CM -->|1. Extract Slots| Extract
    Extract -->|2. Primary SSE| Gemini
    Gemini -.->|Failover| Groq

    CM -->|3. Verify Policy| Verify
    Verify -->|Read| Policies

    CM -->|4. Complete & Recommend| Recommend

    CM -.->|5. Non-Blocking Async Log| MultiLogger
    MultiLogger -->|6a. Mutex Write| LocalDisk
    MultiLogger -->|6b. API Append| Sheets
    MultiLogger -->|6c. Email Dispatch| Resend
    Sheets -.->|Failed Write (e.g. 429)| OutboxDisk
```

---

## 4. Current vs. Production Architecture Comparison

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 📌 CURRENT IMPLEMENTATION (PROTOTYPE)                                     │
├───────────────────────────────────────────────────────────────────────────┤
│ • State Storage: In-memory `sessions` Map inside Node process            │
│ • State Persistence: Ephemeral disk file (`/data/claims.json`)            │
│ • Outbox Handling: Local backup (`data/outbox.json`) on logger failure    │
│ • Deployment Target: Single Railway container instance                   │
│ • Concurrency Control: Sequential turn execution per WebSocket            │
└───────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│ 🚀 PRODUCTION-SCALE EVOLUTION                                             │
├───────────────────────────────────────────────────────────────────────────┤
│ • State Storage: Distributed Redis Cluster (`ioredis`)                    │
│ • Event Outbox: Apache Kafka / AWS SQS topic (`fnol.claims.completed`)   │
│ • Outbox Worker: Background BullMQ worker with automatic retry & backoff  │
│ • Deployment Target: Kubernetes (EKS) with ALB horizontal pod scaling    │
│ • Concurrency Control: Redlock distributed mutex keyed on `sessionId`     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

> [!RECAP]
> 1. **Layer 1 (Transport):** `server.ts` handles network transport (Express + WebSocket) without containing business logic.
> 2. **Layer 2 (Composition):** `runtime.ts` acts as the Dependency Injection container, wiring implementations together.
> 3. **Layer 3 (FSM Brain):** `ConversationManager.ts` is the central orchestrator owning in-memory state and enforcing FSM compliance.
> 4. **Layer 4 (Intelligence):** `extractClaimData.ts` assembles dynamic prompts per turn and calls Gemini Flash Lite via native SSE.
> 5. **Layer 5 (Business Rules):** `verifyPolicy.ts` enforces policy lookup via Levenshtein (≤2) and Jaro-Winkler (>0.85) matching.
> 6. **Layer 6 (Persistence):** `claimLogger.ts` runs out-of-band via `Promise.allSettled`, writing to local disk, Google Sheets, and Resend Email in parallel with local outbox file backing.
