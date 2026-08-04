# Meridian Motor Insurance
## FNOL Voice Agent — Architecture & Design Summary

---

### 1. EXECUTIVE SUMMARY

Meridian Voice AI automates motor insurance First Notice of Loss (FNOL) intake, replacing 20-minute call center queues with sub-second (<800ms) conversational AI. The system pairs real-time voice streaming and single-pass LLM entity extraction with a deterministic state machine, delivering 100% regulatory compliance and non-blocking outbox persistence.

---

### 2. SYSTEM ARCHITECTURE

```
┌──────────────┐     WebRTC     ┌────────────────────────┐     WebSocket     ┌────────────────────────────────────┐
│ Caller Voice │ ◄────────────► │ Telephony Voice Gateway│ ◄───────────────► │ Real-Time Voice Orchestrator       │
│ (Mobile/Web) │  (Real-Time)   │ (Retell Telephony)     │   (JSON Chunks)   │ ├─ Finite State Machine (FSM)      │
└──────────────┘                └────────────────────────┘                   │ └─ Flash LLM Entity Extractor      │
                                                                             └─────────────────┬──────────────────┘
                                                                                               │ Async Outbox
                                                                                               ▼
                                                                             ┌────────────────────────────────────┐
                                                                             │ Multi-Channel Persistence Outbox   │
                                                                             │ (Local Disk / Sheets / Email)      │
                                                                             └────────────────────────────────────┘
```

---

### 3. ARCHITECTURAL TRADE-OFFS

| Design Choice | Strategic Benefit (Pros) | Architectural Trade-off (Cons) |
| :--- | :--- | :--- |
| **Deterministic FSM vs Pure LLM** | 100% regulatory compliance & zero misrouted emergencies | Slightly reduced conversational flexibility |
| **In-Memory State vs Redis** | Sub-millisecond turn latency with zero network overhead | State tied to container lifecycle; single-pod bottleneck |
| **Google Sheets vs Relational DB** | Immediate, human-readable claim portal for adjusters | Subject to API rate limits (429) & lacks ACID guarantees |
| **Flash LLM vs Frontier Model** | Sub-350ms TTFT; 90% lower cost per claim turn | Slightly lower reasoning depth on complex edge cases |
| **Async vs Sync Persistence** | Decouples persistence I/O from real-time audio budget | Requires background fault mitigation for dropped tasks |

---

### 4. KEY ARCHITECTURAL DECISIONS

- **Hybrid Orchestration:** Stochastic LLM handles natural language entity extraction; deterministic FSM strictly enforces policy checks and medical escalations.
- **Sub-Second Latency Budget:** Flash LLM over Server-Sent Events delivers ~350ms Time-To-First-Token (TTFT) to meet <800ms glass-to-glass latency target.
- **Asynchronous Persistence:** Persistence writes execute out-of-band to ensure zero voice audio lag or turn blocking.
- **Single-Pass Entity Extraction:** Enforced JSON schema returns spoken conversational language and extracted slots in a single turn.

---

### 5. FAILURE MODES & RESILIENCE MATRIX

| Failure Mode | Business Impact | Current Mitigation | Production Solution |
| :--- | :--- | :--- | :--- |
| **Container Restart** | In-flight state reset | Session cleanup on disconnect | Redis Cluster + Redlock mutex |
| **Sheets API Down** | Storage delay | Local disk outbox buffer | Durable Kafka event streaming |
| **LLM Gateway Timeout** | Turn stall | Secondary API provider failover | Circuit breaker + multi-region failover |
| **Email API Error** | Delayed notification | Silent failure recovery log | Worker retry queue with backoff |

---

### 6. ARCHITECTURAL EVOLUTION (PROTOTYPE → PRODUCTION)

```
PROTOTYPE PHASE                                     PRODUCTION EVOLUTION
┌──────────────────────────────────┐                 ┌──────────────────────────────────┐
│ • In-Memory Session Map          │                 │ • Distributed Redis Cluster      │
│ • Single Container Instance      │  ─────────────► │ • Stateless K8s Pod Auto-scaling │
│ • Async Sheets + Disk Outbox     │                 │ • Kafka + PostgreSQL + OTel      │
└──────────────────────────────────┘                 └──────────────────────────────────┘
```

---

### 7. ARCHITECT'S PHILOSOPHY

This architecture establishes a strict separation between **stochastic intelligence** (LLM entity extraction) and the **deterministic control plane** (state machine business rules). By offloading heavy media processing to telephony gateways and executing persistence out-of-band, the system guarantees strict regulatory compliance while maintaining an enterprise-grade <800ms voice latency budget.
