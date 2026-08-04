# 03. System Architecture (The Diagrams)

## 1. Business Motivation
**Why does this exist?**  
An architecture diagram is a contract. It proves to the business that you have thought about failure domains, data sovereignty, scalability, and latency. The FNOL agent handles PII (Personally Identifiable Information) and requires strict latency bounds for a natural conversational flow. The architecture must reflect these constraints.

## 2. Software Engineering Concept
**The C4 Model (Context, Containers, Components, Code).**  
You must explain your architecture top-down. Start with the "System Context" (who uses it), zoom into the "Containers" (the deployable units), and then zoom into the "Components" (the internal modules). 

## 3. Repository Implementation
This repository implements a **Hybrid Orchestration Pattern**.
- **Transport Layer:** WebSocket (WS) / HTTP (Express).
- **Orchestration Layer:** Finite State Machine (`ConversationManager.ts`).
- **Extraction Layer:** LLM API (Gemini `extractClaimData.ts`).
- **Persistence Layer:** Dual-write local JSON & external API (`googleSheets.ts`).

## 4. Line-by-Line Walkthrough: The 4-Page Deck

You generated a 4-page PDF (`Architecture.pdf`). Here is exactly how to explain each page.

### Page 1: System Context & Container Diagram
*(What the interviewer sees: A user talking to Retell, Retell talking to your Railway Server, your Server talking to Gemini/Sheets).*

**The Explanation:**
*"This is the macro view. The user dials in via phone or browser. All audio processing (STT/TTS) is offloaded to Retell AI. Retell opens a persistent WebSocket connection to our Node.js server hosted on Railway. Our server acts as the central brain. It receives transcripts, coordinates with Gemini 2.5 Flash for data extraction, enforces business logic, and persists data to Google Sheets."*

### Page 2: Component Architecture (The Internals)
*(What the interviewer sees: The inside of your Node.js server).*

**The Explanation:**
*"Zooming into the Node server, we have a clear separation of concerns. The `server.ts` handles the WebSocket transport. The `ConversationManager` is the orchestrator. For every conversational turn, the manager calls the `ExtractClaimDataService`, which wraps the Gemini API. Once extraction is done, the manager calls pure deterministic services like `verifyPolicy` or `claimLogger`. Dependency Injection (`runtime.ts`) wires this all together."*

### Page 3: Sequence / Runtime Flow
*(What the interviewer sees: A timeline of a single message turn).*

**The Explanation:**
*"This is the critical path for latency. When the user speaks, Retell streams the transcript chunk over WebSockets. Our server injects the current state and FSM instructions into the Gemini prompt. We use Gemini 2.5 Flash Lite because it offers sub-second Time-To-First-Token (TTFT) via Server-Sent Events (SSE). The JSON is parsed, business rules evaluate it, and we send the `response_id` back to Retell to speak the response. Concurrently, in a non-blocking background promise, we flush the state to our logging services."*

### Page 4: Finite State Machine (FSM)
*(What the interviewer sees: The states from Greeting -> Verified -> Complete).*

**The Explanation:**
*"This is the guardrail against LLM hallucinations. The conversation must follow this directed graph. We start in `safety_check`. Once safe, we move to `verification`. Only when verified do we move to `collecting_details`. If the user tries to report a claim without verifying their policy, the FSM blocks them. The LLM is forced to operate within the bounds of the current FSM state."*

## 5. Production Reasoning
**Why would a company build it this way?**  
- **Offloading STT/TTS:** Building custom speech pipelines is a nightmare of latency and WebRTC debugging. Offloading to Retell allows the team to focus purely on the insurance business logic.
- **WebSocket over REST:** Real-time conversational AI requires persistent bidirectional streaming. REST polling introduces unacceptable latency.
- **Dependency Injection:** Allows mocking Gemini and Retell during unit tests.

## 6. Alternatives
**Alternative 1: OpenAI Realtime API**
- **Why we didn't use it:** It's a black box. You stream audio in and get audio out. You lose the ability to inject strict intermediate FSM logic and structured data extraction mid-stream.
**Alternative 2: Serverless Functions (AWS Lambda)**
- **Why we didn't use it:** WebSockets require persistent connections. Serverless functions are stateless and timeout, making them fundamentally incompatible with long-lived WebSocket voice sessions.

## 7. Tradeoffs
- **Pros:** Highly modular, testable, and strictly enforces business rules.
- **Cons:** Railway container is a single point of failure. In-memory `ConversationState` means if the Railway container restarts, active calls are dropped.

## 8. Interview Explanation
*"I designed this architecture to prioritize two things: conversational latency and deterministic compliance. By pairing a high-speed WebSocket transport with an in-memory FSM and a lightweight extraction LLM, we achieve both."*

## 9. Likely Interviewer Questions
1. **"What happens if your Node server crashes while a user is on the phone?"**
2. **"Why use Gemini 2.5 Flash Lite instead of GPT-4o?"**

## 10. Model Answers
1. *"Currently, state is held in memory, so the call would drop. In a true production environment, I would externalize the `ConversationState` to a low-latency Redis cluster. The WebSocket would reconnect to a healthy pod, hydrate the state from Redis, and continue the conversation."*
2. *"Voice AI is hyper-sensitive to latency. Anything over 1000ms feels unnatural. Gemini 2.5 Flash Lite is optimized specifically for high-speed, low-latency reasoning. GPT-4o is too slow and too expensive for basic structured data extraction."*

## 11. Common Mistakes Candidates Make
- **Drawing diagrams during the interview without explaining the *Why*.**
- **Ignoring the in-memory state flaw.** Senior engineers point out their own architecture's flaws before the interviewer does. Own the Redis limitation proudly.
