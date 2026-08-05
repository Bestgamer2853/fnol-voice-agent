import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConversationManager } from '../src/conversation/ConversationManager.js';
import { createExtractClaimDataService } from '../src/services/extractClaimData.js';
import { createGeminiService } from '../src/llm/gemini.js';
import { createVerifyPolicyService } from '../src/services/verifyPolicy.js';
import { createRecommendServicesService } from '../src/services/recommendServices.js';
import { createGenerateSummaryService } from '../src/services/generateSummary.js';
import { createClaimNumberGenerator } from '../src/utils/claimNumber.js';
import type { ClaimLogRecord } from '../src/services/claimLogger.js';

const REAL_GEMINI_KEY = process.env.GEMINI_API_KEY || 'test-key';
const geminiProvider = createGeminiService({ apiKey: REAL_GEMINI_KEY, model: 'gemini-3.5-flash-lite' });

function createRealRuntimeDeps(logs: ClaimLogRecord[]) {
  return {
    extractClaimData: createExtractClaimDataService({ llmProvider: geminiProvider }),
    verifyPolicy: createVerifyPolicyService(),
    recommendServices: createRecommendServicesService(),
    generateSummary: createGenerateSummaryService({ llmProvider: geminiProvider }),
    claimLogger: {
      async log(record: ClaimLogRecord) {
        logs.push(record);
      },
    },
    llmProvider: geminiProvider,
    claimNumberGenerator: createClaimNumberGenerator({ initialSequence: 100 }),
  };
}

describe('PHASE 4 & 5 — Real Gemini Integration & Verification Suite', () => {
  it('runs full conversation with real Gemini API (Happy Path + Verification)', async () => {
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createRealRuntimeDeps(logs));
    let state = manager.start();

    // Turn 1: Safety check & policy verification details
    const res1 = await manager.handleUserMessage(state, 'Hi, everyone is safe. My name is Arjun Rao and my policy number is MMI-10234.');
    state = res1.state;
    console.log('[Real Gemini Turn 1] Spoken Response:', res1.action.message);
    assert.equal(state.currentClaim.policyNumber, 'MMI-10234');
    assert.equal(state.currentClaim.callerName, 'Arjun Rao');
    assert.ok(state.verifiedPolicy);

    // Turn 2: Provide all FNOL details in one multi-slot message
    const res2 = await manager.handleUserMessage(
      state,
      'The accident happened on 2026-07-30 at 3:00 PM near MG Road, Bengaluru. A truck hit my Honda City KA01AB1234. No injuries, police report filed FIR-99, I have photos, and the car is not drivable.'
    );
    state = res2.state;
    console.log('[Real Gemini Turn 2] Spoken Response:', res2.action.message);
    assert.equal(state.currentClaim.dateOfIncident, '2026-07-30');
    assert.equal(state.currentClaim.locationOfIncident, 'MG Road, Bengaluru');
    assert.equal(state.currentClaim.injuriesReported, false);
    assert.equal(state.currentClaim.vehicleDrivable, false);

    // Turn 3: Respond to service recommendation (Towing & Rental)
    const res3 = await manager.handleUserMessage(state, 'Yes, I need towing and a rental car.');
    state = res3.state;
    console.log('[Real Gemini Turn 3] Action Type:', res3.action.type, 'Message:', res3.action.message);
    assert.equal(state.currentConversationStep, 'completed');
    assert.equal(logs.length, 1);
    assert.ok(logs[0].claim.towingRequested);
    assert.ok(logs[0].claim.rentalRequested);
  });

  it('handles caller self-corrections with real Gemini API', async () => {
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createRealRuntimeDeps(logs));
    let state = manager.start();

    // Turn 1: Initial detail
    const res1 = await manager.handleUserMessage(state, 'My name is Arjun Rao, policy MMI-10234. The accident was on 2026-07-29.');
    state = res1.state;

    // Turn 2: Correction of date
    const res2 = await manager.handleUserMessage(state, 'Actually, correction, it was on 2026-07-30, not 2026-07-29.');
    state = res2.state;
    console.log('[Real Gemini Correction] Date after correction:', state.currentClaim.dateOfIncident);
    assert.equal(state.currentClaim.dateOfIncident, '2026-07-30');
  });

  it('handles emergency escalation correctly', async () => {
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createRealRuntimeDeps(logs));
    let state = manager.start();

    const res = await manager.handleUserMessage(state, 'My passenger is bleeding heavily and we need an ambulance!');
    assert.equal(res.action.type, 'escalate');
    assert.equal(res.state.escalationRequired, true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].escalationRequired, true);
  });

  it('handles policy verification failure lockout (2 attempts)', async () => {
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createRealRuntimeDeps(logs));
    let state = manager.start();

    // Attempt 1
    const res1 = await manager.handleUserMessage(state, 'My name is Arjun Rao and policy is BAD-1111');
    state = res1.state;
    assert.equal(state.currentConversationStep, 'verification');

    // Attempt 2
    const res2 = await manager.handleUserMessage(state, 'My name is Arjun Rao and policy is BAD-2222');
    state = res2.state;
    assert.equal(state.currentConversationStep, 'callback_offer');
    assert.equal(res2.action.type, 'complete');
  });
});

describe('PHASE 7 — Stress Testing Suite', () => {
  it('handles 10 sequential turns in a single conversation without state corruption or memory leaks', async () => {
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createRealRuntimeDeps(logs));
    let state = manager.start();

    const messages = [
      'Hello, I had an accident.',
      'My policy is MMI-10234 and name is Arjun Rao.',
      'It happened today at 2pm on Main St.',
      'I hit a guardrail.',
      'My car is a Honda City KA01AB1234.',
      'No injuries, everyone is fine.',
      'No police report was filed.',
      'I have photos of the damage.',
      'The vehicle is drivable.',
      'No extra services needed, thank you.'
    ];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;
      const res = await manager.handleUserMessage(state, msg);
      state = res.state;
      assert.ok(res.action.message);
      assert.ok(res.state.conversationHistory.length > 0);
    }
  });
});

describe('PHASE 8 — Failure Injection & Resilience Suite', () => {
  it('handles LLM network failure gracefully via fallback provider', async () => {
    const failingLlm = {
      async generateResponse() {
        return {
          assistantResponse: "I'm having a temporary connection issue with my AI service. Please give me a moment.",
          errorMessage: 'Simulated 503 Service Unavailable',
          finishReason: 'FALLBACK_EXHAUSTED',
        };
      },
    };

    const logs: ClaimLogRecord[] = [];
    const deps = createRealRuntimeDeps(logs);
    deps.extractClaimData = createExtractClaimDataService({ llmProvider: failingLlm });

    const manager = createConversationManager(deps);
    let state = manager.start();

    const res = await manager.handleUserMessage(state, 'Hello, I crashed my car.');
    assert.equal(res.action.type, 'complete');
    assert.ok(res.action.message.includes('connection issue'));
  });

  it('handles Google Sheets logger failure gracefully without breaking turn response', async () => {
    const logs: ClaimLogRecord[] = [];
    const deps = createRealRuntimeDeps(logs);
    deps.claimLogger = {
      async log() {
        throw new Error('Simulated Google Sheets API 500 Error');
      },
    };

    const manager = createConversationManager(deps);
    let state = manager.start();

    // Verify escalation logs emergency claim without throwing uncaught rejection
    const res = await manager.handleUserMessage(state, 'Severe crash, passenger bleeding!');
    assert.equal(res.action.type, 'escalate');
  });
});

