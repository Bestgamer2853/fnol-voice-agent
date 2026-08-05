# Bug Fix Report

## Resolved Issues

### 1. Random Conversation Terminations
- **Issue**: Calls dropped unexpectedly without graceful handling or logging.
- **Root Cause**:
  1. `gemini.ts` timeout was too aggressive (6000ms), failing during network jitter.
  2. `fallback.ts` didn't provide a `finishReason`, causing the orchestrator to continue in a broken state.
  3. `server.ts` failed to log claims when the connection closed prematurely.
- **Resolution**:
  - Increased timeout in `gemini.ts` to 12000ms.
  - Implemented `finishReason: 'FALLBACK_EXHAUSTED'` in `fallback.ts`.
  - Handled `FALLBACK_EXHAUSTED` explicitly in `ConversationManager.ts` by saving the current state to Google Sheets before disconnecting gracefully.

### 2. Multi-Slot Extraction Failures
- **Issue**: When callers spoke complex sentences, some fields (like towing or rental needs) were lost.
- **Root Cause**: `extractClaimData.ts` did not instruct the LLM on all fields nor did it parse all outputs into the final claim object consistently.
- **Resolution**: 
  - Updated JSON Schema for LLM context to enforce parsing of `towingRequested` and `rentalRequested`.
  - Re-injected known extracted services back into the `buildExtractionContext` so the LLM retains context across turns.

### 3. Iterative Service Questions (New Functionality)
- **Issue**: Services like towing and rental were not iteratively prompted.
- **Resolution**:
  - Updated `ConversationManager.ts` to query `hasTowing` and `hasRental`.
  - Added conditional check based on extracted boolean values for `towingRequested` and `rentalRequested`.
  - Configured `googleSheets.ts` and `notificationService.ts` to capture and export these variables.
