# 13. Dependency Graph

## 1. Business Motivation
**Why does this exist?**  
To fix a bug, you must trace the execution path. If Google Sheets stops updating, you need to know which module called the Google Sheets service, and which module called *that* module. This graph represents the topological hierarchy of the codebase.

## 2. Software Engineering Concept
**Acyclic Dependencies and Inversion of Control.**  
A healthy codebase is a Directed Acyclic Graph (DAG). If `ConversationManager` imports `extractClaimData`, and `extractClaimData` imports `ConversationManager`, you have a circular dependency, which crashes Node.js on boot. We prevent this using interfaces (Inversion of Control).

## 3. The Visual Graph

```mermaid
graph TD
    %% Entry Point
    Server[src/server.ts (Express/WS)] --> Runtime[src/runtime.ts]

    %% Runtime DI Wiring
    Runtime --> CM[src/conversation/ConversationManager.ts]
    Runtime --> Gemini[src/llm/gemini.ts]
    Runtime --> Sheets[src/storage/googleSheets.ts]
    Runtime --> Resend[src/services/notificationService.ts]

    %% Conversation Manager (The Brain)
    CM --> Extract[src/services/extractClaimData.ts]
    CM --> Verify[src/services/verifyPolicy.ts]
    CM --> Recommend[src/services/recommendServices.ts]
    CM --> Logger[src/services/claimLogger.ts]

    %% Services calling out
    Extract --> Gemini
    Logger --> Sheets
    Logger --> Resend

    %% External Systems
    Server -.->|WebSocket| Retell[Retell AI]
    Gemini -.->|REST/SSE| GoogleAPI[Google Gemini API]
    Sheets -.->|REST| GoogleSheets[Google Sheets API]
    Resend -.->|REST| ResendAPI[Resend Email API]
```

## 4. Execution Path Walkthrough

1. `server.ts` handles the raw network boundary.
2. `server.ts` calls `conversationManager.handleTurn()`.
3. `ConversationManager` does not know how to talk to Gemini. It calls `this.deps.extractClaimData.extract()`.
4. `extractClaimData.ts` formats the insurance rules into a string prompt. It does not know how to make HTTP requests. It calls `this.client.generateContent()`.
5. `gemini.ts` handles the raw HTTP request to Google and parses the Server-Sent Events stream.

## 5. Production Reasoning
**Why would a company build it this way?**  
Blast radius isolation. If Google deprecates the Gemini 2.5 API and forces us to use Gemini 3.0, we ONLY have to change `src/llm/gemini.ts`. `extractClaimData.ts` and `ConversationManager.ts` remain completely untouched because they only rely on the `LLMProvider` interface.

## 6. Likely Interviewer Questions
1. **"What happens if you introduce a circular dependency in Node.js?"**
2. **"How does `ConversationManager` know it's talking to Gemini and not OpenAI?"**

## 7. Model Answers
1. *"Node.js resolves CommonJS/ESM modules recursively. If A requires B, and B requires A, one of them will receive an incomplete/undefined object. This causes a runtime crash on boot (`TypeError: Cannot read properties of undefined`)."*
2. *"It doesn't. `ConversationManager` is completely agnostic to the LLM provider. It only knows about the `ExtractClaimDataService` interface. In `runtime.ts`, I instantiate the Gemini client and pass it into the manager. This Inversion of Control is what allows us to hot-swap providers if Gemini goes down."*
