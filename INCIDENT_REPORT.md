# Incident Report

## Incident Summary
- **Incident Description**: Voice FNOL AI Agent exhibited severe instability. Conversations dropped randomly during execution, and multiple slots of data provided by callers (e.g. name, policy, time) in one sentence were not being extracted. Furthermore, new required features (Towing and Rental questioning) were missing.
- **Date**: August 5, 2026
- **Status**: Resolved
- **Impact**: High (P0/P1). Customers experienced unhandled call terminations during the FNOL reporting flow.

## Timeline
- **T0**: Issue reported from logs where users were disconnected unexpectedly.
- **T+1h**: Root cause discovered in LLM timeout settings and lack of `FALLBACK_EXHAUSTED` handling in `ConversationManager.ts`.
- **T+2h**: Identified extraction failures stemming from restricted `buildExtractionContext` bounding in `extractClaimData.ts`.
- **T+3h**: Generated Implementation Plan and reviewed with stakeholders.
- **T+4h**: Deployed fixes for timeout scaling, fallback handling, expanded LLM JSON schema context, and iterative `ConversationManager` states for Towing and Rental questions.
- **T+5h**: Type checking passed and changes committed successfully.

## Corrective Actions
1. **Timeouts**: Scaled up LLM inference request timeouts to 12 seconds to counter network latency.
2. **Graceful Fallbacks**: Created a reliable mechanism that catches complete provider exhaustion and forces a graceful claim compilation and termination rather than dropping the WebSocket silently.
3. **Data Completeness**: Extended `extractClaimData.ts` and `ConversationManager.ts` to strictly handle and output all required booleans (`towingRequested`, `rentalRequested`).

## Sign-off
Principal Staff AI Engineer & Incident Commander
