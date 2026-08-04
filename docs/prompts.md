# Prompts and LLM Contract

## Active prompt source

The only active FNOL generation prompt is dynamically built in `src/services/extractClaimData.ts`. `src/config/prompts.ts` contains interfaces only; no prompt templates are used. `GeminiClient` is a legacy interface/service and is not in runtime composition.

## System instruction (active)

It sets FNOL voice role, current UTC date, relative-date resolution, strict FSM instruction adherence, brief/natural behavior, no repeating answers, `HH:MM` times, and JSON-only output. It is reconstructed every turn.

## Dynamic context

`KNOWN_STATE` serializes all claim properties (except vehicle separately); `FSM_INSTRUCTION` is selected from pending clarification, first missing field, service recommendation, or completed; `JSON_SCHEMA` is a descriptive JSON example; `RECENT_HISTORY` contains the last four transcript messages. The user prompt asks for a JSON object and embeds untrusted caller speech directly.

## Expected output

```json
{
  "responseToUser": "spoken caller response",
  "extractedData": {
    "confidence": 0.0,
    "policyNumber": "...",
    "callerName": "..."
  }
}
```

Runtime uses `generationConfig.responseMimeType = application/json`, but does not pass `responseJsonSchema`. It parses `JSON.parse` then best-effort fenced/braced extraction. `sanitizeExtractedClaimPatch` only accepts whitelisted text/boolean/vehicle fields; `validateClaimPatch` additionally rejects invalid registration length and applies type checks.

## Prompt/control findings

- The instruction says “follow FSM strictly,” but the manager does not supply a state-specific instruction for safety/verification; it selects first missing field instead.
- Schema fields are limited to three missing fields; useful out-of-order fields beyond them may be silently unavailable to the model. Before policy verification, policy and caller fields remain available.
- No explicit prompt-injection boundary says that caller text is data rather than instruction. JSON mode shapes syntax but is not a business-rule guarantee.
- `recommendedServices` is model-extractable although deterministic recommendation code owns it. This duplicates authority.
- The output response can be streamed before parse/validation; the spoken text is not guaranteed to match the final action after deterministic overrides.

## Disabled/legacy prompts

`generateSummary.ts` contains an LLM rewrite prompt but returns deterministic summary because rewrite is disabled. `scratch/test-isolated.ts` contains a stale wider system prompt. Neither is production behavior.
