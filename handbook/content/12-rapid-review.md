# 12. Rapid Review (Night Before)

> [!HOTSPOT]
> * **Probability:** 95% | **Est. Time:** 15m | **Difficulty:** Easy
> * **Likely Questions:**
>   - What are the top 5 mental anchors to memorize before walking into the interview?

---

## 🧠 The 5 Mental Anchors (Repeat these before sleeping)

### 1. The Core Value Anchor
> *"I built a real-time FNOL Voice AI that cuts claim handle time from 15 minutes to 3 minutes while maintaining 100% compliance using a hybrid State Machine."*

### 2. The Architecture Anchor
> *"Retell AI handles WebRTC telephony over WebSockets; Node.js manages the FSM; Gemini 2.5 Flash Lite does JSON extraction over SSE streams; MultiClaimLogger asynchronously dual-writes to Google Sheets and Resend."*

### 3. The Latency Anchor
> *"We maintain a <800ms glass-to-glass latency budget by selecting Gemini 2.5 Flash Lite (~350ms TTFT), using single-pass JSON extraction, and running persistence asynchronously without `await`."*

### 4. The Compliance Anchor
> *"The LLM never makes business decisions. It extracts JSON entities. The TypeScript FSM enforces policy verification and emergency medical escalations deterministically."*

### 5. The Scale Anchor
> *"This prototype uses an in-memory session Map. For production scale, I would externalize state to Redis, enforce Redlock mutexes per turn, and stream persistence events through Kafka."*

---

## ⚡ 10-Second Quick Fire Refresher

- **Port:** `3000` (Express HTTP + raw `ws` WebSocket on `/chat`)
- **Primary LLM:** `gemini-2.5-flash-lite` (via native SSE `@google/genai`)
- **Key Files:**
  - `src/server.ts` -> WebSockets
  - `src/conversation/ConversationManager.ts` -> FSM Engine
  - `src/services/extractClaimData.ts` -> Dynamic Prompts & Gemini
  - `src/services/claimLogger.ts` -> Async `Promise.allSettled`
- **FSM Steps:** `safety_check` -> `verification` -> `collecting_details` -> `recommending_services` -> `completed`
- **Safety Override:** `injuriesReported === true` triggers immediate `escalation`
- **Hosting:** Railway PaaS with injected env secrets

---

> [!RECAP]
> 1. You know why WebSockets were chosen over REST (real-time voice streaming).
> 2. You know why Gemini Flash Lite was chosen over GPT-4o (sub-350ms TTFT).
> 3. You know why `persistClaimData` does NOT use `await` (voice latency budget).
> 4. You know why state is kept in TypeScript instead of the LLM (compliance & hallucinations).
> 5. You are ready to point out the in-memory Redis flaw before the interviewer asks!

**You are 100% ready. Go crush the interview!** 🚀
