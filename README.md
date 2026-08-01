# Meridian Motor Insurance — FNOL Voice Agent

A production-grade First Notice of Loss (FNOL) voice agent prototype powered by Google Gemini, Express, WebSockets, and Resend Transactional Email API.

---

## Features

- **Interactive Voice FNOL Interface**: Handles caller verification, safety checks, incident detail extraction, and service recommendations.
- **Resend Transactional Email Integration**: Asynchronously dispatches structured HTML and text claim confirmation notifications to policyholders via the official Resend REST API SDK (`resend`).
- **Resilient Claim Logging**: Persists claims locally to JSON and appends records to Google Sheets in parallel with automatic outbox fallback.
- **Fail-Safe Notification Handling**: Notification failures log gracefully without interrupting claim completion or spoken agent responses.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```ini
# Server
PORT=3000

# Primary LLM Provider
GEMINI_API_KEY=your_gemini_api_key

# Transactional Email (Resend)
RESEND_API_KEY=re_123456789_your_resend_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev
NOTIFICATION_EMAIL_TO=delivered@resend.dev

# Persistence (Google Sheets)
GOOGLE_CREDENTIALS_JSON='{"type": "service_account", ...}'
GOOGLE_SHEET_ID=1bRu1nK9IL8a7DCSXSQ-jXHczpfcPNJ3PJoWw-zjzcJw
```

---

## Commands

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run typecheck
npm run typecheck

# Run test suite
npm test
```

---

## API Endpoints

- `GET /api/latest-email-status`: Returns the latest Resend email dispatch payload and status.
- `POST /api/trigger-sendmail` (or `GET /api/trigger-sendmail`): Triggers a live test claim submission and Resend email dispatch.
