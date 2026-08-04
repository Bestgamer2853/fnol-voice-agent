# 06. Runtime & Orchestration (The FSM)

## 1. Business Motivation
**Why does this exist?**  
The business requires a Voice AI that does not go off-script. If an insurance agent is supposed to verify a caller's identity before discussing a policy, the AI must do the exact same thing. The FSM (Finite State Machine) exists to physically restrict the LLM from hallucinating unauthorized actions. 

## 2. Software Engineering Concept
**Dependency Injection (DI) and Finite State Machines (FSM).**
- **Dependency Injection:** Instead of hardcoding `Gemini API` inside the `ConversationManager`, we pass it in as an interface (`ExtractClaimDataService`). This makes the manager testable.
- **Finite State Machine:** A design pattern where a system can only exist in exactly one predefined state at a time. Transitions between states are strictly governed by rules.

## 3. Repository Implementation
- **File:** `src/runtime.ts` (Handles Dependency Injection).
- **File:** `src/conversation/ConversationManager.ts` (The orchestrator).
- **File:** `src/types/ConversationState.ts` (Defines the FSM states).

The valid FSM states are:
`safety_check` -> `verification` -> `collecting_details` -> `clarifying` -> `recommending_services` -> `escalation` -> `callback_offer` -> `completed`.

## 4. Line-by-Line Walkthrough: The Turn Orchestrator

The most important method in the entire codebase is `handleTurn` inside `ConversationManager.ts`.

```typescript
// Inside ConversationManager.ts

async handleTurn(callId: string, transcript: any[]) {
    // 1. Fetch current in-memory state
    const state = this.sessions.get(callId);

    // 2. Call the LLM to extract data based on the transcript + current state
    const extractionResult = await this.deps.extractClaimData.extract({
        transcript,
        state, 
        claim: state.claimData 
    });

    // 3. Merge newly extracted data into our state
    state.claimData = { ...state.claimData, ...extractionResult.extractedData };

    // 4. Verify Policy (if we have a policy number but aren't verified)
    if (!state.verifiedPolicy && state.claimData.policyNumber) {
        const policyResult = await this.deps.verifyPolicy(state.claimData.policyNumber);
        if (policyResult) {
            state.verifiedPolicy = policyResult;
            state.currentConversationStep = 'collecting_details'; // Transition FSM
        }
    }

    // 5. Fire background persistence (Non-blocking!)
    this.persistClaimData(callId).catch(console.error);

    // 6. Return what the AI should say out loud
    return extractionResult.responseToUser;
}
```

**Why was it written this way?**  
It enforces a strict separation of concerns. The LLM (`extractClaimData`) is *only* allowed to extract facts and suggest dialogue. The `ConversationManager` is the supreme judge. It evaluates the facts, calls external APIs (like `verifyPolicy`), and officially transitions the FSM state.

## 5. Production Reasoning
**Why would a company build it this way?**  
Testability and Mocking. Because of Dependency Injection (via `runtime.ts`), a developer can write unit tests for `ConversationManager` without actually hitting the Gemini API. You just pass in a mock `ExtractClaimDataService` that always returns a fake JSON object, and you can test if the FSM correctly transitions to `escalation` when `injuriesReported: true`.

## 6. Alternatives
**Alternative: LLM Function Calling (Tool Use)**
- *Why we didn't use it:* We could have given Gemini a tool called `verify_policy()` and let the LLM decide when to call it. However, LLMs are known to skip tool calls or hallucinate parameters. By enforcing `verifyPolicy` via deterministic TypeScript rules on *every turn*, we remove the risk of the LLM "forgetting" to verify the policy.

## 7. Tradeoffs
- **Pros:** 100% predictable business logic. Highly testable.
- **Cons:** In-memory `this.sessions.get(callId)` map means the server cannot be scaled horizontally (multiple pods) without introducing sticky sessions or moving the map to Redis.

## 8. Interview Explanation
*"For runtime orchestration, I implemented a deterministic State Machine using Dependency Injection. `runtime.ts` wires up all the API clients and injects them into the `ConversationManager`. During a turn, the manager calls the LLM extraction interface, merges the extracted JSON into the state, and then runs a gauntlet of deterministic rules (like policy verification and medical escalation). This ensures that the LLM never drives the business logic; it merely feeds data into my state machine."*

## 9. Likely Interviewer Questions
1. **"I notice `this.sessions` is an in-memory Map. What happens if Railway scales this app to 3 instances?"**
2. **"How do you test the FSM logic without incurring LLM costs?"**

## 10. Model Answers
1. *"The in-memory Map breaks if scaled horizontally, because Call A might connect to Pod 1, but the next WebSocket message routes to Pod 2, which has no memory of Call A. To fix this for production, I would replace `this.sessions` with a Redis cache, ensuring any pod can hydrate the state."*
2. *"Dependency Injection. I inject a mocked `extractClaimData` service that returns static JSON. This allows me to write hundreds of unit tests asserting that the FSM transitions perfectly, without ever making a network call to Gemini."*

## 11. Common Mistakes Candidates Make
- **Misunderstanding Dependency Injection:** Saying "I use runtime.ts to import files" instead of "I use runtime.ts to decouple concrete implementations from the orchestration logic."
- **Failing the Horizontal Scaling Question:** You MUST know that in-memory maps prevent horizontal scaling. It is the #1 system design gotcha.
