# 11. Production Engineering (Scale & Safety)

## 1. Business Motivation
**Why does this exist?**  
A prototype proves the concept works for one person. Production engineering proves it works for 10,000 people simultaneously during a hurricane. Interviewers at Google/Stripe are explicitly looking for your ability to identify the bottlenecks that break at scale, and how you would redesign the system to fix them.

## 2. Software Engineering Concept
**Statelessness, Idempotency, and Observability.**
- **Statelessness:** No individual server pod should hold data in its memory that another pod cannot access.
- **Idempotency:** If the Google Sheets API is called twice with the same data by accident, it should only create one row, not two.
- **Observability:** You need metrics, traces, and logs to figure out *why* a call dropped. 

## 3. Repository Implementation
This repository is currently a **Prototype**. It violates statelessness. You must be able to point this out and explain the fix.

## 4. The Scaling Bottlenecks (Line-by-Line)

### The In-Memory Trap
In `ConversationManager.ts`:
```typescript
private sessions = new Map<string, ConversationState>();
```
**Why it fails in production:**  
If a user calls, Railway routes them to `Pod A`. `Pod A` creates `call_123` in its `sessions` Map. If `Pod A` crashes, or if the load balancer routes the next WebSocket chunk to `Pod B`, `Pod B` will look in its map, find nothing, and the call will crash.
**The Fix:**  
Move `sessions` to Redis.
```typescript
// Proposed Production Fix
const state = await redis.get(`call_${callId}`);
```

### The Read-Modify-Write Race Condition
In `ConversationManager.ts` (`handleTurn`):
```typescript
// 1. Read
const state = this.sessions.get(callId);
// ... wait for LLM (400ms) ...
// 2. Modify & Write
state.claimData = { ...state.claimData, ...extractedData };
```
**Why it fails in production:**  
If the user speaks twice rapidly, Turn 1 reads the state. Turn 2 reads the *same* state. Turn 1 writes the state. Turn 2 writes the state and overwrites Turn 1's data.
**The Fix:**  
Distributed locks (Redis Redlock) or an Actor model where all messages for a `callId` are placed in a strict FIFO queue.

### The Missing Observability
**Why it fails in production:**  
If a user hangs up, you don't know why. Was the LLM too slow? Did Google Sheets time out?
**The Fix:**  
Implement OpenTelemetry. Every WebSocket turn must generate a distributed trace capturing: STT latency -> LLM TTFT -> FSM processing time -> TTS latency. 

## 5. Production Reasoning
**Why would a company build it this way (as a prototype)?**  
Speed to market. Setting up Redis, Kafka, and OpenTelemetry takes weeks. A `Map` takes one line of code. You build the prototype to prove the AI can handle the insurance logic, and you rebuild it for production to handle the scale.

## 6. Alternatives
**Alternative: StatefulSets in Kubernetes**
- *Why we didn't use it:* You *could* configure a load balancer to use "Sticky Sessions" (always routing the same caller to the same pod). However, sticky sessions are an anti-pattern in modern cloud-native architectures because they break down during auto-scaling and deployments. Redis is better.

## 7. Tradeoffs
- **Pros (Current):** Extremely fast development. Zero external database dependencies.
- **Cons (Current):** Cannot be scaled beyond a single Node.js process. Vulnerable to race conditions.

## 8. Interview Explanation
*"While this codebase successfully implements the complex FSM and LLM orchestration, it was intentionally built as a prototype. The most critical architectural flaw is the in-memory `ConversationState` map. To take this to production, I would first externalize all state to a low-latency Redis cluster. I would then implement a Redis-backed lock around the `handleTurn` execution to prevent read-modify-write race conditions when a user interrupts the AI rapidly. Finally, I would replace the `MultiClaimLogger`'s local JSON file with an outbox table in Postgres or a Kafka topic to guarantee durable async persistence."*

## 9. Likely Interviewer Questions
1. **"You mentioned race conditions. How exactly would you implement the Redis lock?"**
2. **"If you move state to Redis, how much latency does that add to the voice turn?"**

## 10. Model Answers
1. *"I would use a locking algorithm like Redlock. At the start of `handleTurn`, I attempt to acquire a lock for `callId`. If another turn is currently processing for that caller, I queue the new transcript or reject it. Once the LLM and FSM finish, I write the state back to Redis and release the lock."*
2. *"A well-tuned Redis cluster in the same VPC as the Node.js server has sub-millisecond read/write latency. The network overhead is negligible (~2ms) compared to the 400ms TTFT of the LLM. It is absolutely worth it for horizontal scalability."*

## 11. Common Mistakes Candidates Make
- **Hiding the flaws.** Do not pretend your architecture is perfect. The interviewer *wants* you to criticize your own code. It proves you have Staff-level maturity.
