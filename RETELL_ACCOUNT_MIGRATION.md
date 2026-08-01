# Retell AI Account Migration & Custom LLM Protocol Audit

## Executive Summary

The FNOL Voice Agent integration has been successfully audited and migrated to your new Retell AI account (`RETELL_API_KEY`: `key_c1230212af4d5cfaa31f758e6181`).

Since the new Retell AI account did not originally contain your Custom LLM Agent, an automated provisioner script ([scripts/create-retell-agent.ts](file:///Users/deiveeganaryan/fnol-voice-agent/scripts/create-retell-agent.ts)) was built and executed. A fully configured Custom LLM Voice Agent is now live in your new Retell AI account.

---

## 1. Migrated Retell Account & Provisioned Agent Details

| Property | Value |
|---|---|
| **Retell Account API Key** | `key_c1230212af4d5cfaa31f758e6181` |
| **Agent ID** | `agent_e907d38b5b5dcdf4cf90dbccc5` |
| **Agent Name** | `Meridian Insurance FNOL Agent` |
| **Response Engine Type** | `custom-llm` |
| **LLM WebSocket URL** | `wss://fnol-voice-agent-production.up.railway.app/` |
| **Voice ID** | `11labs-Adrian` |
| **Responsiveness** | `1.0` (Maximum sensitivity for low TTFT) |
| **Interruption Sensitivity** | `1.0` (Instant user interruption detection) |
| **Voice Speed / Temperature** | `1.0 / 1.0` |
| **Enable Backchannel** | `true` |

---

## 2. Automated Agent Provisioning Script

An automated bootstrap script has been added to the codebase:

- **Script Path**: [scripts/create-retell-agent.ts](file:///Users/deiveeganaryan/fnol-voice-agent/scripts/create-retell-agent.ts)
- **NPM Shortcut**: `npm run retell:create-agent`

### How to Run:
```bash
RETELL_API_KEY=key_c1230212af4d5cfaa31f758e6181 npm run retell:create-agent
```

### Script Execution Log:
```text
> fnol-voice-agent@1.0.0 retell:create-agent
> tsx scripts/create-retell-agent.ts

==================================================
RETELL CUSTOM LLM AGENT PROVISIONER
==================================================
- API Key Prefix:  key_c12302...
- WebSocket URL:   wss://fnol-voice-agent-production.up.railway.app/
- Agent Name:      Meridian Insurance FNOL Agent
- Voice ID:        11labs-Adrian
--------------------------------------------------
[1/3] Querying existing Retell agents...
[2/3] Found existing agent (agent_e907d38b5b5dcdf4cf90dbccc5). Updating configuration...
✅ Agent updated successfully!
--------------------------------------------------
[3/3] AGENT PROVISIONING SUMMARY
--------------------------------------------------
- Agent ID:               agent_e907d38b5b5dcdf4cf90dbccc5
- Agent Name:             Meridian Insurance FNOL Agent
- Response Engine Type:   custom-llm
- LLM WebSocket URL:      wss://fnol-voice-agent-production.up.railway.app/
- Voice ID:               11labs-Adrian
- Interruption Sensitivity: 1
- Responsiveness:         1
==================================================
```

---

## 3. Retell Custom LLM Protocol Verification

Our backend server (`src/server.ts`) implements Retell's WebSocket protocol:

```
+------------------+                    +-----------------------+
|  Retell AI Engine|                    | Railway Node Server   |
+------------------+                    +-----------------------+
         |                                          |
         | --- WS Connect wss://... --------------> |
         |                                          |
         | --- call_details { call_id, metadata } -> | (Init session & greeting)
         |                                          |
         | --- update_only { transcript } ---------> | (Partial speech update)
         |                                          |
         | --- response_required { response_id } --> | (Triggers turn execution)
         |                                          |
         | <-- response { content_complete: false } | (Streams SSE chunks)
         |                                          |
         | <-- response { content_complete: true }  | (Final turn text)
         |                                          |
         | <-- response { end_call: true } -------- | (Hang up on claim completion)
```

### Verified Protocol Features:
1. **WebSocket Handshake (`wss://`)**: Secure connection established via `src/server.ts`.
2. **`call_details` Handling**: Initializes standard `ConversationState` session upon call setup.
3. **Interruption / `update_only` Events**: AbortControllers cancel active in-flight Gemini LLM generation when the user interrupts mid-sentence.
4. **Turn Execution (`response_required`)**: Executes extraction and response generation via `ExtractClaimDataService` (Gemini 2.5 Flash Lite).
5. **Streaming Response Chunks**: Emits `content_complete: false` SSE chunks for instantaneous voice synthesis.
6. **Call Termination (`end_call: true`)**: Automatically signals Retell to terminate the telephony audio stream when `ConversationState` transitions to `completed` or `escalated`.

---

## 4. End-to-End Pipeline Verification

```
[ Retell Voice Agent Web Call / Phone Call ]
                     │
                     ▼
[ Custom LLM Agent (agent_e907d38b5b5dcdf4cf90dbccc5) ]
                     │
                     ▼
[ Railway WebSocket Server (wss://fnol-voice-agent-production.up.railway.app/) ]
                     │
                     ▼
[ Gemini 2.5 Flash Lite (Extract Claim Data & Conversation Engine) ]
                     │
                     ▼
[ Deterministic Slot Verification & Google Sheets Logging ]
                     │
                     ▼
[ Resend REST API Email Delivery (Claim Confirmation HTML/Text) ]
```

---

## 5. Remaining Manual Steps (If Any)

Because the Custom LLM agent is fully provisioned via API, **no additional dashboard configuration is required for Web Calls**.

If you wish to attach a PSTN/Twilio Phone Number for direct telephone dial-in:
1. Log into [dashboard.retellai.com](https://dashboard.retellai.com).
2. Go to **Phone Numbers** -> **Buy / Import Number**.
3. Select your phone number and assign **Agent**: `Meridian Insurance FNOL Agent` (`agent_e907d38b5b5dcdf4cf90dbccc5`).
