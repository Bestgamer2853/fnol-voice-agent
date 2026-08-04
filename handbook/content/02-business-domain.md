# 02. The Business Domain: FNOL

## 1. Business Motivation
**Why does this exist?**  
FNOL stands for **First Notice of Loss**. It is the exact moment a policyholder reports an incident (car crash, theft, damage) to their insurance company. Historically, this involves calling a 1-800 number, waiting on hold for 30 minutes, and speaking to a stressed human agent who reads a rigid 20-question script. 

It is expensive for the company (high AHT - Average Handle Time) and infuriating for the customer. This project replaces that human with a low-latency, empathetic AI Voice Agent that instantly ingests unstructured panic into structured backend database fields.

## 2. Software Engineering Concept
**Domain-Driven Design (DDD).**  
You must model the software around the business rules. In FNOL, there are absolute hard rules:
- **Safety First:** If a caller is injured, the flow MUST escalate.
- **Verification:** An unverified caller CANNOT file a completed claim.
- **Data Completeness:** A claim is incomplete until all "Required Fields" (Date, Location, Incident Description, Vehicles, etc.) are gathered.

## 3. Repository Implementation
The business rules are codified in specific contracts within the repository.

**Files:**
- `src/config/requiredFields.ts`: Defines exactly what the AI must extract before a claim is considered "completed".
- `src/config/policies.json`: Simulates the system of record (Guidewire/DuckCreek) for policy verification.
- `src/conversation/ConversationManager.ts`: The enforcer of the business rules. It decides when to escalate and when the claim is done.
- `src/services/extractClaimData.ts`: Translates unstructured user speech into the structured `Claim` object.

## 4. Line-by-Line Walkthrough: The Business Enforcer
Let's look at how a business rule (Medical Escalation) is enforced in `ConversationManager.ts` (`handleEscalation`):

```typescript
// If the LLM detected injuries OR the user explicitly asked for a human
if (extractedData.injuriesReported === true || extractedData.needsEscalation === true) {
  // 1. Force the FSM into the escalation state
  state.currentConversationStep = 'escalation';
  
  // 2. Clear pending clarifications because safety overrides missing data
  state.pendingClarifications = [];
  
  // 3. Mark the claim as requiring urgent medical review
  state.claimData.status = 'escalated_medical';
}
```
**Why was it written this way?**  
The LLM is highly unpredictable. We cannot trust the LLM to decide the state of the conversation. The LLM only extracts boolean facts (`injuriesReported: true`). The deterministic FSM code (`ConversationManager.ts`) reads that fact and forcefully alters the conversational state.

## 5. Production Reasoning
**Why would a company build it this way?**  
Compliance. If an AI ignores a severe medical injury and continues asking about the car's license plate, the company will face massive PR and legal backlash. By separating extraction (LLM) from business logic (TypeScript FSM), the company guarantees compliance.

## 6. Alternatives
**Pure LLM Agent (e.g., OpenAI Assistants API)**  
Why not just give the LLM a system prompt saying: *"You are an insurance agent. Collect claim details. If they are hurt, escalate."*?
- **Tradeoff:** Hallucinations. Pure LLM agents can get confused, forget rules, or get jailbroken by users. They are fundamentally unsafe for regulated financial/medical workflows.

## 7. Tradeoffs
**Pros of our Hybrid Approach:** 100% deterministic business logic. 100% safe.
**Cons:** Harder to build. Requires maintaining a complex state machine alongside the LLM prompts.

## 8. Interview Explanation
**How you should explain it:**  
*"I chose a hybrid orchestration architecture for this FNOL agent. While LLMs are phenomenal at extracting structured entities from panicked, unstructured speech, they are too non-deterministic to trust with regulatory compliance. Therefore, the LLM in my system acts purely as a translation layer. It extracts JSON. My deterministic TypeScript state machine reads that JSON and strictly enforces the business rules—like medical escalations and policy verification."*

## 9. Likely Interviewer Questions
1. **"What happens if the caller says 'I bumped my head but I'm fine' and the LLM accidentally flags `injuriesReported: true`?"**
2. **"How do you handle a scenario where the LLM hallucinates a policy number?"**

## 10. Model Answers
1. *"False positives in medical escalations are acceptable in insurance. If the system over-escalates to a human agent out of an abundance of caution, the business absorbs a slight cost increase. If it under-escalates, the business faces a lawsuit. Our system fails safe."*
2. *"The LLM's output is never trusted as truth. It is immediately passed to `verifyPolicy.ts`. If the hallucinatory policy number doesn't exist in our mock database (`policies.json`), the FSM rejects it and asks the user to clarify."*

## 11. Common Mistakes Candidates Make
- **Treating the LLM as the Brain:** Do not say the LLM decides what happens next. The FSM decides. The LLM just formats the response.
- **Ignoring the Domain:** Candidates who focus purely on WebSockets and forget to talk about "Claim Lifecycles" and "AHT" fail to show Staff-level product thinking.
