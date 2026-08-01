# FNOL Voice Agent — 5-Minute Technical Interview Architecture Presentation Guide

This guide provides the exact script and talking points for presenting the **Meridian Motor Insurance FNOL Voice Agent** system architecture during a Staff Software Engineer system design interview.

---

## Executive Overview (30 Seconds)

> *"Hi everyone. Today I'm presenting the architecture for the Meridian Motor Insurance First Notice of Loss (FNOL) Voice Agent.
> 
> The core problem we solved is **combining natural spoken voice AI with 100% deterministic insurance compliance**. Pure LLM agents hallucinate policy lookups, skip required fields, or mismanage emergency escalations.
> 
> To solve this, we built a **Hybrid Orchestration Pattern**: Google Gemini 2.5 Flash Lite handles speech-to-text slot extraction and surface voice dialogue, while a custom TypeScript Finite State Machine (FSM) owns policy verification, slot validation, towing entitlement rules, and non-blocking asynchronous persistence."*

---

## 1. System Context (Diagram 1 - C4 Level 1) — 45 Seconds

> *"Looking at **Diagram 1 (System Context)**:
> 
> - **Inbound Calls**: Callers connect via PSTN phone or our WebRTC browser demo simulator into the **Retell AI Telephony Gateway**.
> - **Transport Boundary**: Retell streams low-latency WebSocket events (`call_details`, `update_only`, `response_required`) directly to our Node.js server hosted on **Railway Cloud**.
> - **AI Engine**: Our backend queries **Gemini 2.5 Flash Lite** over native REST SSE streams, achieving under 700ms P95 TTFT.
> - **External Outbox**: Completed claims log asynchronously into **Google Sheets** and dispatch confirmation emails via **Resend REST API** (`claims@aurallon.com`)."*

---

## 2. Containers & Subsystems (Diagram 2 - C4 Level 2) — 60 Seconds

> *"Zooming into **Diagram 2 (Container Architecture)** inside our Railway deployment container:
> 
> - **Express & WS Gateway (`server.ts`)**: Accepts incoming WebSocket connections on port 3000, manages session state mappings (`Map<string, Session>`), and handles barge-in interruptions via `AbortController`.
> - **ConversationManager (`ConversationManager.ts`)**: The core orchestrator. On every turn, it receives raw user text, delegates slot extraction to `ExtractClaimDataService`, validates slot integrity (`validateClaimPatch`), and executes state machine rules.
> - **Environment & Security**: All credentials (`GEMINI_API_KEY`, `RESEND_API_KEY`, `GOOGLE_CREDENTIALS_JSON`) are strictly isolated via environment variables."*

---

## 3. Core Components (Diagram 3 - C4 Level 3) — 60 Seconds

> *"In **Diagram 3 (Component Architecture)**, we inspect `ConversationManager`'s decoupled domain services:
> 
> - **`VerifyPolicyService`**: Validates policy numbers and names against `policies.json`. It enforces a strict **2-retry limit** before transitioning to a callback offer.
> - **`NormalizeClaimDataService`**: Handles spoken phonetics (e.g. 'm m i - one zero two three four' -> `MMI-10234`), relative dates ('yesterday'), and vehicle registration formats.
> - **`EmpathyEngine`**: Analyzes distress phrases and injects reassuring, calm spoken phrasing before prompting for FNOL fields."*

---

## 4. Sequence Flow & Non-Blocking Async I/O (Diagram 4) — 45 Seconds

> *"In **Diagram 4 (UML Request Sequence)**, notice our low-latency design:
> 
> - During a voice turn (steps 1 through 10), the server processes Gemini extraction, verifies slots, and returns spoken audio text to Retell immediately.
> - **Asynchronous Persistence (steps 11–14)**: We do NOT block the telephony audio stream waiting for Google Sheets or Resend REST APIs. Instead, claim logging and confirmation email dispatches execute in background async promises post-turn."*

---

## 5. State Machine & Deployment (Diagrams 5 & 6) — 30 Seconds

> *"Finally, **Diagram 5 (FSM Lifecycle)** enforces strict business gates:
> 
> - Calls start in `safety_check`. If an injury or severe crash is detected, the FSM transitions immediately to `escalation`, flags `escalationRequired: true`, and issues emergency advisories.
> - Normal calls proceed through `verification` -> `collecting_details` -> `recommending_services` -> `completed`.
> - If vehicle registration is malformed (<4 chars), the state machine enters `clarifying` to request clean repetition without dropping prior state."*
