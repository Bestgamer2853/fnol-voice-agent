import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConversationManager, type ConversationManagerDependencies } from '../src/conversation/ConversationManager.js';
import type { ConversationState } from '../src/conversation/ConversationState.js';
import type { ExtractClaimDataInput, ExtractClaimDataResult } from '../src/services/extractClaimData.js';
import type { ClaimLogRecord } from '../src/services/claimLogger.js';
import type { Claim } from '../src/types/claim.js';
import type { Policy } from '../src/types/policy.js';

const verifiedPolicy: Policy = {
  policyNumber: 'MMI-12677',
  policyholderName: 'Rahul Menon',
  coverageType: 'Comprehensive',
  towingIncluded: true,
  rentalCarIncluded: true,
  vehicle: { make: 'Honda', model: 'Civic', registration: 'TN01AB1234' },
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
    assert.ok(next, `Unexpected extractor call for user input: "${input.userMessage}"`);
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

function createTestDeps(extractor: ScriptedExtractor, logs: ClaimLogRecord[]): ConversationManagerDependencies {
  return {
    extractClaimData: extractor,
    verifyPolicy: {
      verify: async (input) => {
        if (input.policyNumber?.toUpperCase() === 'MMI-12677' && input.callerName?.toLowerCase().includes('rahul')) {
          return {
            verified: true,
            policy: verifiedPolicy,
            coverageType: 'Comprehensive',
            towingIncluded: true,
            rentalCarIncluded: true,
          };
        }
        return { verified: false, reason: 'policy_not_found', message: 'Policy not found' };
      },
    },
    recommendServices: {
      recommend: async () => ({ recommendations: [] }),
    },
    generateSummary: {
      generate: async () => ({ summary: 'Verified claim summary for Rahul Menon', severity: 'low' }),
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

describe('Adversarial & Complex Conversational Flows', () => {
  it('handles All-In-One sentence dumps without premature exit or crash', async () => {
    const logs: ClaimLogRecord[] = [];
    const extractor = new ScriptedExtractor([
      {
        responseToUser: "I've recorded all details and marked an urgent escalation for your injury. Let me set up towing and rental car for you.",
        extractedData: {
          policyNumber: 'MMI-12677',
          policyholderName: 'Rahul Menon',
          dateOfIncident: '2026-08-05',
          timeOfIncident: '19:30',
          location: 'Anna Salai',
          description: 'Crashed into a bike, bumper damaged',
          injuriesReported: true,
          injuryDetails: 'Neck hurts',
          policeContacted: true,
          policeReportReference: '456',
          hasPhotos: true,
          isVehicleDrivable: false,
          needsTowing: true,
          needsRentalCar: true,
        },
      },
      {
        responseToUser: 'Perfect, towing and rental are scheduled. Your claim MMI-12677 is fully registered.',
        extractedData: {
          wantsRentalCar: true,
        },
      },
    ]);

    const manager = createConversationManager(createTestDeps(extractor, logs));
    let state = manager.start();

    const dumpedMessage = "Hi I'm Rahul Menon policy MMI-12677 I crashed yesterday 7:30 pm near Anna Salai into a bike my bumper is damaged my neck hurts police came yes report 456 I have photos car isn't drivable.";

    // Turn 1
    const turn1 = await manager.handleUserMessage(state, dumpedMessage);
    state = turn1.state;
    assert.strictEqual(state.severity?.toLowerCase(), 'high'); // Due to injury
    assert.strictEqual(state.currentConversationStep, 'escalation');

    // Turn 2: Accept rental service
    const turn2 = await manager.handleUserMessage(state, 'Yes please setup rental car');
    state = turn2.state;
    assert.strictEqual(state.currentConversationStep, 'escalation');
    assert.ok(logs.length >= 1);
    assert.strictEqual(logs[logs.length - 1].claim.injuriesReported, true);
    assert.strictEqual(logs[logs.length - 1].claim.policeReportReference, '456');
  });

  it('handles Self-Corrections seamlessly across turns', async () => {
    const logs: ClaimLogRecord[] = [];
    const extractor = new ScriptedExtractor([
      // Turn 1: Verification
      { responseToUser: 'Verified. When did the incident happen?', extractedData: { policyNumber: 'MMI-12677', callerName: 'Rahul Menon' } },
      // Turn 2: Initial date & location
      { responseToUser: 'Got it, Tuesday at MG Road. Were there any injuries?', extractedData: { dateOfIncident: '2026-08-04', locationOfIncident: 'MG Road' } },
      // Turn 3: Correction of date and location
      { responseToUser: 'Updated to Wednesday at Anna Salai. Are you injured?', extractedData: { dateOfIncident: '2026-08-05', locationOfIncident: 'Anna Salai' } },
      // Turn 4: Injury & rest of required fields
      { responseToUser: 'Understood. Is your car drivable?', extractedData: { injuriesReported: false, incidentDescription: 'Hit wall', policeReportFiled: false, photosAvailable: true, vehicleDrivable: true } },
      // Turn 5: Complete
      { responseToUser: 'Your claim is complete!', extractedData: {} }
    ]);

    const manager = createConversationManager(createTestDeps(extractor, logs));
    let state = manager.start();

    await manager.handleUserMessage(state, 'Rahul Menon MMI-12677');
    await manager.handleUserMessage(state, 'It happened Tuesday at MG Road');
    const turn3 = await manager.handleUserMessage(state, 'Actually it was Wednesday near Anna Salai');

    assert.strictEqual(turn3.state.currentClaim.dateOfIncident, '2026-08-05');
    assert.strictEqual(turn3.state.currentClaim.locationOfIncident, 'Anna Salai');
  });

  it('handles Contradictions (e.g. photos available -> actually no photos)', async () => {
    const logs: ClaimLogRecord[] = [];
    const extractor = new ScriptedExtractor([
      { responseToUser: 'Verified.', extractedData: { policyNumber: 'MMI-12677', callerName: 'Rahul Menon' } },
      { responseToUser: 'Noted photos.', extractedData: { photosAvailable: true } },
      { responseToUser: 'Updated: no photos available.', extractedData: { photosAvailable: false } },
    ]);

    const manager = createConversationManager(createTestDeps(extractor, logs));
    let state = manager.start();

    await manager.handleUserMessage(state, 'Rahul MMI-12677');
    await manager.handleUserMessage(state, 'I have photos');
    const turn3 = await manager.handleUserMessage(state, 'No wait, my phone died so I don\'t have photos');

    assert.strictEqual(turn3.state.currentClaim.photosAvailable, false);
  });
});
