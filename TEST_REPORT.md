# Test Report

## Test Execution Summary
- **Total Test Suites**: 8
- **Total Executed Tests**: 43
- **Passed**: 43
- **Failed**: 0
- **Build Status**: PASS (`npm run typecheck` 0 errors)
- **Live Gemini API Status**: PASS (`gemini-3.5-flash-lite` 200 OK)

## Verified Test Suites

### 1. Escalation Regression Suite (12 Tests)
- Verified emergency escalation triggers on:
  - "my neck hurts", "my back hurts", "blood", "hospital", "ambulance", "whiplash", "someone couldn't move", "stiff neck", "fracture", "severe crash".
- Verified non-escalation on "no injuries, minor dent".

### 2. Verification Retry Suite (5 Tests)
- Verified policy verification logic (requires policy number + caller name).
- Rejects invalid policy or incorrect name.
- Locks out call after 2 failed attempts and branches to `callback_offer` terminal state.

### 3. Server Integration Suite (5 Tests)
- Concurrent HTTP turns without crashing.
- Out-of-order Retell response IDs in WebSocket.
- HTTP and WS authentication rejection.
- IP rate limiting.

### 4. Real Gemini Integration & Verification Suite (4 Tests)
- **Happy Path**: Multi-turn full conversation using live Gemini API key.
- **Multi-slot extraction**: Processed name, policy, incident date, time, location, vehicle, and drivability in single turn.
- **Caller Self-Correction**: Successfully updated incident date from `2026-07-29` to `2026-07-30` dynamically.
- **Emergency Escalation**: Correctly extracted injuries and escalated via real LLM.

### 5. Stress Testing Suite (1 Test)
- Executed 10 sequential real-time conversation turns in a single session without state corruption, memory leaks, or unhandled promise rejections.

### 6. Failure Injection & Resilience Suite (2 Tests)
- **LLM Network Failure**: Gracefully returns connection fallback message with `FALLBACK_EXHAUSTED` status and completes call without crashing.
- **Google Sheets 500 Error Injection**: Injected a 500 API error in `claimLogger.log`. Verified that turn processing and spoken responses to the user complete cleanly without throwing uncaught promise rejections.
