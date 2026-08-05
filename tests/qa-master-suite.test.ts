import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConversationManager, type ConversationManagerDependencies } from '../src/conversation/ConversationManager.js';
import type { ConversationState } from '../src/conversation/ConversationState.js';
import type { ExtractClaimDataInput, ExtractClaimDataResult } from '../src/services/extractClaimData.js';
import type { ClaimLogRecord } from '../src/services/claimLogger.js';
import type { Claim } from '../src/types/claim.js';
import type { Policy } from '../src/types/policy.js';

const verifiedPolicy: Policy = {
  policyNumber: 'MMI-10234',
  policyholderName: 'Arjun Rao',
  coverageType: 'Comprehensive',
  towingIncluded: true,
  vehicle: { make: 'Honda', model: 'City', registration: 'KA01AB1234' },
};

type ScriptedTurn = {
  responseToUser: string;
  extractedData?: Partial<Claim> & { confidence?: number };
};

class ScriptedExtractor {
  readonly inputs: ExtractClaimDataInput[] = [];
  constructor(private readonly turns: ScriptedTurn[]) {}

  async extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult> {
    this.inputs.push(input);
    const next = this.turns.shift();
    assert.ok(next, `Unexpected extractor call for: ${input.userMessage}`);
    return {
      responseToUser: next.responseToUser,
      finishReason: 'STOP',
      conversationAnalysis: '',
      debugMetrics: {
        rawExtractedSlots: { confidence: 1, ...(next.extractedData ?? {}) },
        geminiPrompt: '[test]',
        geminiResponse: '[test]',
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
        retries: 0,
      },
    };
  }
}

function createDeps(extractor: ScriptedExtractor, logs: ClaimLogRecord[]): ConversationManagerDependencies {
  return {
    extractClaimData: extractor,
    verifyPolicy: {
      async verify(input) {
        if (input.policyNumber === verifiedPolicy.policyNumber && input.callerName === verifiedPolicy.policyholderName)
          return { verified: true, policy: verifiedPolicy, coverageType: verifiedPolicy.coverageType, towingIncluded: verifiedPolicy.towingIncluded };
        return { verified: false, reason: 'policy_not_found', message: 'Policy not found.' };
      },
    },
    recommendServices: { async recommend() { return { recommendations: [] }; } },
    generateSummary: { async generate(input) { return { summary: 'Summary', severity: input.state.severity ?? 'low' }; } },
    claimLogger: { async log(record) { logs.push(record); } },
    llmProvider: { async generateResponse() { return { assistantResponse: '' }; } },
    claimNumberGenerator: { generate() { return 'CLM-20260805-0001'; } },
  };
}

async function playTurns(turns: ScriptedTurn[], messages: string[]) {
  const extractor = new ScriptedExtractor([...turns]);
  const logs: ClaimLogRecord[] = [];
  const manager = createConversationManager(createDeps(extractor, logs));
  let state = manager.start();
  const actions: string[] = [];
  for (const message of messages) {
    const result = await manager.handleUserMessage(state, message);
    state = result.state;
    actions.push(result.action.type);
  }
  return { actions, state, logs };
}

describe('Escalation Regression Suite', () => {

  it('escalates on "my neck hurts"', async () => {
    const { actions, state } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'My neck hurts' } }],
      ['My neck hurts after the crash'],
    );
    assert.deepEqual(actions, ['escalate']);
    assert.equal(state.severity, 'high');
  });

  it('escalates on "my back hurts"', async () => {
    const { actions, state } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'My back hurts' } }],
      ['My back hurts'],
    );
    assert.deepEqual(actions, ['escalate']);
    assert.equal(state.severity, 'high');
  });

  it('escalates on "blood"', async () => {
    const { actions, state } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'There was bleeding' } }],
      ['There was blood everywhere'],
    );
    assert.deepEqual(actions, ['escalate']);
    assert.equal(state.severity, 'high');
  });

  it('escalates on "hospital"', async () => {
    const { actions, state } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'Went to hospital' } }],
      ['We went to the hospital'],
    );
    assert.deepEqual(actions, ['escalate']);
    assert.equal(state.severity, 'high');
  });

  it('escalates on "ambulance"', async () => {
    const { actions, state } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'Called ambulance' } }],
      ['We called an ambulance'],
    );
    assert.deepEqual(actions, ['escalate']);
    assert.equal(state.severity, 'high');
  });

  it('escalates on "whiplash"', async () => {
    const { actions } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'I have whiplash' } }],
      ['I think I have whiplash'],
    );
    assert.deepEqual(actions, ['escalate']);
  });

  it('escalates on "someone couldn\'t move"', async () => {
    const { actions } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'Passenger could not move, may be broken leg' } }],
      ['My passenger couldn\'t move, I think something is broken'],
    );
    assert.deepEqual(actions, ['escalate']);
  });

  it('escalates on "stiff neck"', async () => {
    const { actions } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'Neck feels stiff' } }],
      ['My neck feels stiff'],
    );
    assert.deepEqual(actions, ['escalate']);
  });

  it('escalates on explicit injuriesReported=true', async () => {
    const { actions, state } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuriesReported: true } }],
      ['Someone got hurt'],
    );
    assert.deepEqual(actions, ['escalate']);
    assert.equal(state.escalationRequired, true);
  });

  it('escalates on "fracture"', async () => {
    const { actions } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { injuryDetails: 'Possible fracture' } }],
      ['I think my arm has a fracture'],
    );
    assert.deepEqual(actions, ['escalate']);
  });

  it('escalates on "severe" incident description', async () => {
    const { actions } = await playTurns(
      [{ responseToUser: 'Escalating.', extractedData: { incidentDescription: 'Severe crash with rollover' } }],
      ['It was a severe crash'],
    );
    assert.deepEqual(actions, ['escalate']);
  });

  it('does NOT escalate on "no injuries, minor dent"', async () => {
    const { actions } = await playTurns(
      [{ responseToUser: 'Got it.', extractedData: { injuriesReported: false, incidentDescription: 'Minor dent on bumper' } }],
      ['No injuries, just a minor dent on the bumper'],
    );
    assert.deepEqual(actions, ['respond']);
  });
});

describe('Verification Retry Regression Suite', () => {

  it('allows FNOL collection after successful verification', async () => {
    const { actions, state } = await playTurns(
      [
        { responseToUser: 'Verified. When did it happen?', extractedData: { policyNumber: 'MMI-10234', callerName: 'Arjun Rao' } },
      ],
      ['My policy is MMI-10234, name Arjun Rao'],
    );
    assert.deepEqual(actions, ['respond']);
    assert.ok(state.verifiedPolicy);
  });

  it('rejects wrong policy + correct name', async () => {
    const { state } = await playTurns(
      [{ responseToUser: 'Cannot verify.', extractedData: { policyNumber: 'BAD-999', callerName: 'Arjun Rao' } }],
      ['My policy is BAD-999, name Arjun Rao'],
    );
    assert.equal(state.verifiedPolicy, undefined);
    assert.equal(state.verificationAttempts, 1);
  });

  it('rejects correct policy + wrong name', async () => {
    const { state } = await playTurns(
      [{ responseToUser: 'Cannot verify.', extractedData: { policyNumber: 'MMI-10234', callerName: 'Wrong Person' } }],
      ['My policy is MMI-10234, name Wrong Person'],
    );
    assert.equal(state.verifiedPolicy, undefined);
    assert.equal(state.verificationAttempts, 1);
  });

  it('offers callback after 2 failed attempts', async () => {
    const { actions, state } = await playTurns(
      [
        { responseToUser: 'Retry.', extractedData: { policyNumber: 'BAD-001', callerName: 'Wrong' } },
        { responseToUser: 'Callback.', extractedData: { policyNumber: 'BAD-002', callerName: 'Wrong' } },
      ],
      ['BAD-001 Wrong', 'BAD-002 Wrong'],
    );
    assert.deepEqual(actions, ['respond', 'complete']);
    assert.equal(state.currentConversationStep, 'callback_offer');
    assert.equal(state.verificationAttempts, 2);
  });

  it('blocks FNOL collection after callback offer', async () => {
    const { actions } = await playTurns(
      [
        { responseToUser: 'Retry.', extractedData: { policyNumber: 'BAD-001', callerName: 'Wrong' } },
        { responseToUser: 'Callback.', extractedData: { policyNumber: 'BAD-002', callerName: 'Wrong' } },
      ],
      ['BAD-001 Wrong', 'BAD-002 Wrong'],
    );
    // After 2 failures, user gets 'complete' (callback_offer) — no more FNOL collection
    assert.equal(actions[1], 'complete');
  });
});
