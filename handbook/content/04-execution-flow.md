# 04. Execution Flow Walkthrough

## 1. Business Motivation
**Why does this exist?**  
To debug a system or explain it to a senior engineer, you must know the exact path a piece of data takes from the user's mouth to the database. If a user says "My car was hit", how does that become a Google Sheet row? This flow proves the system actually works end-to-end.

## 2. Software Engineering Concept
**Event-Driven Pipeline & Async Operations.**  
The system operates as a pipeline of events. Audio -> Text -> JSON -> State Mutation -> Persistence. Crucially, the "Persistence" step happens *asynchronously* so it doesn't block the audio response.

## 3. Repository Implementation
This execution flow touches almost every major file in the `src/` directory.

### The Full Request Walkthrough (Line-by-Line)

#### Step 1: The Call Connects (WebSocket)
- **Location:** `src/server.ts`
- **Action:** Retell AI connects to `ws://your-server/chat`.
- **Code:** `ws.on('message', ...)` parses the incoming Retell Custom LLM event.
- **State:** A new `ConversationState` is instantiated in memory for this `callId`.

#### Step 2: The User Speaks (Transport)
- **Location:** `src/server.ts` -> `ConversationManager.handleTurn()`
- **Action:** Retell sends an `update` event containing the transcript (e.g., *"I got hit on I-95"*).
- **Execution:** The server passes the entire `transcript` array to the `ConversationManager`.

#### Step 3: LLM Extraction (The Brain)
- **Location:** `src/services/extractClaimData.ts`
- **Action:** The system builds a massive prompt containing:
  1. The static Base Rules.
  2. The dynamic FSM Instruction (e.g., *"Ask for the policy number"*).
  3. The JSON Schema.
  4. The transcript history.
- **Execution:** Gemini 2.5 Flash Lite is called. It returns a JSON object:
  ```json
  {
    "responseToUser": "Oh no, are you safe?",
    "extractedData": { "location": "I-95", "injuriesReported": null }
  }
  ```

#### Step 4: Business Rules Evaluation (The Enforcer)
- **Location:** `src/conversation/ConversationManager.ts`
- **Action:** The returned JSON is merged into the `ConversationState`.
- **Execution:** The manager runs deterministic checks:
  - If `policyNumber` exists but is unverified -> Call `verifyPolicy.ts`.
  - If `injuriesReported: true` -> Trigger `handleEscalation()`.
  - Check missing required fields against `src/config/requiredFields.ts`.

#### Step 5: Responding to the User (Real-time)
- **Location:** `src/server.ts`
- **Action:** The server immediately sends a `response` event back to Retell over the WebSocket.
- **Execution:** Retell generates TTS audio and speaks to the user.
- **Latency Check:** Steps 2 -> 5 must happen in under ~800ms.

#### Step 6: Async Persistence (Background)
- **Location:** `src/conversation/ConversationManager.ts`
- **Action:** The server must save the data, but saving to Google Sheets is slow (1-2 seconds).
- **Execution:** The code calls `this.persistClaimData()` without `await`. 
- **Implementation:** `src/services/claimLogger.ts` uses `Promise.allSettled` to write to a local JSON file (Outbox) AND Google Sheets simultaneously.

## 4. Production Reasoning
**Why would a company build it this way?**  
The separation of the real-time response (Step 5) from the persistence (Step 6). If Google Sheets goes down, the user on the phone should not hear dead silence. They must hear the response immediately. The data is saved locally and eventually synced.

## 5. Alternatives
**Synchronous Persistence:**
- *Why we didn't do it:* Awaiting the Google Sheets API before responding to Retell would add 1500ms of latency to the conversation. The AI would feel sluggish and robotic.

## 6. Tradeoffs
- **Pros:** Ultra-low latency voice responses.
- **Cons:** Risk of data loss. If the server crashes after Step 5 but before Step 6 finishes, the data for that turn is lost from the database (though Retell retains the transcript).

## 7. Interview Explanation
*"The critical design decision in my execution flow is the decoupling of the conversational loop from the persistence loop. When Retell sends a transcript, I aggressively prioritize getting the LLM response generated, validated by the FSM, and sent back over the WebSocket. Persistence to Google Sheets is fired asynchronously. This guarantees the conversational latency remains under 1 second, regardless of downstream database performance."*

## 8. Likely Interviewer Questions
1. **"What happens if the Google Sheets API rate limits you?"**
2. **"How do you handle race conditions if the user speaks again before the previous async persistence finishes?"**

## 9. Model Answers
1. *"The `MultiClaimLogger` uses `Promise.allSettled`. If Sheets fails, the local JSON file write still succeeds. In production, I would replace the local JSON file with a highly durable queue like Kafka or AWS SQS, and have a separate worker retry the Sheets API."*
2. *"Currently, the system is susceptible to a read-modify-write race condition because Node.js is single-threaded but handles async I/O concurrently. To fix this for scale, I would implement a Redis lock on the `callId` or use a strict actor model where each call processes sequentially."*

## 10. Common Mistakes Candidates Make
- **Not knowing exactly where the code lives.** (e.g., saying "I think the server handles it" instead of "The `server.ts` handles the WebSocket, but `extractClaimData.ts` handles the LLM").
- **Failing to mention the lack of `await` on the persistence call.** This is the most important Staff-level detail in this flow.
