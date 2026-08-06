# FSM and State Model

## Declared states

`ConversationStep` declares: `safety_check`, `verification`, `collecting_details`, `clarifying`, `recommending_services`, `escalation`, `callback_offer`, `completed`.

## Actual transitions

| From (observed) | Condition | To | Action |
|---|---|---|---|
| `safety_check` | any normal turn | usually remains `safety_check` | `respond` |
| any non-completed | injury/severe test | `escalation` | `escalate` |
| any non-completed | second policy failure | `callback_offer` | `complete` |
| any non-completed | verified + fields complete + services nonempty | `recommending_services` | `respond` |
| `recommending_services` | next turn with complete fields | `completed` | `complete` |
| any non-completed | verified + fields complete + no services | `completed` | `complete` |
| `completed` | subsequent user turn | `completed` | `complete` goodbye |

There is no active assignment to `verification`, `collecting_details`, or `clarifying`. Therefore the enum represents intended structure, not an enforced FSM graph.

## `ConversationState`

| Field | Producer/consumer |
|---|---|
| `currentClaim` | LLM patch → validation/normalization/merge; all services |
| `conversationHistory` | appended every user and assistant action; last 4 used in prompt |
| `collectedFields`, `missingFields` | recalculated after nonterminal normal and service states |
| `verifiedPolicy`, `verificationAttempts` | policy verification |
| `currentConversationStep` | limited transitions above; prompt service recommendation/completion behavior |
| `pendingClarifications` | registration/confidence validation; next prompt consumes first entry |
| `contradictions`, `followUpQuestions`, `empathyPhrasesUsed`, `retryCount` | declared, presently unused in active orchestration |
| `severity`, `escalationRequired` | severity set only to high by escalation branch; `escalationRequired` not updated |
| `servicesRecommended`, `pendingServiceChoices` | records that services were offered and which towing/rental answer(s) still require an explicit caller decision; unrelated or repeated turns cannot complete the claim |

## Required-field logic

Base fields are policy number, name, date, time, location, description, full vehicle, injury status, police-report status, photos status, and drivable status. `injuryDetails` becomes required when injury is true; police reference when police report is true. `otherParties` is only tracked after it is already present, so it cannot become missing.

## Invariants to preserve if modifying later

1. Claim completion must require a verified policy and all required/conditional fields.
2. Escalation must preempt normal completion and persist an auditable disposition.
3. One logical Retell response ID must not commit stale state after a newer turn supersedes it.
4. An accepted extracted patch must be schema/type/range validated before state merge.
5. State and durable logging must have an explicit outcome for partial persistence failures.
