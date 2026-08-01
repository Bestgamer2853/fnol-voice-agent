# FNOL Voice Agent — Requirement Traceability Matrix (RTM)

## Project Brief Traceability Mapping

| Req # | Requirement Description | Implementation Location | Verification Evidence | Status |
|---|---|---|---|---|
| **1** | **Inbound Call Handling**<br>Provide Retell/Vapi sandbox phone number or browser UI. | `src/server.ts`<br>`src/transport/browserSocket.ts`<br>`scripts/create-retell-agent.ts` | Live Retell Agent `agent_e907d38b5b5dcdf4cf90dbccc5` linked to `wss://fnol-voice-agent-production.up.railway.app/`. Tested via browser & Retell WS. | **VERIFIED PASS** |
| **2** | **Caller Verification**<br>Verify policy number + name against dummy data. Politely handle failed match (max 2 retries, then offer callback). | `src/services/verifyPolicy.ts`<br>`src/conversation/ConversationManager.ts` | Unit tests `verificationAttempts >= 2` trigger step `callback_offer` and action `complete`. Live policy lookups for `MMI-10234`, `MMI-10871`, etc. | **VERIFIED PASS** |
| **3** | **FNOL Data Collection**<br>Collect all required fields. Handle out-of-order data and mid-call self-corrections. | `src/config/requiredFields.ts`<br>`src/services/extractClaimData.ts`<br>`src/services/normalizeClaimData.ts` | Tested single-turn info dumps and mid-call field corrections (date, location, drivable status). | **VERIFIED PASS** |
| **4** | **Follow-up Questions & Contradictions**<br>Surface contradictions or ask follow-up questions during data collection flow. | `src/conversation/ConversationManager.ts`<br>`src/services/extractClaimData.ts` | Slot validation detects invalid registrations, missing fields, or conflicting statements and queues `pendingClarifications`. | **VERIFIED PASS** |
| **5** | **Escalation Logic**<br>If caller mentions any injury (explicit or implicit e.g., "neck feels stiff") or incident is severe, flag as **URGENT** and trigger alert. | `src/config/constants.ts`<br>`src/conversation/ConversationManager.ts` | Immediate step transition to `escalation`, setting `escalationRequired: true` and returning emergency warning. | **VERIFIED PASS** |
| **6** | **Claim Logging & Notification**<br>Generate claim reference number, log structured record (Google Sheet/database), and send confirmation email/SMS. | `src/services/claimLogger.ts`<br>`src/storage/googleSheets.ts`<br>`src/services/notificationService.ts` | Live Google Sheets append + Resend REST API email dispatch (Message ID `de32e35f-8ab1-4ec3-8738-d44d2b7c54bd`). | **VERIFIED PASS** |
| **7** | **Call Summary & Severity**<br>Auto-generate LLM summary and severity classification (Low / Medium / High). | `src/services/generateSummary.ts`<br>`src/conversation/ConversationManager.ts` | `generateSummary` service produces structured summaries and severity tags stored alongside claim records. | **VERIFIED PASS** |
| **8** | **Tone & Empathy**<br>Callers may be distressed. Acknowledge distress, stay calm & empathetic; do not robotically push script. | `src/conversation/modules/EmpathyEngine.ts`<br>`src/services/extractClaimData.ts` | Greeting includes mandatory safety check ("are you and everyone else safe?"), empathetic phrasing, and calm acknowledgements. | **VERIFIED PASS** |

---

## Technical Stack & Ground Rules Verification

| Rule | Requirement | Verification Evidence | Status |
|---|---|---|---|
| **Tech Stack** | Candidate-orchestrated conversation manager (no prebuilt opaque agent). | Written custom TypeScript state machine (`src/conversation/ConversationManager.ts`) & slot extractor (`src/services/extractClaimData.ts`). | **VERIFIED PASS** |
| **Dummy Data** | Use only fictional company & dummy policy data. | Uses `Meridian Motor Insurance` and `src/config/policies.json`. | **VERIFIED PASS** |
| **Strict TS** | TypeScript ESM with `.js` import specifiers passing `npm run typecheck`. | `npm run typecheck` passes with **0 errors**. | **VERIFIED PASS** |
