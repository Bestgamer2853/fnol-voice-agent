# Meridian FNOL Voice Agent — Architecture & Design

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────────┐    │
│  │ Browser  │   │ Browser  │   │ Retell Sandbox           │    │
│  │ Text     │   │ Voice    │   │ (Phone → STT → Webhook)  │    │
│  │ (Chat)   │   │ (WebSpeech│   │                          │    │
│  │          │   │  API)    │   │                          │    │
│  └────┬─────┘   └────┬─────┘   └───────────┬──────────────┘    │
│       └───────────────┴─────────────────────┘                   │
│                           │  User text                          │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXPRESS SERVER                               │
│  POST /chat          POST /chat/start      POST /retell-webhook │
│  (text turns)        (new session)         (phone turns)        │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CONVERSATION MANAGER                            │
│  Owns: state, orchestration, turn logic, field tracking          │
│  Calls services in deterministic order per turn:                 │
│                                                                  │
│  1. ExtractClaimData  ──► Gemini (JSON extraction only)          │
│  2. VerifyPolicy      ──► Deterministic lookup against JSON      │
│  3. DetectContradictions ► Deterministic field-level comparison   │
│  4. DetectSeverity    ──► Deterministic keyword matching          │
│  5. RecommendServices ──► Deterministic business rules            │
│  6. GenerateSummary   ──► Deterministic template + optional LLM   │
│  7. PromptBuilder     ──► Deterministic prompt assembly           │
│  8. GeminiClient      ──► LLM generates caller-facing language    │
│  9. ClaimLogger       ──► JSON file + Google Sheets               │
└───────────────────────────┼─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       OUTPUT LAYER                               │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────────┐    │
│  │ Browser  │   │ Browser  │   │ Retell Sandbox           │    │
│  │ Chat     │   │ TTS      │   │ (TTS → Phone speaker)    │    │
│  │ Bubble   │   │ (WebSpeech│   │                          │    │
│  │          │   │  API)    │   │                          │    │
│  └──────────┘   └──────────┘   └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. ConversationManager Owns All State and Orchestration
The LLM never decides what question to ask, which field to collect, whether to escalate, or when the claim is complete. ConversationManager makes every orchestration decision using deterministic logic. Gemini is called only for three narrow tasks: extracting structured data from natural language, generating caller-facing responses, and rewriting summaries. This makes the system predictable, testable, and auditable.

### 2. Deterministic Business Services
Policy verification, severity detection, contradiction detection, service recommendations, and field tracking are all pure functions with no LLM involvement. Severity is classified by keyword matching against curated term lists. Contradictions are detected by comparing normalized field values between turns. This ensures that a claim flagged as "high severity" or a detected contradiction will always produce the same result for the same input — a critical property for insurance operations.

### 3. Separation of Voice Transport from Conversation Logic
Voice (STT/TTS) is treated as a pure I/O layer that sits outside the conversation engine. The browser uses the Web Speech API; Retell provides telephony + streaming voice. Both feed plain text into the same `/chat` HTTP endpoint. This means switching voice providers requires zero changes to business logic.

### 4. PromptBuilder as Explicit Contract
The PromptBuilder assembles system prompts, conversation context, and user prompts as structured text documents — not free-form strings. The application state (collected fields, missing fields, contradictions, severity, pending clarifications) is serialized into a deterministic context block. The LLM receives the ConversationManager's chosen action as the "source of truth" and generates only the natural-language surface form. This prevents the LLM from inventing facts, skipping fields, or making business decisions.

### 5. Graceful Fallback When LLM is Unavailable
If the Gemini API key is missing or the API call fails, every service degrades gracefully: extraction falls back to regex-based parsing, response generation uses the ConversationManager's deterministic action message, and summary generation uses a template. The claim flow can complete entirely without LLM availability.

---

## Trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| Deterministic orchestration over LLM orchestration | Predictable, testable, auditable | Requires explicit coding of every conversation path |
| Keyword-based severity over LLM classification | Consistent, explainable, no false negatives for known terms | May miss novel phrasings not in keyword lists |
| Browser Web Speech API for demo voice | Zero dependencies, instant demo | Quality varies by browser; no phone number |
| Single-turn Gemini calls (no chat history in API) | Simpler, lower cost, deterministic context | Loses multi-turn LLM memory (offset by explicit state tracking) |
| JSON file persistence | Zero infrastructure setup | Not suitable for production concurrent access |

---

## Known Failure Modes

1. **Gemini API quota/rate limiting** — Falls back to deterministic responses. Claim flow continues but language quality degrades.
2. **Extraction misses for complex natural language** — Regex fallback may miss compound sentences. Mitigated by follow-up questions asking for each field individually.
3. **Browser Speech API browser compatibility** — Works only in Chromium browsers. Gracefully hidden in unsupported browsers.
4. **Contradiction false positives** — If a user rephrases the same information slightly differently, the system may flag it as a contradiction. The clarification prompt lets the user confirm.
5. **Concurrent JSON file writes** — Multiple simultaneous claim completions could corrupt `claims.json`. Not an issue for demo scale.

---

## Production Changes Required

| Area | Current (Prototype) | Production Requirement |
|---|---|---|
| Voice | Browser Web Speech API / Retell sandbox | Production telephony (Twilio SIP + streaming ASR/TTS) |
| Persistence | Local JSON file | PostgreSQL or similar with transactions |
| Claim logging | JSON + Google Sheets | Database with audit trail and RBAC |
| Authentication | None | OAuth2 / API key management |
| Deployment | Local `tsx` | Containerized (Docker) on cloud with CI/CD |
| Scaling | Single process, in-memory sessions | Redis session store, horizontal scaling |
| Severity detection | Keyword matching | Hybrid: keywords + LLM classification with human review |
| Confirmation | Simulated browser notification | Twilio SMS / SendGrid email with delivery tracking |
| Monitoring | Console logs | Structured logging, APM, error tracking (Datadog/Sentry) |
| Compliance | None | Data encryption at rest, PII redaction, retention policies |
