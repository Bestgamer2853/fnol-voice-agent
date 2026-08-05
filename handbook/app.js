/* FNOL Interview Cockpit — deliberately dependency-free for fast/offline reading. */
const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

const modules = [
  ['00-start-here', 'Start here', '30 minute briefing'], ['01-high-probability-questions', 'High-probability questions', 'model answers'],
  ['02-repository-explorer', 'Repository explorer', 'file matrix'], ['03-execution-flow', 'End-to-end flow', 'transport to persistence'],
  ['04-architecture-deep-dive', 'Architecture deep dive', 'boundaries and trade-offs'], ['05-code-deep-dive', 'Code deep dive', 'important implementation points'],
  ['06-production-thinking', 'Production thinking', 'scale and safety'], ['07-tech-stack-encyclopedia', 'Tech stack', 'Gemini, Retell, Sheets'],
  ['08-interview-questions', 'Question bank', 'architecture and LLMs'], ['09-live-modifications', 'Live modifications', 'change impact'],
  ['10-staff-engineer-notes', 'Staff notes', 'voluntary callouts'], ['11-cheat-sheet', 'Master cheat sheet', 'numbers and environment'],
  ['12-rapid-review', 'Rapid review', 'night before'], ['13-appendix', 'Appendix', 'CS fundamentals'], ['14-code-navigation', 'Code navigation', 'legacy walkthrough']
].map(([id, title, detail]) => ({ id, title, detail }));

const fileRecords = [
  { path: 'src/server.ts', purpose: 'Application entry point: Express HTTP routes, static assets, session map, and Retell-compatible WebSocket server share one HTTP listener.', deps: 'express, ws, runtime composition, notification service', consumers: 'Node process / `npm run dev`', methods: [['createSession()', 'Builds a fresh `ConversationState` through the shared manager.'], ['rateLimit()', 'Keeps an in-memory per-IP count for `/chat`.'], ['requireAuth()', 'Checks a bearer secret only when `API_SECRET` is configured.'], ['sendWsJson()', 'Serializes outgoing Retell protocol payloads.']], limits: 'Sessions, rate limits, logs, and active response IDs are process-local. Runtime logging exposes sensitive material and `/view-logs` is unauthenticated.', improvement: 'Production Improvement: authenticate every boundary, redact logs, move session/rate-limit state to managed infrastructure, and validate the Retell contract.' },
  { path: 'src/runtime.ts', purpose: 'Composition root that wires the manager to LLM, policy, recommendation, summary, persistence, Sheets, and notifications.', deps: 'all runtime services', consumers: 'src/server.ts', methods: [['createRuntimeDependencies()', 'Constructs Gemini, optional Groq fallback, local/Sheets loggers, notification decorator, and deterministic services.'], ['createRuntimeConversationManager()', 'Creates the shared manager from those dependencies.']], limits: 'The Sheet ID is hard-coded; `MultiClaimLogger` accepts `any`; persistence is not a transactional outbox.', improvement: 'Production Improvement: inject configuration and a typed durable outbox publisher.' },
  { path: 'src/conversation/ConversationManager.ts', purpose: 'Core orchestrator. It receives one transcript turn, merges a validated slot patch, then owns escalation, verification, service recommendation, and terminal behavior.', deps: 'extractClaimData, verifyPolicy, recommendServices, generateSummary, claimLogger, claimNumberGenerator', consumers: 'src/server.ts via the runtime manager', methods: [['start()', 'Returns the greeting-era initial state.'], ['handleUserMessage()', 'Runs the LLM extraction once, merges and normalizes the patch, applies deterministic business branches, and returns state plus action.'], ['completeClaim()', 'Requires a verified policy, builds a deterministic summary, then starts background logging.'], ['updateFieldTracking()', 'Recalculates the collected and missing FNOL fields.']], limits: 'Uses significant `any`; escalation mutates `state.severity`; completion returns a `respond` action even though some callers describe terminal behavior differently.', improvement: 'Production Improvement: make transitions explicit and pure; commit state and persistence through one idempotent workflow.' },
  { path: 'src/conversation/ConversationState.ts', purpose: 'Defines durable-in-memory conversational state: claim, field tracking, policy, history, step, attempts, and terminal flags.', deps: 'claim/policy contracts and conversation types', consumers: 'manager, extractor, actions', methods: [['ConversationState', 'The contract passed between turns; it is not a persisted database schema.']], limits: 'Several declared fields are not actively used in the manager.', improvement: 'Production Improvement: version and validate state before Redis/database hydration.' },
  { path: 'src/conversation/actions.ts', purpose: 'Defines `ConversationAction`, turn result, and the manager interface.', deps: 'Claim and ConversationState', consumers: 'manager and server transport', methods: [['ConversationManager.handleUserMessage()', 'Contract for a turn with optional chunk callback and abort signal.']], limits: 'Action semantics and terminal state must stay aligned with transport behavior.', improvement: 'Production Improvement: add exhaustive action handling at the transport boundary.' },
  { path: 'src/conversation/types.ts', purpose: 'Declares message, severity, clarification, follow-up, and conversation-step types.', deps: 'required-field types', consumers: 'conversation state and manager', methods: [['ConversationStep', 'The declared state vocabulary includes greeting, collecting_fnol, reviewing_summary, and confirming.']], limits: 'The enum-like union is broader than the currently executed transition graph.', improvement: 'Production Improvement: model allowed events/transitions as a tested state machine table.' },
  { path: 'src/services/extractClaimData.ts', purpose: 'Builds Gemini extraction context, calls the provider, parses JSON, and produces a sanitized claim patch plus surface response.', deps: 'LLM provider, Claim, ConversationState', consumers: 'ConversationManager', methods: [['extract()', 'Creates a JSON-only prompt, invokes the provider, parses response text, and merges regex fallback fields.'], ['sanitizeExtractedClaimPatch()', 'Whitelists supported text, boolean, and vehicle fields.'], ['extractFallbackClaimPatch()', 'Extracts limited patterned data such as policy number/date/time when the response is poor.']], limits: 'No `responseJsonSchema`; JSON recovery is best-effort; `getFallbackResult` does not use the fallback patch; prompt contains caller data.', improvement: 'Production Improvement: use provider schema enforcement, robust validation, prompt-injection boundaries, and bounded caching.' },
  { path: 'src/services/verifyPolicy.ts', purpose: 'Loads local `policies.json` and deterministically verifies policy number plus caller name with normalization and fuzzy matching.', deps: 'policies.json and Policy contract', consumers: 'ConversationManager', methods: [['loadPolicies()', 'Reads and validates the bundled policy list.'], ['verifyPolicy()', 'Returns a verified policy or a typed failure reason.'], ['nameFuzzyMatch()', 'Uses Jaro-Winkler and Levenshtein-based matching.']], limits: 'This is local mock data; fuzzy matching may select an ambiguous identity.', improvement: 'Production Improvement: call a policy-core system with explicit identity checks and an ambiguity-safe result.' },
  { path: 'src/services/recommendServices.ts', purpose: 'Maps verified policy coverage and claim facts to deterministic assistance recommendations.', deps: 'Claim and Policy contracts', consumers: 'ConversationManager', methods: [['recommendServices()', 'Returns towing/roadside, adjuster callback, and/or network repair garage under explicit conditions.']], limits: 'Rules are fixed in code and coverage is mock-policy data.', improvement: 'Production Improvement: externalize versioned entitlement rules with audit trails.' },
  { path: 'src/services/generateSummary.ts', purpose: 'Produces a deterministic internal claim summary; the legacy LLM rewrite path is disabled.', deps: 'Claim, Policy, ConversationState', consumers: 'ConversationManager', methods: [['generateSummary()', 'Formats the collected claim and policy deterministically.']], limits: 'Summary formatting is not independently schema-validated.', improvement: 'Production Improvement: store structured event facts alongside a formatted summary.' },
  { path: 'src/services/claimLogger.ts', purpose: 'Provides local JSON claim persistence and a notification decorator.', deps: 'node fs promises, claim/policy/state contracts', consumers: 'runtime composition', methods: [['LocalJsonClaimLogger.log()', 'Serializes local read-modify-write using a process-local mutex.'], ['NotificationClaimLogger.log()', 'Writes through then attempts email notification.']], limits: 'The mutex does not protect multiple processes; local JSON is not an atomic durable outbox.', improvement: 'Production Improvement: publish an idempotent claim event to a durable queue/database outbox.' },
  { path: 'src/services/notificationService.ts', purpose: 'Formats and sends claim-confirmation email through Resend when credentials are configured.', deps: 'resend and ClaimLogRecord', consumers: 'NotificationClaimLogger and test endpoint', methods: [['getConfigFromEnv()', 'Reads email configuration.'], ['ResendNotificationService.sendClaimConfirmation()', 'Builds text/HTML and makes the API call.']], limits: 'Email delivery is not independently queued or retried as a workflow.', improvement: 'Production Improvement: send from a worker with idempotency keys and delivery telemetry.' },
  { path: 'src/services/normalizeClaimData.ts', purpose: 'Normalizes policy number phonetics and relative/ISO dates in a claim patch.', deps: 'Claim contract', consumers: 'ConversationManager after validation', methods: [['normalizeClaimPatch()', 'Applies field-specific normalization before merge.']], limits: 'Date handling uses local `Date` behavior after a UTC-based prompt date.', improvement: 'Production Improvement: use an explicit timezone-aware date library and validation.' },
  { path: 'src/llm/gemini.ts', purpose: 'Native Gemini SSE adapter using `fetch`, JSON MIME type, retry, timeout, streaming chunks, and optional abort propagation.', deps: 'fetch and LlmProvider contract', consumers: 'runtime fallback chain', methods: [['GeminiService.generateResponse()', 'Sends `streamGenerateContent`, parses SSE events, forwards text chunks, and retries retryable failures once.']], limits: 'The endpoint includes the API key in a URL; structured schema is not passed; tail latency can grow through retry.', improvement: 'Production Improvement: route through a secure provider client/gateway, enforce schema, and budget retry latency.' },
  { path: 'src/llm/groq.ts', purpose: 'Optional OpenAI-compatible streaming fallback provider.', deps: 'fetch and LlmProvider contract', consumers: 'runtime fallback chain when `GROQ_API_KEY` exists', methods: [['GroqService.generateResponse()', 'Calls the configured OpenAI-compatible endpoint.']], limits: 'Adds fallback tail latency and depends on optional environment configuration.', improvement: 'Production Improvement: apply provider health, budget, and circuit-breaker policy.' },
  { path: 'src/llm/fallback.ts', purpose: 'Tries providers in sequence while preserving the `LlmProvider` interface.', deps: 'LlmProvider', consumers: 'extract service via runtime', methods: [['FallbackProvider.generateResponse()', 'Returns the first provider result that is not its temporary-connection fallback.']], limits: 'Chunks may already be forwarded before a provider is later considered unsuccessful.', improvement: 'Production Improvement: avoid emitting until an acceptance threshold or use resumable response semantics.' },
  { path: 'src/llm/provider.ts', purpose: 'LLM request/response contract shared by Gemini, Groq, fallback, and extraction.', deps: 'none', consumers: 'all LLM adapters', methods: [['LlmProvider', 'Abstraction that enables provider injection and tests.']], limits: 'Some consumer code still uses untyped `any` around provider data.', improvement: 'Production Improvement: encode structured response schema in the contract.' },
  { path: 'src/storage/googleSheets.ts', purpose: 'Google Sheets claim logger that maps a record into a spreadsheet row.', deps: 'googleapis, credentials, ClaimLogRecord', consumers: 'runtime MultiClaimLogger', methods: [['GoogleSheetsClaimLogger.log()', 'Initializes the Sheets client and appends a row.']], limits: 'The sheet ID is hard-coded and errors are absorbed by the multi-logger path.', improvement: 'Production Improvement: use a real system of record, a queue, and observable retry semantics.' },
  { path: 'src/config/requiredFields.ts', purpose: 'Defines the base and conditional FNOL field collection contract.', deps: 'none', consumers: 'ConversationManager and ConversationState', methods: [['REQUIRED_FNOL_FIELDS', 'Base collection requirements.'], ['CONDITIONAL_FNOL_FIELDS', 'Adds injury details or police reference based on boolean facts.']], limits: 'Business contract changes must be propagated through prompts, types, storage, tests, and docs.', improvement: 'Production Improvement: validate a versioned schema at every persistence boundary.' },
  { path: 'src/config/constants.ts', purpose: 'Holds company name, max verification attempts, and keyword lists.', deps: 'none', consumers: 'manager and related services', methods: [['MAX_VERIFICATION_RETRIES', 'Caps failed policy verification attempts at two.']], limits: 'Keyword policy is embedded and needs governance.', improvement: 'Production Improvement: manage safety policies as reviewed configuration.' },
  { path: 'src/config/policies.json', purpose: 'Local fixture policy records used for prototype verification and entitlement decisions.', deps: 'none', consumers: 'verifyPolicy service', methods: [['Policy fixtures', 'Not a live policy system.']], limits: 'PII-like sample records and local data are not production policy storage.', improvement: 'Production Improvement: integrate a governed policy source.' },
  { path: 'src/utils/claimNumber.ts', purpose: 'Generates sequential date-prefixed claim identifiers.', deps: 'none', consumers: 'manager and runtime sequence seeding', methods: [['SequentialClaimNumberGenerator.generate()', 'Increments an in-process sequence and formats `CLM-YYYYMMDD-NNNN`.']], limits: 'Sequence safety is per process and not globally coordinated.', improvement: 'Production Improvement: use a database sequence/ULID plus idempotency key.' },
  { path: 'src/transport/browserSocket.ts', purpose: 'Defines a browser voice-transport interface but is not used by active runtime composition.', deps: 'none', consumers: 'none in active path', methods: [['VoiceTransport', 'Potential abstraction for browser transport.']], limits: 'Stale/unwired prototype surface.', improvement: 'Production Improvement: remove or integrate with tests and a concrete adapter.' },
  { path: 'public/app.js', purpose: 'Browser demo client for HTTP chat and browser speech features.', deps: 'server chat endpoints and DOM', consumers: 'browser demo', methods: [['startConversation()', 'Starts a session via `/chat/start`.']], limits: 'Uses `innerHTML` for confirmation content.', improvement: 'Production Improvement: render untrusted values through DOM text nodes and add CSP.' },
  { path: 'tests/conversation-manager.test.ts', purpose: 'Exercises manager behavior with test dependencies.', deps: 'node test, manager contracts', consumers: 'npm test', methods: [['Conversation manager cases', 'Regression coverage for orchestration scenarios.']], limits: 'Coverage is valuable but not a full protocol/replay harness.', improvement: 'Production Improvement: add deterministic fixtures and provider/Retell replays.' }
];

const questions = [
  { p: '95%', q: 'Explain the architecture in 30 seconds.', short: 'Express and `ws` share one server. Browser turns use HTTP; Retell uses WebSocket transcripts. A process-local session holds `ConversationState`. The manager makes one LLM extraction/response call, then deterministic code owns validation, policy verification, escalation, service rules, and claim completion. Completion writes local JSON and attempts Google Sheets plus email.', deep: 'The important boundary is probabilistic language versus deterministic insurance decisions. `ExtractClaimDataService` returns a response and slot patch; `ConversationManager` normalizes/merges it before deciding whether to escalate, verify, recommend, or persist. `runtime.ts` is the composition root and injects the provider and services.', tags: ['architecture', 'ConversationManager', 'Express', 'WebSocket'] },
  { p: '95%', q: 'Why use an FSM / deterministic manager instead of a pure LLM agent?', short: 'Because policy verification, injury escalation, required FNOL fields, and claim persistence are business controls. An LLM may help extract facts and speak naturally, but it should not decide entitlements or completion.', deep: 'Current code has a manager and a declared `ConversationStep` union. Be precise: the implementation is not a complete formally enforced FSM; several declared steps are not actively transitioned. The design intent is right, but this prototype needs explicit tested transitions before calling it compliance-grade.', tags: ['FSM', 'safety', 'business rules'] },
  { p: '95%', q: 'What happens on a normal caller turn?', short: 'The manager appends the caller message, invokes extraction, validates and normalizes the patch, then checks escalation first. If safe, it verifies policy when both policy number and name exist. Once verified and complete, it offers deterministic services once; the following complete turn persists the claim.', deep: 'An LLM response is surfaced, but deterministic branches can override the outcome. Field tracking uses `REQUIRED_FNOL_FIELDS` plus conditional injury/police fields. There is an optional content-chunk callback for the Retell transport.', tags: ['execution flow', 'extraction', 'completion'] },
  { p: '95%', q: 'How does urgent escalation work?', short: 'The manager escalates if `injuriesReported === true` or if selected injury/incident text patterns indicate severe harm (for example ambulance, hospital, rollover, fire, fatal). It sets the step to `escalation`, creates a claim reference, logs an escalation record, and returns an `escalate` action.', deep: 'Say what exists, then the gap: this is deterministic guardrail code, but it is not an audited safety workflow. It needs reviewed rules, alerting, durable disposition persistence, and operational ownership.', tags: ['safety', 'insurance', 'escalation'] },
  { p: '95%', q: 'How is policy verification handled?', short: 'It requires a policy number and caller name. The deterministic service reads local fixture policies, normalizes input, and uses fuzzy name matching. Two failed attempts produce the callback-offer terminal branch.', deep: 'Do not claim a live policy-core integration. This is prototype-local `policies.json`; fuzzy identity matching is a production risk and should be replaced with an authenticated policy system and explicit ambiguity handling.', tags: ['policy', 'verification', 'security'] },
  { p: '80%', q: 'How does Gemini streaming work here?', short: 'The Gemini adapter calls native `streamGenerateContent` with `alt=sse`, parses SSE events, accumulates text, passes chunks to the optional callback, and makes one retry for selected transient status codes.', deep: 'The system asks for JSON MIME type but does not send `responseJsonSchema`; output is parsed by `JSON.parse` with a best-effort object extractor. That is a major production hardening opportunity.', tags: ['Gemini', 'SSE', 'streaming', 'JSON schema'] },
  { p: '80%', q: 'How do you keep latency low?', short: 'The main path makes one model call per normal turn, uses streaming callbacks, and holds deterministic business logic in process. Local policy/rule checks are fast. But the code has real tail-risk: Gemini can retry, then optional Groq can be tried.', deep: 'No controlled benchmark is committed. Quote the latency audit as estimates, not measurements. Add p50/p95/p99 for provider connect, first byte, first forwarded text, completion, and persistence without logging plaintext PII.', tags: ['latency', 'voice AI', 'observability'] },
  { p: '80%', q: 'How does persistence work—and what is risky?', short: 'Runtime composes a multi-logger that tries local JSON and Google Sheets in parallel; failures can be copied to a local outbox file. A notification decorator attempts Resend email. Some manager branches await logging; normal completion launches logging in the background.', deep: 'This is not transactional: local JSON is a read-modify-write pattern, the lock is process-local, Sheets failures can be swallowed, and claim numbers are process-local. Production needs a database transaction/outbox, idempotency, and workers.', tags: ['Promise.allSettled', 'outbox', 'Google Sheets', 'race conditions'] },
  { p: '80%', q: 'How do you handle user interruption / barge-in?', short: 'The WebSocket path tracks monotonically increasing response IDs and passes an abort signal into the manager/provider. The Gemini adapter wires a parent abort signal to its fetch controller.', deep: 'The source has the ingredients, but it should be verified against Retell’s current protocol. A stale response guard after awaiting does not erase all cost or guarantee perfect audio semantics; replay tests are the next step.', tags: ['Retell', 'barge-in', 'AbortController', 'WebSocket'] },
  { p: '80%', q: 'What are the top production risks?', short: 'PII/log exposure, insufficient auth, incomplete FSM enforcement, non-atomic persistence, no hard JSON schema, long provider retry tails, and process-local state/concurrency controls.', deep: 'Use the known-issues document as evidence. Frame Redis, queues, database outbox, tracing, and rate limiting as Production Improvements—not features that already exist.', tags: ['production', 'security', 'Redis', 'outbox'] }
];

const concepts = [
  ['Redis', 'Not implemented. Production Improvement for shared session state, rate limits, and distributed turn coordination.'],
  ['Outbox', 'Partially approximated by local fallback JSON. Not a durable transactional outbox.'],
  ['JSON Schema', 'JSON MIME type is requested; `responseJsonSchema` is not currently passed.'],
  ['Retell', 'Receives and emits Custom LLM WebSocket JSON; Retell owns speech recognition/synthesis.'],
  ['WebSockets', 'Used for Retell transcript/response exchange on the same HTTP server as Express.'],
  ['Race conditions', 'HTTP turn serialization and JSON persistence need stronger multi-process protection.'],
  ['Promise.allSettled', 'Used by `MultiClaimLogger` to detect partial logger failures without rejecting all results.'],
  ['VAD', 'Voice activity detection is owned by the telephony/voice layer, not the FNOL manager.'],
  ['Tool calling', 'Provider contract allows tools, but active FNOL extraction relies on JSON output rather than active business tool calls.']
].map(([title, copy]) => ({ title, copy }));

const navGroups = [
  ['Navigate', [['briefing', '✦', 'Briefing'], ['files', '□', 'Repository'], ['architecture', '⌘', 'Architecture'], ['fsm', '◇', 'FSM explorer']]],
  ['Prepare', [['questions', '!', 'Question bank'], ['review', '◷', 'Rapid review'], ['voice', '≈', 'Voice & AI'], ['production', '+', 'Production thinking'], ['debug', '×', 'Debugging']]],
  ['Practice', [['mock', '→', 'Mock interview'], ['panic', '⚑', 'Panic mode'], ['docs', '↗', 'Source chapters']]]
];

const flowNodes = [
  ['Caller', 'A caller speaks or types a report.'], ['Retell / Browser', 'Retell supplies transcript events over WebSocket; browser demo posts text over HTTP.'], ['server.ts', 'Validates, resolves a session, and dispatches the manager.'], ['ConversationManager', 'Owns merge, deterministic branching, and actions.'], ['Extract service', 'Builds context, calls provider, parses response and slots.'], ['Gemini / Groq', 'Gemini is primary; Groq is optional fallback.'], ['Policy + Rules', 'Local verification, field requirements, escalation, and service rules.'], ['Persistence', 'Local JSON plus attempted Google Sheets; notification decorator then Resend.'], ['Caller response', 'Text fragments / final response are sent back to Retell or browser.']
];
const states = [
  ['greeting', 'Initial greeting is in the declared type; initial state begins at `safety_check` in manager code.'], ['safety_check', 'Normal first turn progresses to verification or collection depending on verification state.'], ['verification', 'The manager verifies only once both policy number and caller name exist.'], ['collecting_fnol', 'Fields are tracked from the required-field contract.'], ['clarifying', 'Used when validation adds a pending clarification.'], ['recommending_services', 'Reached after verified and complete claim has one or more deterministic recommendations.'], ['escalation', 'Terminal urgent branch; future turns return escalation messaging.'], ['callback_offer', 'Terminal path after two failed verification attempts.'], ['completed', 'Completion branch; later user messages produce final acknowledgements.'], ['reviewing_summary', 'Declared but not actively assigned by the present manager.'], ['confirming', 'Declared but not actively assigned by the present manager.']
];

let selectedResult = 0;
let paletteItems = [];
let deferredInstallPrompt;

function route() { return decodeURIComponent(location.hash.slice(1) || 'briefing'); }
function go(to, replace = false) { if (replace) { history.replaceState(null, '', `#${encodeURIComponent(to)}`); render(); } else location.hash = to; }
function setCrumbs(value) { $('#crumbs').textContent = `Cockpit / ${value}`; }
function renderNav() {
  $('#rail-nav').innerHTML = navGroups.map(([label, items]) => `<section class="nav-section"><p class="nav-label">${label}</p>${items.map(([id, icon, title]) => `<button class="nav-item ${route() === id ? 'active' : ''}" data-route="${id}" type="button"><span class="nav-symbol">${icon}</span>${title}</button>`).join('')}</section>`).join('');
}
function button(label, action, secondary = false) { return `<button class="${secondary ? 'secondary-button' : 'primary-button'}" data-action="${action}" type="button">${label}</button>`; }
function pageHeader(kicker, title, copy, label = 'Repository fact') { return `<header class="page-header"><div><p class="kicker">${kicker}</p><h1>${title}</h1><p>${copy}</p></div><span class="fact-label">${label}</span></header>`; }
function questionMarkup(question, simpleOnly = false) { return `<article class="question-card"><span class="prob">${question.p} probability</span><h2>${question.q}</h2><p>${question.short}</p>${!simpleOnly ? `<details><summary>Interview-level explanation</summary><div class="answer"><p>${question.deep}</p><p><strong>Common mistake:</strong> Describe a planned production architecture as if it already ships.</p></div></details>` : ''}<div>${question.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div></article>`; }

function briefing() {
  setCrumbs('Briefing');
  return `<section class="hero"><p class="kicker">A repository-grounded interview reference</p><h1>Know the system before the question lands.</h1><p class="hero-copy">A keyboard-first cockpit for the Meridian Motor Insurance FNOL voice-agent prototype. Search a file, method, constraint, or production idea—then answer from the evidence, not from memory.</p><div class="hero-actions">${button('Search everything  ⌘ K', 'search')}${button('Open 30-second review', 'route:review', true)}${button('Show panic answers', 'route:panic', true)}</div></section><section class="brief-grid"><div><h2 class="section-heading">High-yield answers <small>start here</small></h2><div class="answer-list">${questions.slice(0, 5).map((q, index) => `<button class="answer-row" data-question="${index}" type="button"><span class="prob">${q.p}</span><span><span class="answer-title">${q.q}</span><span class="answer-source">${q.tags.slice(0, 3).join(' · ')}</span></span><span class="arrow">→</span></button>`).join('')}</div></div><aside class="field-note"><p><strong>How to use this during an interview</strong></p><p>Lead with what the code does. Then name one trade-off. If you describe Redis, an outbox, a queue, or a formal FSM, label it <em>Production Improvement</em>.</p></aside></section><section class="metric-strip"><div class="metric"><strong>1</strong><span>LLM extraction/response call on each normal manager turn</span></div><div class="metric"><strong>2</strong><span>Failed policy checks before the callback-offer branch</span></div><div class="metric"><strong>0</strong><span>Committed database, Redis, queue, or schema-enforced output layer</span></div></section>`;
}

function filesPage(selectedPath) {
  const record = fileRecords.find(item => item.path === selectedPath) || fileRecords[0];
  setCrumbs(`Repository / ${record.path}`);
  return `${pageHeader('Repository explorer', 'Every critical file, in context.', 'Choose a file to see its actual responsibility, collaborators, important methods, and the difference between prototype behavior and the production story.')}
  <div class="explorer-layout"><aside class="explorer-list" aria-label="File explorer">${fileRecords.map(item => `<button class="explorer-item ${item.path === record.path ? 'active' : ''}" type="button" data-file="${item.path}"><span>${item.path.replace('src/', '')}</span><span>→</span></button>`).join('')}</aside><article class="record"><p class="record-path">/${record.path}</p><h2>${record.path.split('/').pop()}</h2><p class="record-purpose">${record.purpose}</p><dl class="record-grid"><div><dt>Dependencies</dt><dd>${record.deps}</dd></div><div><dt>Called by</dt><dd>${record.consumers}</dd></div></dl><h3>Important methods & contracts</h3><div class="method-list">${record.methods.map(([name, desc]) => `<div class="method"><code>${name}</code><p>${desc}</p></div>`).join('')}</div><h3>Current limitations</h3><p>${record.limits}</p><aside class="improvement"><strong>Production Improvement</strong><br>${record.improvement}</aside></article></div>`;
}

function architecturePage() {
  setCrumbs('Architecture');
  const detail = flowNodes[0];
  return `${pageHeader('Architecture dashboard', 'A turn, traced end to end.', 'Click a component to rehearse its responsibility. This view separates active implementation from the production changes you should explicitly label as proposals.')}
  <div class="flow-canvas">${flowNodes.map(([name], index) => `<button class="flow-node ${index === 0 ? 'active' : ''}" type="button" data-flow="${index}"><span class="flow-index">${String(index + 1).padStart(2, '0')}</span><span class="flow-name">${name}</span></button>`).join('')}</div><section class="flow-detail" id="flow-detail"><h3>${detail[0]}</h3><p>${detail[1]}</p></section><div class="brief-grid" style="margin-top:3rem"><div><h2 class="section-heading">What is implemented <small>say this plainly</small></h2><div class="method-list"><div class="method"><code>Transport split</code><p>Browser demo uses HTTP while Retell uses WebSocket JSON. Neither path processes raw audio in this repository.</p></div><div class="method"><code>LLM boundary</code><p>Gemini (with optional Groq fallback) returns JSON-ish text carrying both caller-facing language and extracted data.</p></div><div class="method"><code>Rules boundary</code><p>Manager code—not the LLM—owns verification, field completeness, escalation, service recommendations, and completion.</p></div></div></div><aside class="field-note"><p><strong>Architecture caveat</strong></p><p>The service is a single process with in-memory session state. It is a prototype, not a stateless horizontally scaled deployment.</p></aside></div>`;
}

function fsmPage() {
  setCrumbs('FSM explorer');
  return `${pageHeader('FSM explorer', 'The intended states—and the executed graph.', 'The type declares the vocabulary below. The manager applies only some transitions; that distinction is an excellent staff-level observation.', 'Implementation caveat')}
  <div class="fsm-grid">${states.map(([state, description], index) => `<button type="button" class="state-card ${index === 1 ? 'active' : ''}" data-state="${index}"><code>${state}</code><span>${description}</span></button>`).join('')}</div><section class="flow-detail" id="state-detail" style="margin-top:1.3rem"><h3>${states[1][0]}</h3><p>${states[1][1]}</p></section><article class="record" style="margin-top:2.5rem"><h3>Turn ordering that matters</h3><ol><li>Extract and merge a validated claim patch.</li><li>Escalation preempts normal policy/completion flow.</li><li>Verification needs policy number plus caller name; two failures offer a callback.</li><li>Verified + complete invokes deterministic recommendations once; subsequent complete turn uses the completion helper.</li></ol><aside class="improvement"><strong>Production Improvement</strong><br>Represent events and guards in one transition table, test every allowed and forbidden edge, and persist an idempotent state/version with the claim outcome.</aside></article>`;
}

function questionsPage(filter = 'all') {
  setCrumbs('Question bank');
  const visible = filter === 'all' ? questions : questions.filter(item => item.p === filter);
  return `${pageHeader('Question bank', 'Answers with enough depth to defend.', 'Open the deeper explanation only after you can state the short answer without looking.')}
  <div class="review-nav"><button type="button" class="chip-button ${filter === 'all' ? 'active' : ''}" data-filter="all">All</button><button type="button" class="chip-button ${filter === '95%' ? 'active' : ''}" data-filter="95%">95% likely</button><button type="button" class="chip-button ${filter === '80%' ? 'active' : ''}" data-filter="80%">80% likely</button></div>${visible.map(questionMarkup).join('')}`;
}

const reviewSets = {
  '30': ['The LLM extracts and speaks; deterministic manager code makes insurance decisions.', 'The server hosts both HTTP browser chat and Retell WebSocket transport.', 'Verified policy plus complete required fields is the normal completion gate.', 'In-memory state, local JSON, and Sheets are prototype choices—not production systems.', 'Ask for observability and replay tests before changing critical FNOL logic.'],
  '2': ['Explain transport: browser → HTTP; Retell → WebSocket transcript events.', 'Explain orchestration: manager → extractor → validated patch → deterministic branches.', 'Explain safety: injury/severe patterns preempt normal flow.', 'Explain verification: local policy fixture + caller name; two failures means callback offer.', 'Explain persistence honestly: local JSON + attempted Sheets/notification, no transaction.'],
  '5': ['Start with the 30-second architecture answer.', 'Walk the normal turn order and service recommendation pass.', 'Read the top risks: PII, auth, FSM mismatch, schema, races, retry tails.', 'Rehearse Gemini SSE and the lack of responseJsonSchema.', 'Rehearse Retell interruption story and caveat about protocol validation.', 'Map every production idea to a concrete risk: Redis, database/outbox, queue, tracing, auth.', 'Use “Production Improvement” as an explicit verbal label.'],
  '15': ['Architecture + end-to-end flow.', 'All 95% questions.', 'Repository explorer: server, runtime, manager, extractor, Gemini, logger.', 'FSM explorer and required fields.', 'Production risks and how you would evolve them.', 'Run a short mock interview, then use Panic mode for recall.']
};
function reviewPage(selected = '30') {
  setCrumbs('Rapid review');
  return `${pageHeader('Staff-level cheat sheet', 'Review at the speed you have.', 'These are evidence-based recall paths, not new system behavior.')}
  <div class="review-nav">${[['30', '30 sec'], ['2', '2 min'], ['5', '5 min'], ['15', '15 min']].map(([key, label]) => `<button type="button" class="chip-button ${key === selected ? 'active' : ''}" data-review="${key}">${label}</button>`).join('')}</div><article class="review-card"><p class="kicker">${selected === '30' ? 'Just before the call' : `${selected}-minute rehearsal`}</p><h2>${selected === '30' ? 'Five mental anchors.' : 'A focused rehearsal plan.'}</h2><ol>${reviewSets[selected].map(item => `<li>${item}</li>`).join('')}</ol></article>`;
}

function productionPage() {
  setCrumbs('Production thinking');
  const items = [['State / scaling', 'Current sessions live in an in-memory `Map`; move state and turn versioning to a shared store.'], ['Durability', 'Replace local JSON and best-effort Sheets with a database transaction plus outbox event.'], ['Concurrency', 'Use idempotency keys and distributed coordination instead of process-local locks.'], ['Security', 'Authenticate chat/socket/logs, redact PII, add retention rules and secret handling.'], ['LLM safety', 'Enforce a structured schema, validate every patch, and isolate caller content from instructions.'], ['Observability', 'Add request tracing plus latency/error/field-completion metrics without transcript PII.']];
  return `${pageHeader('Production thinking', 'Turn prototype trade-offs into an engineering plan.', 'Every item below is a proposal derived from a current limitation. It is deliberately not presented as something already deployed.', 'Production Improvement')}
  <div class="method-list">${items.map(([title, copy]) => `<div class="method"><code>${title}</code><p>${copy}</p></div>`).join('')}</div>`;
}

function voicePage() {
  setCrumbs('Voice & AI');
  return `${pageHeader('Voice & AI', 'The pieces of the voice pipeline.', 'Use this to separate what Retell owns, what the application owns, and what Gemini contributes.')}
  <div class="record"><div class="record-grid"><div><dt>STT / TTS</dt><dd>Retell and the browser platform own conversion; this server handles text-oriented events.</dd></div><div><dt>VAD / Barge-in</dt><dd>Voice layer detects turn changes; code tracks response IDs and passes abort signals downstream.</dd></div><div><dt>Gemini</dt><dd>Primary native SSE provider; returns response text that is parsed into response and extraction slots.</dd></div><div><dt>Schema</dt><dd>JSON MIME type is requested, but active code does not send a response JSON schema.</dd></div></div><h3>Latency story</h3><p>Do not quote an invented target. The repository contains an audit with estimates and code-level timing metadata. The important bottleneck is remote LLM generation on normal turns; retries and optional fallback can extend the tail.</p><h3>Hallucination prevention</h3><p>The model may suggest language and extract a patch, but deterministic code verifies a local policy, calculates missing fields, escalates injury/severe incidents, recommends services, and controls completion. Validation is present but needs stronger schema enforcement.</p></div>`;
}

function debugPage() {
  setCrumbs('Debugging');
  const bugs = [['Caller hears an awkward/empty reply', 'Inspect provider response/JSON parsing path.', 'The response uses `responseToUser`; malformed or missing JSON falls back to a generic repeat request.', 'src/services/extractClaimData.ts, src/llm/gemini.ts'], ['Claim does not complete', 'Check verified policy and `missingFields`.', 'Completion requires a verified policy and all base/conditional field requirements; service recommendation can require an extra turn.', 'ConversationManager.ts, requiredFields.ts'], ['Policy verification fails unexpectedly', 'Inspect normalized policy and caller name.', 'Prototype verification uses local fixture policies and fuzzy name matching; it is not live policy data.', 'verifyPolicy.ts, policies.json'], ['Voice turn takes too long', 'Inspect provider retries and fallback.', 'Gemini retry plus optional Groq fallback lengthens tails; no controlled benchmark is committed.', 'gemini.ts, groq.ts, fallback.ts'], ['Persistence is partial', 'Check local logger, Sheets, and outbox logs.', 'Current persistence is not transactional; some external failures are recovered or swallowed.', 'runtime.ts, claimLogger.ts, googleSheets.ts']];
  return `${pageHeader('Debugging handbook', 'Start with observable symptoms.', 'A concise symptom → cause → file path index for live walkthrough questions.')}${bugs.map(([symptom, logs, root, files]) => `<article class="question-card"><h2>${symptom}</h2><p><strong>Inspect:</strong> ${logs}</p><p><strong>Likely root cause:</strong> ${root}</p><span class="tag">${files}</span></article>`).join('')}`;
}

function panicPage() {
  setCrumbs('Panic mode');
  return `${pageHeader('Panic mode', 'Only the answers. No detours.', 'Twenty seconds per answer. If needed, use search for the evidence behind it.', 'High probability')}
  <div class="panic-list">${questions.concat(questions).slice(0, 20).map(question => questionMarkup(question, true)).join('')}</div>`;
}

function mockPage() {
  setCrumbs('Mock interview');
  const sample = questions[Math.floor(Math.random() * questions.length)];
  return `${pageHeader('Mock interview', 'Practice pressure, not prose.', 'Choose a level, get a repository-grounded question, then reveal the evaluator notes.')}
  <div class="review-nav">${['Junior', 'Senior', 'Staff', 'Principal', 'SRE', 'Voice AI', 'Insurance', 'LLM', 'System Design'].map(level => `<button class="chip-button" type="button" data-mock="${level}">${level}</button>`).join('')}</div><section id="mock-output">${mockOutput('Staff', sample)}</section>`;
}
function mockOutput(level, question) { return `<article class="review-card"><p class="kicker">${level} round</p><h2>${question.q}</h2><p>Answer aloud in 90 seconds. First describe current behavior; then name one limitation and one production evolution.</p><details><summary>Evaluator notes</summary><div class="answer"><p><strong>Core answer:</strong> ${question.short}</p><p><strong>Depth:</strong> ${question.deep}</p></div></details></article>`; }

function docsPage(selectedId = '00-start-here') {
  const mod = modules.find(item => item.id === selectedId) || modules[0];
  setCrumbs(`Source chapters / ${mod.title}`);
  return `${pageHeader('Source chapters', mod.title, 'Original handbook chapters remain available as supporting material. The cockpit’s curated records call out where old prose differs from current source.')}
  <div class="explorer-layout"><aside class="explorer-list">${modules.map(item => `<button class="explorer-item ${item.id === mod.id ? 'active' : ''}" data-doc="${item.id}" type="button"><span>${item.title}</span><span>→</span></button>`).join('')}</aside><article id="doc-content" class="markdown-view"><p>Loading chapter…</p></article></div>`;
}

function simpleMarkdown(raw) {
  const escaped = escapeHtml(raw).replace(/\r/g, '');
  const blocks = escaped.split(/\n{2,}/).map(block => {
    if (/^```/.test(block)) return `<pre><code>${block.replace(/^```[^\n]*\n?|```$/g, '')}</code></pre>`;
    if (/^###\s/.test(block)) return `<h3>${block.replace(/^###\s/, '')}</h3>`;
    if (/^##\s/.test(block)) return `<h2>${block.replace(/^##\s/, '')}</h2>`;
    if (/^#\s/.test(block)) return `<h1>${block.replace(/^#\s/, '')}</h1>`;
    if (/^&gt;/.test(block)) return `<blockquote>${block.replace(/^&gt;\s?/gm, '').replace(/\n/g, '<br>')}</blockquote>`;
    if (/^(?:[-*]|\d+\.)\s/m.test(block)) return `<ul>${block.split('\n').filter(Boolean).map(line => `<li>${line.replace(/^(?:[-*]|\d+\.)\s+/, '')}</li>`).join('')}</ul>`;
    return `<p>${block.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`;
  });
  return blocks.join('');
}
async function loadDoc(id) {
  const target = $('#doc-content');
  if (!target) return;
  try { const response = await fetch(`content/${id}.md`); if (!response.ok) throw new Error('not found'); target.innerHTML = simpleMarkdown(await response.text()); }
  catch { target.innerHTML = '<p>This supporting chapter is unavailable offline. The cockpit records remain available.</p>'; }
}

function render() {
  renderNav();
  const value = route(); const [kind, extra] = value.split(':'); let output;
  if (kind === 'briefing') output = briefing();
  else if (kind === 'files') output = filesPage(extra);
  else if (kind === 'architecture') output = architecturePage();
  else if (kind === 'fsm') output = fsmPage();
  else if (kind === 'questions') output = questionsPage(extra || 'all');
  else if (kind === 'review') output = reviewPage(extra || '30');
  else if (kind === 'production') output = productionPage();
  else if (kind === 'voice') output = voicePage();
  else if (kind === 'debug') output = debugPage();
  else if (kind === 'panic') output = panicPage();
  else if (kind === 'mock') output = mockPage();
  else if (kind === 'docs') output = docsPage(extra || '00-start-here');
  else { go('briefing', true); return; }
  $('#main').innerHTML = output;
  if (kind === 'docs') loadDoc(extra || '00-start-here');
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('#main').focus({ preventScroll: true });
}

function searchCorpus() {
  return [
    ...fileRecords.map(item => ({ type: 'File', icon: '□', title: item.path, copy: `${item.purpose} ${item.methods.map(method => method[0]).join(' ')}`, route: `files:${item.path}` })),
    ...questions.map((item, index) => ({ type: `${item.p} question`, icon: '!', title: item.q, copy: `${item.short} ${item.tags.join(' ')}`, route: `questions:all`, question: index })),
    ...concepts.map(item => ({ type: 'Concept', icon: '◇', title: item.title, copy: item.copy, route: item.title === 'Redis' || item.title === 'Outbox' ? 'production' : item.title === 'Retell' || item.title === 'VAD' ? 'voice' : 'architecture' })),
    ...modules.map(item => ({ type: 'Source chapter', icon: '↗', title: item.title, copy: item.detail, route: `docs:${item.id}` }))
  ];
}
function score(item, query) { const haystack = `${item.title} ${item.copy}`.toLowerCase(); const needle = query.toLowerCase(); if (item.title.toLowerCase() === needle) return 100; if (item.title.toLowerCase().startsWith(needle)) return 75; if (haystack.includes(needle)) return 45; return -1; }
function updatePalette(query = '') {
  const corpus = searchCorpus();
  paletteItems = (query ? corpus.map(item => ({ item, rank: score(item, query) })).filter(x => x.rank >= 0).sort((a, b) => b.rank - a.rank).map(x => x.item) : corpus.slice(0, 11)).slice(0, 18);
  selectedResult = Math.min(selectedResult, Math.max(0, paletteItems.length - 1));
  const grouped = paletteItems.reduce((groups, item, index) => { (groups[item.type] ||= []).push({ item, index }); return groups; }, {});
  $('#palette-results').innerHTML = paletteItems.length ? Object.entries(grouped).map(([type, entries]) => `<div class="result-group-label">${type}</div>${entries.map(({ item, index }) => `<button class="palette-result ${index === selectedResult ? 'selected' : ''}" data-result="${index}" type="button" role="option" aria-selected="${index === selectedResult}"><span class="result-icon">${item.icon}</span><span><span class="result-title">${item.title}</span><span class="result-copy">${item.copy}</span></span><span class="result-kind">${item.type}</span></button>`).join('')}`).join('') : '<p class="palette-help">No evidence found. Try a filename, a method, or a concept.</p>';
}
function openPalette() { $('#palette-backdrop').hidden = false; $('#command-palette').hidden = false; const input = $('#palette-input'); input.value = ''; selectedResult = 0; updatePalette(); setTimeout(() => input.focus(), 0); }
function closePalette() { $('#palette-backdrop').hidden = true; $('#command-palette').hidden = true; $('#command-trigger').focus(); }
function chooseResult(index = selectedResult) { const result = paletteItems[index]; if (!result) return; closePalette(); go(result.route); if (result.question !== undefined) setTimeout(() => document.querySelectorAll('.question-card')[result.question]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 90); }
function toast(message) { const node = $('#toast-template').content.firstElementChild.cloneNode(true); node.textContent = message; document.body.append(node); setTimeout(() => node.remove(), 2400); }

document.addEventListener('click', event => {
  const target = event.target.closest('[data-route], [data-action], [data-file], [data-doc], [data-filter], [data-review], [data-question], [data-flow], [data-state], [data-result], [data-mock]'); if (!target) return;
  if (target.dataset.route) go(target.dataset.route);
  if (target.dataset.action === 'search') openPalette();
  if (target.dataset.action?.startsWith('route:')) go(target.dataset.action.slice(6));
  if (target.dataset.file) go(`files:${target.dataset.file}`);
  if (target.dataset.doc) go(`docs:${target.dataset.doc}`);
  if (target.dataset.filter) go(`questions:${target.dataset.filter}`);
  if (target.dataset.review) go(`review:${target.dataset.review}`);
  if (target.dataset.question !== undefined) { go('questions:all'); setTimeout(() => document.querySelectorAll('.question-card')[Number(target.dataset.question)]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); }
  if (target.dataset.flow !== undefined) { const item = flowNodes[Number(target.dataset.flow)]; document.querySelectorAll('.flow-node').forEach(node => node.classList.toggle('active', node === target)); $('#flow-detail').innerHTML = `<h3>${item[0]}</h3><p>${item[1]}</p>`; }
  if (target.dataset.state !== undefined) { const item = states[Number(target.dataset.state)]; document.querySelectorAll('.state-card').forEach(node => node.classList.toggle('active', node === target)); $('#state-detail').innerHTML = `<h3>${item[0]}</h3><p>${item[1]}</p>`; }
  if (target.dataset.result !== undefined) chooseResult(Number(target.dataset.result));
  if (target.dataset.mock) { const candidates = target.dataset.mock === 'Voice AI' ? questions.filter(q => q.tags.includes('voice AI') || q.tags.includes('Retell')) : questions; $('#mock-output').innerHTML = mockOutput(target.dataset.mock, candidates[Math.floor(Math.random() * candidates.length)]); }
});

$('#command-trigger').addEventListener('click', openPalette);
$('#palette-backdrop').addEventListener('click', closePalette);
$('#palette-input').addEventListener('input', event => { selectedResult = 0; updatePalette(event.target.value); });
$('#menu-button').addEventListener('click', () => $('#rail').classList.toggle('open'));
window.addEventListener('hashchange', () => { $('#rail').classList.remove('open'); render(); });
document.addEventListener('keydown', event => {
  const paletteOpen = !$('#command-palette').hidden; const target = event.target;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen ? closePalette() : openPalette(); return; }
  if (event.key === 'Escape' && paletteOpen) { event.preventDefault(); closePalette(); return; }
  if (event.key === '?' && !paletteOpen && target.tagName !== 'INPUT') { event.preventDefault(); openPalette(); $('#palette-input').value = ''; updatePalette(''); toast('Search supports files, methods, concepts, and questions.'); return; }
  if (event.key === '/' && !paletteOpen && !['INPUT', 'TEXTAREA'].includes(target.tagName)) { event.preventDefault(); openPalette(); return; }
  if (paletteOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); selectedResult = (selectedResult + (event.key === 'ArrowDown' ? 1 : -1) + paletteItems.length) % Math.max(1, paletteItems.length); updatePalette($('#palette-input').value); return; }
  if (paletteOpen && event.key === 'Enter') { event.preventDefault(); chooseResult(); return; }
  if (!paletteOpen && !['INPUT', 'TEXTAREA'].includes(target.tagName) && /^[1-9]$/.test(event.key)) {
    const shortcuts = ['briefing', 'files', 'architecture', 'fsm', 'questions', 'review', 'voice', 'production', 'panic'];
    go(shortcuts[Number(event.key) - 1]);
  }
  if (!paletteOpen && !['INPUT', 'TEXTAREA'].includes(target.tagName) && event.key === 'ArrowLeft') history.back();
  if (!paletteOpen && !['INPUT', 'TEXTAREA'].includes(target.tagName) && event.key === 'ArrowRight') history.forward();
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; $('#install-button').hidden = false; });
$('#install-button').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = undefined; $('#install-button').hidden = true; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
if (!location.hash) go('briefing', true); else render();
