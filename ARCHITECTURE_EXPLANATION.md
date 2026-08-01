# FNOL Voice Agent — Architecture Specification & Technical Explanation

## Executive Architecture Summary

The **Meridian Motor Insurance FNOL Voice Agent** is a production-grade, low-latency Voice AI system engineered using a **Hybrid Deterministic Orchestration + LLM Extraction Pattern**.

By decoupling non-deterministic natural language processing (handled by **Google Gemini 2.5 Flash Lite**) from strict business logic and policy state management (handled by a **Deterministic Finite State Machine in TypeScript**), the architecture guarantees 100% adherence to insurance compliance rules, policy verification thresholds, required field collection, towing entitlements, and emergency escalation paths.

---

## 1. System Layers & High-Level Components

```
+-----------------------------------------------------------------------------------+
| CLIENT LAYER         | Telephony Caller (PSTN) / Hosted Browser Demo Web UI        |
+-----------------------------------------------------------------------------------+
| VOICE PLATFORM       | Retell AI Custom LLM Telephony Gateway & WebSockets       |
+-----------------------------------------------------------------------------------+
| BACKEND & HOSTING    | Railway Cloud (Node.js ESM, Express, WS Gateway, FSM)     |
+-----------------------------------------------------------------------------------+
| AI & EXTRACTION      | Primary: Gemini 2.5 Flash Lite (SSE) | Fallback: Groq LLaMA 70B|
+-----------------------------------------------------------------------------------+
| PERSISTENCE          | Google Sheets API (Structured Claims) & Local JSON Logs   |
+-----------------------------------------------------------------------------------+
| NOTIFICATION LAYER   | Resend REST API (Verified Sender: claims@aurallon.com)    |
+-----------------------------------------------------------------------------------+
```

### Components Summary:
1. **Retell AI Telephony Gateway**: Manages real-time WebRTC audio streaming, full-duplex speech-to-text (STT), text-to-speech (TTS), and barge-in user interruption detection. Communicates with Railway via WebSocket frames (`call_details`, `update_only`, `response_required`).
2. **Railway Express/WS Backend (`src/server.ts`)**: Hosts HTTP endpoints (`/chat/start`, `/chat`, `/api/trigger-sendmail`) and a high-performance `ws` server managing caller sessions.
3. **ConversationManager (`src/conversation/ConversationManager.ts`)**: The core orchestrator managing state transitions, slot merging, validation, policy lookups, service recommendations, and completion triggers.
4. **ExtractClaimDataService (`src/services/extractClaimData.ts`)**: Invokes Gemini 2.5 Flash Lite over native SSE streaming to extract structured claim JSON slots while concurrently generating empathetic natural spoken responses.
5. **VerifyPolicyService (`src/services/verifyPolicy.ts`)**: Deterministically validates caller policy numbers and names against `policies.json`. Enforces a strict 2-attempt retry limit before offering a callback.
6. **NormalizeClaimDataService (`src/services/normalizeClaimData.ts`)**: Standardizes phonetics, dates ("yesterday"), vehicle registrations ("KA01AB1234"), and phone numbers.
7. **ClaimLoggerService (`src/services/claimLogger.ts`)**: Persists completed claims into Google Sheets and local JSON files.
8. **ResendNotificationService (`src/services/notificationService.ts`)**: Dispatches transactional HTML & plaintext confirmation emails via the Resend REST SDK.

---

## 2. Request Flow & Non-Blocking Asynchronous Persistence

```text
[ Caller ] -> [ Retell AI ] => (WSS) => [ Railway Server ] -> [ ConversationManager ]
                                                                      │
                                                                      ▼
                                                          [ Gemini 2.5 Flash Lite ]
                                                                      │
                                                                      ▼
[ Spoken Response ] <= (WSS) <= [ Railway Server ] <== [ State Merged & Verified ]
                                                                      │
                                                   (Non-Blocking Async Background I/O)
                                                                      ├─> [ Google Sheets API ]
                                                                      └─> [ Resend Email API ]
```

1. **Turn Trigger**: Retell emits `response_required` with the user transcript.
2. **Extraction & Surface Generation**: `ConversationManager` calls `extractClaimData()`. Gemini processes recent turn context and returns extracted slots + surface text.
3. **Deterministic State Mutation**: Code validates slots (`validateClaimPatch`), cleans data (`normalizeClaimPatch`), updates `ConversationState`, checks policy verification, and evaluates escalation keywords.
4. **Instant Response**: Response JSON (`{ response_type: "response", content, content_complete }`) is pushed to Retell immediately.
5. **Non-Blocking Persistence**: Google Sheets appends and Resend email dispatches execute in background async promises, preventing network latency hangs on telephony streams.

---

## 3. Finite State Machine (FSM) Lifecycle

```
[ safety_check ] ──(Unsafe / Injury)──> [ escalation ] ──────────> [ completed ]
       │                                                                  ▲
       └──(Safe)──> [ verification ] ──(Max 2 Failures)─> [ callback_offer ]┤
                          │                                               │
                      (Verified)                                          │
                          ▼                                               │
               [ collecting_details ] <──(Clarify)──> [ clarifying ]     │
                          │                                               │
                     (All Fields)                                         │
                          ▼                                               │
              [ recommending_services ] ──────────────────────────────────┘
```

- **`safety_check`**: Initial step. Verifies immediate safety before requesting PII.
- **`verification`**: Validates policy number & name. Max 2 failures triggers `callback_offer`.
- **`collecting_details`**: Collects required FNOL fields (date, time, location, vehicle, drivability, police report, photos). Handles out-of-order dumps & corrections.
- **`clarifying`**: Triggered on malformed vehicle registrations (<4 chars) or ambiguous inputs.
- **`recommending_services`**: Evaluates policy coverages (Comprehensive vs. Third-Party) and vehicle drivability to recommend towing or network garages.
- **`escalation`**: Triggered immediately if injury or severe collision is mentioned.
- **`completed`**: Claim logged, reference number assigned, confirmation dispatched.

---

## 4. Deployment Topology & Security Boundaries

- **Hosting**: Railway Cloud Platform (Node.js ESM Container, Port 3000).
- **Environment Isolation**: Credentials (`GEMINI_API_KEY`, `RESEND_API_KEY`, `GOOGLE_CREDENTIALS_JSON`, `RETELL_API_KEY`) passed via environment variables.
- **Email Authentication**: Custom domain `aurallon.com` with DKIM/SPF verification in Resend.
- **Data Security**: PII masked in production logs; service account scoped strictly to the target Google Sheet.
