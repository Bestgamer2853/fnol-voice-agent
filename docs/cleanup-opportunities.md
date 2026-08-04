# Cleanup Opportunities (Documentation Only)

This is an inventory, not authorization to delete/refactor.

| Item | Evidence | Classification | Why it matters |
|---|---|---|---|
| Legacy Gemini client | services/geminiClient.ts is not imported by runtime | unused provider implementation | confusing duplicate provider model and retry behavior |
| Config prompt types | config/prompts.ts only exports interfaces | unused/stub | prompt source is obscured |
| Browser transport interface | transport/browserSocket.ts is unreferenced | unused abstraction | no implementation/call site |
| EmpathyEngine | conversation/modules/EmpathyEngine.ts is unreferenced | unused module | active empathy is prompt/greeting only |
| Debug assignment parsing | parseDebugMessage/isDebugMessage/isConfirmationRequested in manager have no active call path | dead/legacy logic | misleading confirmation semantics |
| Fallback extractor | extractFallbackClaimPatch exists but getFallbackResult returns empty slots | unused failure code | false resilience impression |
| Gemini summary rewrite | buildLlmSummary exists but factory always returns deterministic result | intentionally disabled code | dead dependency path |
| LLM_TOOL fields | provider interfaces/tool translation remain, active extraction sends no tools | unused generic capability | complexity and large any surface |
| response cache | process-global cache with weak key | unsafe optimization | cross-session stale/caller-content leakage risk |
| Runtime variables | claimCompleted/finalExtractionResult pattern and retryCount | mixed active/legacy code | reduces auditability |
| package scripts | demo scripts reference missing src/demo files; test fails | stale operations | unusable developer interface |
| Historic docs | ARCHITECTURE.md/AUDIT_REPORT.md describe services/files not present or behavior different from source | stale documentation | agents may make unsafe assumptions |
| Scratch/log artifacts | scratch/*, railway-logs.txt, test-output.txt | diagnostics with possible sensitive payloads | repository hygiene and PII exposure |

## Duplicate concepts

Both Gemini native and Groq OpenAI SSE implementations duplicate stream parsing, retries, timeouts and fallback text. There are two Gemini-named abstractions: runtime LlmProvider and legacy GeminiClient. There are also two sources of stated architecture: current source and outdated root Markdown.

## Safe investigation before any cleanup phase

First add coverage/replay tests around active manager behavior and determine whether external users invoke the legacy modules/scripts. Preserve historical logs outside the source repository under an approved retention policy before removal.
