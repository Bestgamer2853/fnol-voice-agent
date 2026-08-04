# 12. Repository Explorer

## 1. Business Motivation
**Why does this exist?**  
An interviewer will open your GitHub repository and randomly click a file. If you pause, stutter, or say "I don't remember what that does", you fail the owner test. You must know exactly where every feature lives and why that specific folder structure was chosen.

## 2. Software Engineering Concept
**Project Scaffolding and Separation of Concerns.**  
Folders are not just buckets for files. They are architectural boundaries. 
- `src/config/`: Static data and environment parsing.
- `src/conversation/`: The state machine and domain logic.
- `src/llm/`: External AI provider adapters.
- `src/services/`: Pure business logic functions.
- `src/storage/`: Database/External API adapters.
- `src/transport/`: How data enters the system (HTTP/WS).

---

## 3. Exhaustive Folder & File Walkthrough

### 📂 `src/` (The Application Root)

#### 📄 `src/server.ts`
- **Purpose:** The entry point. Initializes Express and the WebSocket server.
- **Dependencies:** `express`, `ws`, `runtime.ts`, `ConversationManager`.
- **Execution Flow:** Receives WebSocket upgrade -> Instantiates `callId` -> Listens for Retell messages -> Passes to `ConversationManager` -> Sends responses back.
- **Why it exists:** To bridge the public internet (Retell) to our internal Brain.

#### 📄 `src/runtime.ts`
- **Purpose:** Dependency Injection wiring.
- **Dependencies:** All services in `src/services/*` and `src/llm/*`.
- **Exports:** An initialized instance of `ConversationManager`.
- **Why it exists:** To make the application testable. Instead of hardcoding Gemini inside the manager, `runtime.ts` creates the Gemini client and injects it.

---

### 📂 `src/conversation/` (The Brain)

#### 📄 `ConversationManager.ts`
- **Purpose:** The FSM Orchestrator. 
- **Consumers:** `server.ts`
- **Execution Flow:** `handleConnection` -> `handleTurn` -> `extractClaimData` -> `verifyPolicy` -> `persistClaimData`.
- **Interview Explanation:** "This is the deterministic state machine that prevents the LLM from hallucinating business logic."

#### 📄 `actions.ts` & `types.ts`
- **Purpose:** Defines the TypeScript interfaces for the `ConversationState` and valid FSM steps.
- **Why it exists:** TypeScript requires explicit typing for strict null checks and compilation safety.

---

### 📂 `src/services/` (Domain Logic)

#### 📄 `extractClaimData.ts`
- **Purpose:** The bridge between the FSM and the LLM. 
- **Execution Flow:** Receives FSM state -> Builds Prompt -> Calls LLM API -> Parses JSON -> Extracts fallback regex if JSON fails -> Returns `extractedData` and `responseToUser`.
- **Dependencies:** Uses `gemini.ts` interface.

#### 📄 `verifyPolicy.ts`
- **Purpose:** Deterministic policy lookup.
- **Execution Flow:** Takes a `policyNumber` string, checks it against `policies.json`.
- **Why it exists:** The LLM cannot be trusted to verify policies. This is hardcoded business logic.

#### 📄 `recommendServices.ts`
- **Purpose:** Looks at the extracted data (e.g., `vehicleDrivable: false`) and returns recommendations (e.g., `"Need a tow truck?"`).

#### 📄 `claimLogger.ts`
- **Purpose:** The Outbox pattern implementation. 
- **Exports:** `MultiClaimLogger`, `LocalFileLogger`.
- **Execution Flow:** Takes a completed claim -> fires `Promise.allSettled` -> writes to `.json` on disk -> writes to Google Sheets.

#### 📄 `notificationService.ts`
- **Purpose:** Email alerting.
- **Execution Flow:** Uses the Resend SDK to email the claim summary to the stakeholders.

---

### 📂 `src/llm/` (AI Adapters)

#### 📄 `provider.ts`
- **Purpose:** Defines the `LLMProvider` interface.

#### 📄 `gemini.ts`
- **Purpose:** Implements `LLMProvider` using `@google/genai`.
- **Execution Flow:** Sets up SSE (Server-Sent Events) streaming, connects to `gemini-2.5-flash-lite`, and enforces `responseJsonSchema`.
- **Why it exists:** It abstracts the messy Google API away from our clean business logic.

#### 📄 `groq.ts` & `fallback.ts`
- **Purpose:** (Optional) Fallback providers in case Gemini goes down.

---

### 📂 `src/config/` (Static Data)

#### 📄 `policies.json`
- **Purpose:** A mock database of valid insurance policies. (e.g., John Doe, Policy #12345).

#### 📄 `requiredFields.ts`
- **Purpose:** The absolute source of truth for when a claim is "done". Lists all fields (Date, Location, etc.) that the LLM must extract before the FSM transitions to `completed`.

#### 📄 `constants.ts`
- **Purpose:** Global environment variable parsing (`PORT`, API Keys).

---

### 📂 `src/storage/` (External Integrations)

#### 📄 `googleSheets.ts`
- **Purpose:** Appends rows to a Google Spreadsheet.
- **Dependencies:** `googleapis`. Uses `GOOGLE_CREDENTIALS_JSON`.

---

### 📂 `docs/` & `scripts/` (Meta)

#### 📄 `docs/`
- **Purpose:** Contains all original markdown requirements, audit reports, and architecture diagrams.

#### 📄 `scripts/generate-architecture-artifacts.py`
- **Purpose:** The script I ran to generate the pixel-perfect `Architecture.pdf` and `Architecture.png`.

---

## 4. Likely Interviewer Questions
1. **"Why did you put `extractClaimData.ts` in `services` instead of `llm`?"**
2. **"Where exactly is the code that decides the user is finished reporting their claim?"**

## 5. Model Answers
1. *"The `llm` folder contains pure network adapters (Gemini SDK wrappers) that know nothing about insurance. The `extractClaimData.ts` file lives in `services` because it contains deep insurance domain knowledge—it builds the dynamic FSM prompt and handles the fallback regex parsing."*
2. *"That logic lives in `src/conversation/ConversationManager.ts`. Specifically, there is a check that compares the current `state.claimData` against the `src/config/requiredFields.ts` contract. If the missing fields array is empty, the FSM transitions to the `completed` state."*
