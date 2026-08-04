# 07. LLM & Prompt Integration

## 1. Business Motivation
**Why does this exist?**  
The entire premise of an AI agent is that it can converse naturally while silently performing rigid database entry. To do this, we must force the LLM to output exactly what it wants to say, alongside exactly what it found in the user's speech, structured as strict JSON.

## 2. Software Engineering Concept
**Prompt Engineering, Context Windows, and Structured Outputs.**
- **Context Window:** The maximum amount of text the model can "remember" in one request.
- **System Prompt:** The unbreakable rules given to the model.
- **Dynamic Context:** Injecting real-time state into the prompt so the model knows where it is in the conversation.
- **Structured Outputs (JSON Mode):** Forcing the LLM to reply with a parseable object instead of plain text markdown.

## 3. Repository Implementation
- **File:** `src/services/extractClaimData.ts`
- **File:** `src/llm/gemini.ts`
- **Model:** `gemini-2.5-flash-lite`

## 4. Line-by-Line Walkthrough: The Extraction Engine

Inside `extractClaimData.ts`, we dynamically assemble the prompt on every turn:

```typescript
// 1. The FSM tells the LLM what it is allowed to talk about.
let fsmInstruction = "Respond naturally.";
if (input.state.currentConversationStep === 'collecting_details') {
    const missing = calculateMissingFields(input.claim);
    fsmInstruction = `Ask for ${missing[0]}. But extract ALL fields mentioned.`;
}

// 2. We inject the FSM rule into the Context
const conversationContext = `STATE: ${stateContext}
FSM: ${fsmInstruction}
SCHEMA: ${JSON.stringify(schemaObj)}
HISTORY: ${historyStr}`;

// 3. We call the LLM and demand JSON
const response = await this.client.generateContent({
    systemInstruction: "You are an FNOL agent. Output ONLY valid JSON.",
    prompt: conversationContext,
    responseJsonSchema: claimDataSchema 
});
```

**Why was it written this way?**  
We don't rely on the LLM to "figure out" what to ask next. The FSM calculates `calculateMissingFields` and explicitly injects the next question into the prompt as `fsmInstruction`. The LLM's only job is to translate that mechanical instruction into natural human dialogue (`responseToUser`) and extract the entities.

## 5. Production Reasoning
**Why would a company build it this way?**  
Cost and Latency. By forcing a lightweight model (Flash Lite) to output structured JSON, we get the extraction and the dialogue generation in a single, blazing-fast network call. Doing this in two steps (one LLM call for chat, one LLM call for extraction) would double the latency and the API cost.

## 6. Alternatives
**Alternative: OpenAI Tool Calling (Functions)**
- *Why we didn't use it:* OpenAI's tool calling is powerful but adds massive overhead to TTFT (Time-to-First-Token). For voice, returning a single JSON object with `responseToUser` and `extractedData` is significantly faster than waiting for the model to decide to emit a tool-call token, parse the arguments, and return.

## 7. Tradeoffs
- **Pros:** Sub-second latency. Highly predictable conversational flow.
- **Cons:** Prompts become very complex. If the context window gets filled with too much history, the model might "forget" the strict JSON formatting.

## 8. Interview Explanation
*"For the LLM integration, I bypassed standard conversational APIs in favor of a single-shot JSON extraction prompt using Gemini 2.5 Flash Lite. On every turn, the orchestration layer calculates the FSM state, determines the next missing field, and compiles a dynamic prompt. The LLM acts purely as a linguistic translation layer, returning both the TTS string and the extracted data schema in one payload. This halves the latency compared to a two-step chat-and-extract pipeline."*

## 9. Likely Interviewer Questions
1. **"What happens if Gemini returns malformed JSON, like missing a closing bracket?"**
2. **"Why use Gemini 2.5 Flash Lite instead of a more capable model like Claude 3.5 Sonnet?"**

## 10. Model Answers
1. *"In `gemini.ts`, if the `JSON.parse` fails, I have a fallback regex parser (`extractFallbackClaimPatch` in `extractClaimData.ts`) that attempts to salvage key-value pairs from the broken text. If that fails, the FSM gracefully handles the error by asking the user to repeat themselves."*
2. *"Voice is fundamentally gated by TTFT (Time-To-First-Token). Flash Lite returns the first token in under 400ms. Claude 3.5 Sonnet, while smarter, takes 1-2 seconds, which results in awkward conversational silence. For simple schema extraction, speed beats intelligence."*

## 11. Common Mistakes Candidates Make
- **Not knowing the model.** If you say "I used GPT-4" but the code uses Gemini, you fail instantly.
- **Not explaining TTFT.** Time-To-First-Token is the single most important metric in Voice AI. You must use this acronym.
