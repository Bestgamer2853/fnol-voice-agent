# 05. Code Deep Dive (Crucial Lines)

> [!HOTSPOT]
> * **Probability:** 80% | **Est. Time:** 40m | **Difficulty:** Hard
> * **Likely Questions:**
>   - Walk me through the exact line of code that handles non-blocking persistence.
>   - How does `server.ts` co-locate Express HTTP and WebSockets?
>   - How does `MultiClaimLogger` implement the Outbox pattern with `Promise.allSettled`?

---

## 1. `src/server.ts` — Co-locating Express HTTP and Raw WebSockets

```typescript
// Lines 31-346
const app = express();

// Serve static frontend UI and Handbook SPA
app.use(express.static(publicDirectory));
app.use('/handbook', express.static(handbookDirectory));

// HTTP Server creation
const server = app.listen(port, () => {
  logInfo(`FNOL backend listening on port ${port}`);
});

// Mount raw WebSocket server on the SAME HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  // Every call gets its own isolated session
  const session = createSession();
  const sessionId = session.sessionId;
  logInfo(`Session created: ${sessionId}`);
});
```

* **What:** Binds standard Express HTTP REST routes and raw WebSocket connections to a single HTTP server listening on Port 3000.
* **Why:** Railway PaaS exposes a single port per container. Co-locating Express and raw `ws` ensures both static UI assets and Retell voice sockets function seamlessly on the same port.
* **Current vs. Production:**
  - 📌 **Current:** Single Node process running both HTTP and WS.
  - 🚀 **Production:** Place an ALB in front to terminate SSL and route `/chat` WS connections to a dedicated WebSocket cluster.

---

## 2. `src/conversation/ConversationManager.ts` — Non-Blocking Async Persistence

```typescript
// Inside handleUserMessage() turn execution loop
const result = await extractClaimData.extract({ transcript, state: currentState });

// Mutate state with extracted entities
currentState.claimData = { ...currentState.claimData, ...result.extractedData };

// Evaluate FSM business rules
this.evaluateFsmRules(currentState);

// NON-BLOCKING ASYNC PERSISTENCE TRIGGER (Notice NO 'await'!)
this.persistClaimData(sessionId).catch((err) => {
  logError(`Background persistence error for session ${sessionId}:`, err);
});

// Immediately return spoken dialogue string to Retell AI socket
return turnResult;
```

* **What:** Triggers `persistClaimData(sessionId)` as a background promise without using the `await` keyword.
* **Why:** Google Sheets and Resend API writes take 1-2 seconds. Omitting `await` returns the spoken response to Retell in <700ms, preserving real-time voice latency.
* **Current vs. Production:**
  - 📌 **Current:** Background promise running in-memory on the Node event loop.
  - 🚀 **Production:** Publish a `ClaimCompleted` event to Kafka; background workers handle DB ingestion asynchronously.

---

## 3. `src/services/extractClaimData.ts` — Dynamic FSM Instruction Generator

```typescript
// Dynamic FSM Instruction Generator
let fsmInstruction = "Respond naturally and acknowledge input.";

if (input.state.pendingClarifications.length > 0) {
  fsmInstruction = `Ask clarification for: ${input.state.pendingClarifications.join(', ')}`;
} else if (input.state.currentConversationStep === 'collecting_details') {
  const missing = calculateMissingFields(input.claim);
  if (missing.length > 0) {
    fsmInstruction = `Steer conversation to collect: ${missing[0]}. Extract ALL fields mentioned.`;
  }
}
```

* **What:** Calculates the single next field the AI should ask for based on missing required fields.
* **Why:** Prevents the LLM from hallucinating conversational direction. The FSM strictly dictates the next question; the LLM merely phrases it naturally.

---

## 4. `src/services/claimLogger.ts` — Resilient Outbox Logging

```typescript
export class MultiClaimLogger implements ClaimLoggerService {
  constructor(private loggers: ClaimLoggerService[]) {}

  async log(record: ClaimLogRecord): Promise<void> {
    // Fire all loggers in parallel
    const results = await Promise.allSettled(
      this.loggers.map((logger) => logger.log(record))
    );

    results.forEach((res, i) => {
      if (res.status === 'rejected') {
        console.error(`Logger ${i} (${this.loggers[i].constructor.name}) failed:`, res.reason);
      }
    });
  }
}
```

* **What:** Uses `Promise.allSettled` to write to local disk (`/data/claims.json`) and remote Google Sheets in parallel.
* **Why:** If Google Sheets API returns a 429 rate limit or 500 error, `Promise.allSettled` ensures local disk write still succeeds, preventing data loss.

---

> [!RECAP]
> 1. `server.ts` co-locates Express and raw `ws` on Port 3000 to satisfy Railway PaaS single-port constraints.
> 2. `persistClaimData()` is fired without `await` to prevent slow 1.5s DB writes from ruining voice latency.
> 3. Dynamic FSM instructions inject targeted directions into the LLM prompt per turn.
> 4. `MultiClaimLogger` uses `Promise.allSettled` to implement a resilient outbox pattern across multiple storage destinations.
> 5. Dependency Injection in `runtime.ts` wires components together, allowing complete offline unit testing.
