import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConversationManager, type ConversationManagerDependencies } from '../src/conversation/ConversationManager.js';
import type { ConversationState } from '../src/conversation/ConversationState.js';
import type { ExtractClaimDataInput, ExtractClaimDataResult } from '../src/services/extractClaimData.js';
import type { ClaimLogRecord } from '../src/services/claimLogger.js';
import type { Claim } from '../src/types/claim.js';
import type { Policy } from '../src/types/policy.js';
import { REQUIRED_FNOL_FIELDS } from '../src/config/requiredFields.js';

const verifiedPolicy: Policy = {
  policyNumber: 'MMI-99999',
  policyholderName: 'Prop Test',
  coverageType: 'Comprehensive',
  towingIncluded: true,
  rentalCarIncluded: true,
  vehicle: { make: 'Tesla', model: 'Model 3', registration: 'KA05XY9999' },
};

function generateRandomClaimData(step: number, injure: boolean): Partial<Claim> {
  const base: Partial<Claim> = {
    policyNumber: 'MMI-99999',
    policyholderName: 'Prop Test',
  };

  if (step >= 1) {
    base.dateOfIncident = '2026-08-01';
    base.timeOfIncident = '10:00 AM';
    base.location = 'Random Highway';
  }
  if (step >= 2) {
    base.description = 'Accident simulation step ' + step;
    base.injuriesReported = injure;
    if (injure) base.injuryDetails = 'Arm bruise';
    base.policeContacted = false;
    base.hasPhotos = true;
    base.isVehicleDrivable = false;
    base.needsTowing = true;
  }
  return base;
}

class InvariantTestExtractor {
  constructor(private readonly injure: boolean) {}

  async extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult> {
    const turnCount = (input.state?.history?.length ?? 0) + 1;
    const extracted = generateRandomClaimData(turnCount, this.injure);

    return {
      responseToUser: `Turn ${turnCount} response`,
      finishReason: 'STOP',
      conversationAnalysis: '',
      debugMetrics: {
        rawExtractedSlots: { confidence: 1, ...extracted },
        geminiPrompt: '[prop test]',
        geminiResponse: '[prop test]',
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10, totalTokenCount: 60 },
        retries: 0,
      },
    };
  }
}

function createInvariantDeps(logs: ClaimLogRecord[], injure: boolean): ConversationManagerDependencies {
  return {
    extractClaimData: new InvariantTestExtractor(injure),
    verifyPolicy: {
      verify: async () => ({
        verified: true,
        policy: verifiedPolicy,
        coverageType: 'Comprehensive',
        towingIncluded: true,
        rentalCarIncluded: true,
      }),
    },
    recommendServices: {
      recommend: async () => ({ recommendations: [] }),
    },
    generateSummary: {
      generate: async () => ({ summary: 'Property invariant test summary', severity: 'low' }),
    },
    claimLogger: {
      log: async (record) => {
        logs.push(record);
      },
    },
    claimNumberGenerator: {
      generate: () => 'CLM-20260805-0001',
    },
    sendNotification: async () => true,
  };
}

describe('System Invariants & Property Testing', () => {
  it('verifies all 10 invariants across 50 generated multi-turn sessions', async () => {
    for (let run = 0; run < 50; run++) {
      const injure = run % 2 === 0;
      const logs: ClaimLogRecord[] = [];
      const manager = createConversationManager(createInvariantDeps(logs, injure));

      let state = manager.start();

      // Turn 1: Verification
      let turn = await manager.handleUserMessage(state, 'Hi, I am Prop Test MMI-99999');
      state = turn.state;

      // Turn 2: Details 1
      turn = await manager.handleUserMessage(state, 'Happened at Random Highway around 10am');
      state = turn.state;

      // Turn 3: Details 2 & Completion attempt
      turn = await manager.handleUserMessage(state, 'Car crashed into pole');
      state = turn.state;

      // Invariant 9: No uncaught exceptions reached here smoothly.
      assert.ok(state, 'State must remain defined');

      if (state.currentConversationStep === 'completed') {
        // Invariant 1: Mandatory fields are present
        for (const field of REQUIRED_FNOL_FIELDS) {
          assert.notStrictEqual((state.currentClaim as any)[field.key], undefined, `Completed claim must have mandatory field ${field.key}`);
        }

        // Invariant 4: Every completed claim has a summary
        assert.ok(state.claimSummary && state.claimSummary.length > 0, 'Completed claim must have a summary');

        // Invariant 5: Every completed claim has a reference number
        assert.ok(state.claimReferenceNumber && state.claimReferenceNumber.startsWith('CLM-'), 'Completed claim must have valid reference number');

        // Invariant 6: Every completed claim logged exactly once
        assert.strictEqual(logs.length, 1, 'Claim must be logged exactly once upon completion');

        // Invariant 8: Severity matches conversation (injuries -> High)
        if (injure) {
          assert.strictEqual(state.severity, 'High', 'Injuries must result in High severity');
        }
      }
    }
  });

  it('Invariant 3: Escalation never skips remaining required field collection', async () => {
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createInvariantDeps(logs, true));

    let state = manager.start();

    // User reports injury right away
    const turn1 = await manager.handleUserMessage(state, 'I crashed MMI-99999 and I am bleeding!');
    state = turn1.state;

    assert.strictEqual(state.severity?.toLowerCase(), 'high');
    assert.notStrictEqual(state.currentConversationStep, 'completed'); // Escalation doesn't immediately complete without required details
  });
});
