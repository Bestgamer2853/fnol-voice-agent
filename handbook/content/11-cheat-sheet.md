# 11. Master Cheat Sheet

> [!HOTSPOT]
> * **Probability:** 95% | **Est. Time:** 15m | **Difficulty:** Easy
> * **Likely Questions:**
>   - What are the exact metrics, ports, env vars, and specifications of this system?

---

## ⚡ Key System Metrics & Numbers

| Metric | Target / Spec | Notes |
| :--- | :--- | :--- |
| **Glass-to-Glass Latency Target** | **< 800 ms** | User stops speaking -> hears AI voice response |
| **Gemini 2.5 TTFT (First Token)** | **~ 350 ms** | Native SSE stream inference time |
| **HTTP / WS Server Port** | **Port 3000** | Single port co-located via Express + `ws` |
| **WebSocket Path** | `/chat` | Retell Custom LLM endpoint (`wss://.../chat`) |
| **FNOL Required Fields** | **7 Fields** | Incident Date, Location, Description, Insured Vehicle, Injuries, Police Report, Photos |
| **Max Verification Retries** | **2 Attempts** | FSM offers callback if policy verification fails twice |
| **Human Call Cost vs AI** | **$15.00 vs $0.25** | 98% reduction in cost per claim |
| **Average Handle Time (AHT)** | **15m -> 3m** | 80% reduction in claim filing duration |

---

## 🛠️ Core Technology Matrix

```
┌─────────────────┬─────────────────────────────┬──────────────────────────────────────────┐
│ Component       │ Technology                  │ Primary File / Location                  │
├─────────────────┼─────────────────────────────┼──────────────────────────────────────────┤
│ Transport       │ Express + Raw `ws`          │ src/server.ts                            │
│ Dependency Inj. │ TypeScript Factory Pattern │ src/runtime.ts                           │
│ Orchestrator    │ TypeScript FSM              │ src/conversation/ConversationManager.ts  │
│ LLM Extraction  │ Gemini 2.5 Flash Lite (SSE) │ src/services/extractClaimData.ts         │
│ LLM SDK Adapter │ @google/genai               │ src/llm/gemini.ts                        │
│ Policy Lookup   │ Deterministic JSON Lookup   │ src/services/verifyPolicy.ts             │
│ Persistence     │ Promise.allSettled Outbox   │ src/services/claimLogger.ts              │
│ External DB     │ Google Sheets API (OAuth2)  │ src/storage/googleSheets.ts              │
│ Email Alerts    │ Resend REST API             │ src/services/notificationService.ts      │
│ Cloud Hosting   │ Railway PaaS (Nixpacks)     │ package.json                             │
└─────────────────┴─────────────────────────────┴──────────────────────────────────────────┘
```

---

## 🔑 Environment Variables Reference

| Env Variable | Purpose | Handled In |
| :--- | :--- | :--- |
| `PORT` | Web server listening port (Default: 3000) | `src/server.ts` |
| `GEMINI_API_KEY` | Google Gemini AI authentication key | `src/llm/gemini.ts` |
| `GEMINI_MODEL` | AI Model Name (`gemini-2.5-flash-lite`) | `src/llm/gemini.ts` |
| `GOOGLE_CREDENTIALS_JSON` | Base64-encoded Google Service Account JSON | `src/storage/googleSheets.ts` |
| `GOOGLE_SHEETS_ID` | Target Spreadsheet ID for claim rows | `src/runtime.ts` |
| `RESEND_API_KEY` | Resend Email API token | `src/services/notificationService.ts` |

---

> [!RECAP]
> 1. Target Latency: <800ms total (~350ms Gemini TTFT).
> 2. Server Port: 3000 (Express HTTP + raw `ws` WebSocket on `/chat`).
> 3. Business Impact: Cuts AHT from 15m to 3m and call cost from $15 to $0.25.
> 4. FSM Steps: `safety_check` -> `verification` -> `collecting_details` -> `recommending_services` -> `completed`.
> 5. Outbox Persistence: `Promise.allSettled` dual-writing to `/data/claims.json` and Google Sheets.
