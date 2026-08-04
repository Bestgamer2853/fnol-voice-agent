# 07. Tech Stack Encyclopedia

> [!HOTSPOT]
> * **Probability:** 80% | **Est. Time:** 30m | **Difficulty:** Medium
> * **Likely Questions:**
>   - Why choose Gemini Flash Lite over GPT-4o?
>   - Why Retell AI instead of building raw WebRTC/Twilio pipelines?
>   - Why Express + raw `ws` instead of Socket.io?

---

## 1. Google Gemini 2.5 Flash Lite
* **What:** Google's ultra-low latency, multimodal LLM model.
* **Why We Chose It:** Sub-350ms Time-To-First-Token (TTFT), native JSON Schema enforcement (`responseJsonSchema`), native Server-Sent Events (SSE) streaming support.
* **Alternatives:** OpenAI GPT-4o, Claude 3.5 Sonnet, Groq Llama-3.3-70b.
* **Why Not GPT-4o:** GPT-4o TTFT exceeds 1000ms, introducing awkward dead air into voice conversations.
* **Why Not Groq Llama-3:** Groq is fast, but native JSON schema enforcement is less reliable for complex nested insurance structures.
* **Interview Pitch:** *"We selected Gemini 2.5 Flash Lite because voice AI is strictly gated by TTFT. Flash Lite gives us sub-350ms first-token generation while enforcing strict JSON schemas."*
* 📌 **CURRENT IMPLEMENTATION:** Single Gemini provider called via `@google/genai` SDK.
* 🚀 **PRODUCTION EVOLUTION:** Multi-region API fallback pool with automated circuit breaking (`opossum`).

---

## 2. Retell AI Voice Gateway
* **What:** Managed Voice AI telephony platform providing WebRTC, SIP trunking, STT, TTS, and Voice Activity Detection (VAD).
* **Why We Chose It:** Handles raw telephony, noise suppression, and barge-in out of the box. Exposes a clean Custom LLM WebSocket protocol.
* **Alternatives:** Twilio Media Streams + Deepgram + ElevenLabs (Self-built pipeline).
* **Why Not Self-Built:** Self-building WebRTC audio pipelines, jitter buffers, and custom VAD takes months of low-level C++/Rust audio engineering.
* **Interview Pitch:** *"Retell handles the infrastructure layer of voice (telephony, WebRTC, STT, TTS, VAD), allowing us to focus 100% of our engineering effort on compliance and insurance state machine logic."*
* 📌 **CURRENT IMPLEMENTATION:** Direct Retell WebSocket connection to `/chat`.
* 🚀 **PRODUCTION EVOLUTION:** Enterprise Retell SLA with dedicated SIP trunks and custom voice fine-tuning.

---

## 3. Node.js & TypeScript
* **What:** Single-threaded asynchronous JavaScript runtime with strict compile-time type safety.
* **Why We Chose It:** Non-blocking I/O event loop makes Node ideal for high-concurrency WebSocket connections. TypeScript contracts (`Claim`, `Policy`, `ConversationState`) prevent runtime type errors.
* **Alternatives:** Python (FastAPI), Go (Goroutines), Rust (Tokio).
* **Why Not Python:** Python's GIL and higher memory footprint make concurrent WebSocket streaming less efficient than Node's event loop.
* **Why Not Go:** Go is faster, but Node allowed rapid iteration of JSON manipulation and typescript contract sharing.
* **Interview Pitch:** *"Node's event loop excels at I/O-bound streaming systems like WebSockets. TypeScript provides the strict contract safety required for insurance field extraction."*
* 📌 **CURRENT IMPLEMENTATION:** Node single-process runtime executing via `tsx`.
* 🚀 **PRODUCTION EVOLUTION:** Node Cluster Mode across multiple CPU cores via PM2 or Docker.

---

## 4. Railway PaaS
* **What:** Modern developer-focused cloud platform as a service.
* **Why We Chose It:** Automatic GitHub CI/CD deployment, native Nixpacks Node container detection, built-in SSL termination (providing HTTPS/WSS for Retell).
* **Alternatives:** AWS ECS/EKS (Kubernetes), Heroku, Render.
* **Why Not Kubernetes (EKS):** Overkill for a monolithic prototype. Requires ingress controllers, Helm charts, and Terraform boilerplate without adding business value.
* **Interview Pitch:** *"Railway provided a zero-devops CI/CD platform with native SSL termination, which is mandatory for secure WebSockets."*
* 📌 **CURRENT IMPLEMENTATION:** Single container deployment on Railway.
* 🚀 **PRODUCTION EVOLUTION:** Migrate container workloads to AWS ECS Fargate or EKS behind an AWS ALB.

---

## 5. Google Sheets API
* **What:** Google Workspace API for programmatically updating spreadsheets.
* **Why We Chose It:** Serves as a zero-code, real-time visual CRM interface for non-technical stakeholders during demos.
* **Alternatives:** PostgreSQL, MongoDB, DynamoDB.
* **Why Not Postgres:** Postgres is the right database for production, but Sheets provided instant visibility for executive stakeholders during early prototype reviews.
* **Interview Pitch:** *"Google Sheets was used in this prototype as a lightweight CRM sink for non-technical stakeholders to inspect claims in real time."*
* 📌 **CURRENT IMPLEMENTATION:** Direct appends via `googleapis` SDK.
* 🚀 **PRODUCTION EVOLUTION:** Replace Sheets API with PostgreSQL managed via Prisma or TypeORM.

---

## 6. Resend Email API
* **What:** Modern developer-first transactional email API platform.
* **Why We Chose It:** Blazing-fast HTTP API endpoint, clean HTML email templates, automatic domain verification.
* **Alternatives:** SendGrid, AWS SES, Postmark.
* **Why Not SendGrid:** SendGrid's SDK and configuration overhead are significantly clunkier than Resend's clean REST API.
* **Interview Pitch:** *"Resend provides instant transactional claim confirmation emails dispatched asynchronously upon claim completion."*
* 📌 **CURRENT IMPLEMENTATION:** Direct HTTP call in background logger.
* 🚀 **PRODUCTION EVOLUTION:** Move Resend calls to a background worker consuming from a Kafka event queue.

---

## 7. Raw WebSockets (`ws` npm package)
* **What:** Minimalist, high-performance RFC 6455 WebSocket implementation for Node.js.
* **Why We Chose It:** Retell AI's Custom LLM protocol requires raw standard WebSockets. `ws` is the fastest Node implementation with zero framework bloat.
* **Alternatives:** Socket.io, Engine.io.
* **Why Not Socket.io:** Socket.io adds custom framing, ping/pong wrappers, and HTTP long-polling fallbacks that break Retell's raw socket protocol.
* **Interview Pitch:** *"We used raw `ws` attached to our Express HTTP server to maintain strict protocol compatibility with Retell AI without overhead."*
* 📌 **CURRENT IMPLEMENTATION:** Co-located on Express HTTP server.
* 🚀 **PRODUCTION EVOLUTION:** Place an ALB or Envoy Proxy in front for WSS SSL termination and connection draining.

---

> [!RECAP]
> 1. Gemini Flash Lite was chosen for sub-350ms TTFT to meet our <800ms voice latency budget.
> 2. Retell AI handles telephony infrastructure (STT, TTS, VAD, WebRTC) so we focus on business logic.
> 3. Node.js non-blocking I/O excels at handling concurrent WebSocket text streams.
> 4. Railway provides instant zero-devops deployment with native SSL termination for secure WebSockets.
> 5. Express + raw `ws` maintains strict Retell protocol compatibility without Socket.io framework bloat.
