# FNOL Voice Agent — 4-Diagram Interview Presentation Script

This guide provides the exact script and talking points for presenting the **Meridian Motor Insurance FNOL Voice Agent** system architecture during a Staff/Principal Software Engineer system design interview.

---

## Executive Overview (30 Seconds)

> *"Hi everyone. Today I'm presenting the architecture for the Meridian Motor Insurance First Notice of Loss (FNOL) Voice Agent.
> 
> The core technical challenge we solved is **combining real-time conversational voice AI with 100% deterministic insurance compliance**. Pure LLM agents hallucinate policy lookups, skip required fields, or mismanage emergency escalations.
> 
> To solve this, we built a **Hybrid Orchestration Pattern**: Google Gemini 2.5 Flash Lite handles speech-to-text slot extraction and surface voice dialogue, while a custom TypeScript Finite State Machine (FSM) owns policy verification, slot validation, towing entitlement rules, and non-blocking asynchronous persistence."*

---

## Diagram 1: System Context & Container Topology (C4 Level 1 & 2) — 45 Seconds

> *"Looking at **Diagram 1 (System Context & Container Architecture)**:
> 
> - **Inbound Calls**: Callers connect via PSTN phone or our WebRTC browser demo simulator into the **Retell AI Telephony Gateway**.
> - **Transport Boundary**: Retell streams low-latency WebSocket events (`call_details`, `update_only`, `response_required`) directly to our Node.js server hosted on **Railway Cloud** (Port 3000).
> - **AI Engine**: Our backend queries **Gemini 2.5 Flash Lite** over native REST SSE streams, achieving under 700ms P95 TTFT.
> - **External Outbox**: Completed claims log asynchronously into **Google Sheets v4** and dispatch confirmation emails via **Resend REST API** (`claims@aurallon.com`)."*

---

## Diagram 2: Domain Component Architecture (C4 Level 3) — 45 Seconds

> *"Zooming into `ConversationManager.ts` inside **Diagram 2 (Component Architecture)**, we follow strict single-responsibility decoupling:
> 
> - **`VerifyPolicyService`**: Validates policy numbers and names against `policies.json`. It enforces a strict **2-retry limit** before offering a scheduled callback.
> - **`ExtractClaimDataService`**: Combines Gemini SSE extraction with fallback regex parsing for 100% out-of-order slot capture.
> - **`NormalizeClaimDataService`**: Handles spoken phonetics (e.g. 'm m i - one zero two three four' -> `MMI-10234`), relative dates ('yesterday'), and license plate normalization.
> - **`RecommendServicesService`**: Evaluates policy entitlements for towing and garage recommendations."*

---

## Diagram 3: End-to-End Sequence & Async Persistence — 45 Seconds

> *"In **Diagram 3 (Sequence Diagram)**, notice our low-latency design:
> 
> - During a voice turn (steps 1 through 10), the server processes Gemini extraction, verifies slots, and returns spoken audio text to Retell immediately (<700ms).
> - **Asynchronous Persistence (steps 11–12)**: We do NOT block the telephony audio stream waiting for Google Sheets or Resend REST APIs. Instead, claim logging and confirmation email dispatches execute in background `Promise.resolve()` blocks post-turn."*

---

## Diagram 4: Claim Finite State Machine (FSM) & Guardrails — 45 Seconds

> *"Finally, **Diagram 4 (FSM Lifecycle)** enforces strict business compliance:
> 
> - Calls start in `safety_check`. If an injury or severe crash is detected, the FSM transitions immediately to `escalation`, flags `escalationRequired: true`, and issues emergency advisories.
> - Normal calls proceed through `verification` -> `collecting_details` -> `recommending_services` -> `completed`.
> - License plates under 4 characters trigger a `clarifying` state to request clean repetition without dropping prior state."*
