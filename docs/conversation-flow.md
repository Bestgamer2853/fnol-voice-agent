# Conversation Flow

## Intended caller experience

1. Greeting and safety question.
2. Policy number and caller name.
3. Policy verification (up to two failures).
4. Out-of-order FNOL collection: incident date/time/location/description, insured vehicle make/model/registration, injury status/details, police report/reference, photos, drivable status.
5. Service recommendation if rules produce one.
6. Claim number, logging, completion/adjuster follow-up.

## What controls each layer

The manager determines whether a claim can be completed and whether to escalate, but the LLM dynamically creates the caller-facing response and the request for the first `missingFields` item. As a result, language quality and exact conversational progression are model-dependent even though required fields are deterministic.

## Interruptions and corrections

- Every turn sends recent four-message history plus current claim state. The model can return any fields presently in the schema (first three missing fields and, before verification, name/policy); validation merges them field-wise.
- A correction overwrites a prior text/boolean field; vehicle fields are merged individually.
- There is a `contradictions` state type but no active comparison/detection code in this repository. There is no caller-visible confirmation/correction protocol beyond natural-language re-extraction.
- A low LLM confidence (<0.40) or too-short registration creates a clarification, but clarification is passed to the *next* LLM request.

## Safety and escalation behavior

The initial system prompt does not provide a dedicated safety decision schema. After LLM extraction, `injuriesReported === true` immediately emits `escalate`; matching injury detail or incident description strings can also escalate. The returned LLM language, rather than a deterministic emergency message, is usually used. State’s `escalationRequired` is not set by this path, despite the field’s name.

## Caller experience risks observed in repository artifacts

`railway-logs.txt` contains historical turns where safety questions repeat and spoken policy data was not recognized. This is historical evidence, not a test of the current running deployment. It aligns with a state/prompt mismatch: the manager keeps `safety_check`, but LLM instruction is based on `missingFields` beginning with policy number.

## Conversation quality acceptance criteria for Phase 2

- A scenario suite should assert every terminal route, false/true injury, two verification failures, corrections, out-of-order slots, provider outage, slow provider, duplicate/out-of-order Retell response IDs, reconnection, and concurrent calls.
- Measure first audible token, full response, repeat-question rate, extraction precision/recall, escalation recall, abandonment, and terminal-state integrity against de-identified replays.
