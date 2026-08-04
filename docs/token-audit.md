# Token Audit

## Call count

A normal logical turn makes one LLM call for both extraction and caller response. The completion summary is deterministic because the LLM rewrite is disabled. A provider failure can replay the same prompt for up to three Gemini and two Groq attempts.

## Estimated prompt budget

| Component | Typical tokens | Growth |
|---|---:|---|
| System instruction | 85–110 | stable; date changes |
| User wrapper/schema | 80–250 | fields/schema depend on route |
| State | 0–300+ | claim text grows |
| Last four messages | 0–700+ | count bounded, length unbounded |
| Latest user message | 5–500+ | unbounded within transport limits |
| Typical early prompt | ~220–450 | estimate |
| Typical late prompt | ~500–1,200 | estimate |

Gemini and Groq are configured with maximum output 4096 even though intended JSON is approximately 80–250 tokens. Usage metadata is logged opportunistically but no aggregate data is committed.

## Token pressure

- Recent history duplicates state and duplicates the newest user message.
- Known state serializes descriptions/injury details every turn.
- Three missing fields are exposed although one field is asked.
- Caller language and extraction JSON compete in one completion.
- Retries replay the full prompt.
- The response cache is unsafe: its key omits session ID and claim-state values.

## Later measurement plan

Capture prompt/candidate/total tokens per provider attempt and prompt version. Break down p50/p95 by FSM route, retries, completion, abandonment and JSON validity; pair tokens with extraction and escalation accuracy.
