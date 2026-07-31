import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, it } from 'node:test';

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
  vehicle: {
    make: 'Honda',
    model: 'City',
    registration: 'KA01AB1234',
  },
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
        rawExtractedSlots: {
          confidence: 1,
          ...(next.extractedData ?? {}),
        },
        geminiPrompt: '[test prompt]',
        geminiResponse: '[test response]',
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
          totalTokenCount: 120,
        },
        retries: 0,
      },
    };
  }
}

function createDependencies(extractor: ScriptedExtractor, claimLogs: ClaimLogRecord[]): ConversationManagerDependencies {
  return {
    extractClaimData: extractor,
    verifyPolicy: {
      async verify(input) {
        if (input.policyNumber === verifiedPolicy.policyNumber && input.callerName === verifiedPolicy.policyholderName) {
          return {
            verified: true,
            policy: verifiedPolicy,
            coverageType: verifiedPolicy.coverageType,
            towingIncluded: verifiedPolicy.towingIncluded,
          };
        }

        return {
          verified: false,
          reason: 'policy_not_found',
          message: 'Policy not found.',
        };
      },
    },
    recommendServices: {
      async recommend(input) {
        const recommendations: string[] = [];
        if (input.claim.vehicleDrivable === false && input.policy.towingIncluded) {
          recommendations.push('towing');
        }
        if (input.claim.policeReportFiled === true) {
          recommendations.push('adjuster callback');
        }
        return { recommendations };
      },
    },
    generateSummary: {
      async generate(input) {
        return {
          summary: `Claim summary for ${input.verifiedPolicy.policyholderName}.`,
          severity: input.state.severity ?? 'low',
        };
      },
    },
    claimLogger: {
      async log(record) {
        claimLogs.push(record);
      },
    },
    llmProvider: {
      async generateResponse() {
        return { assistantResponse: '' };
      },
    },
    claimNumberGenerator: {
      generate() {
        return 'CLM-20260731-0001';
      },
    },
  };
}

async function playTurns(turns: ScriptedTurn[], messages: string[]): Promise<{
  actions: string[];
  state: ConversationState;
  logs: ClaimLogRecord[];
  extractor: ScriptedExtractor;
}> {
  const extractor = new ScriptedExtractor([...turns]);
  const logs: ClaimLogRecord[] = [];
  const manager = createConversationManager(createDependencies(extractor, logs));
  let state = manager.start();
  const actions: string[] = [];

  for (const message of messages) {
    const result = await manager.handleUserMessage(state, message);
    state = result.state;
    actions.push(result.action.type);
  }

  return { actions, state, logs, extractor };
}

describe('ConversationManager P0 replay harness', () => {
  let originalLog: typeof console.log;

  beforeEach(() => {
    originalLog = console.log;
    console.log = () => undefined;
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('replays a happy path through service recommendation and completion', async () => {
    const completeClaim: Partial<Claim> = {
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
      dateOfIncident: '2026-07-30',
      timeOfIncident: '19:00',
      locationOfIncident: 'MG Road, Bengaluru',
      incidentDescription: 'Two cars collided at a junction.',
      insuredVehicle: {
        make: 'Honda',
        model: 'City',
        registration: 'KA01AB1234',
      },
      injuriesReported: false,
      policeReportFiled: true,
      policeReportReference: 'POL-123',
      photosAvailable: true,
      vehicleDrivable: false,
    };

    const { actions, state, logs, extractor } = await playTurns(
      [
        {
          responseToUser: 'I have the details. Do you need towing?',
          extractedData: completeClaim,
        },
        {
          responseToUser: 'Your claim has been logged.',
          extractedData: {},
        },
      ],
      ['All details in one message.', 'Yes, please arrange towing.'],
    );

    assert.deepEqual(actions, ['respond', 'complete']);
    assert.equal(state.currentConversationStep, 'completed');
    assert.equal(state.currentClaim.claimReferenceNumber, 'CLM-20260731-0001');
    assert.deepEqual(state.currentClaim.recommendedServices, ['towing', 'adjuster callback']);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.claimNumber, 'CLM-20260731-0001');
    assert.equal(extractor.inputs.length, 2);
  });

  it('escalates when injury is reported and captures the current known disposition bug', async () => {
    const { actions, state, logs } = await playTurns(
      [
        {
          responseToUser: 'I am sorry to hear that. I will escalate this.',
          extractedData: {
            injuriesReported: true,
            injuryDetails: 'The driver has neck pain.',
          },
        },
      ],
      ['Someone has neck pain after the crash.'],
    );

    assert.deepEqual(actions, ['escalate']);
    assert.equal(state.currentConversationStep, 'escalation');
    assert.equal(state.severity, 'high');
    assert.equal(state.escalationRequired, true, 'escalationRequired is persisted');
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.escalationRequired, true);
    assert.ok(logs[0]?.summary.includes('Escalated:'));
  });

  it('offers callback after two failed policy verification attempts', async () => {
    const { actions, state, logs } = await playTurns(
      [
        {
          responseToUser: 'I could not verify that policy. Could you repeat it?',
          extractedData: {
            policyNumber: 'MMI-00000',
            callerName: 'Wrong Name',
          },
        },
        {
          responseToUser: 'A claims agent will call you back shortly.',
          extractedData: {
            policyNumber: 'MMI-00001',
            callerName: 'Wrong Name',
          },
        },
      ],
      ['My policy is MMI-00000 and my name is Wrong Name.', 'Try MMI-00001.'],
    );

    assert.deepEqual(actions, ['respond', 'complete']);
    assert.equal(state.currentConversationStep, 'callback_offer');
    assert.equal(state.verificationAttempts, 2);
    assert.equal(state.verifiedPolicy, undefined);
    assert.equal(logs.length, 1);
    assert.ok(logs[0]?.summary.includes('Callback offered'));
  });

  it('normalizes vehicle registration while preserving field tracking', async () => {
    const { state } = await playTurns(
      [
        {
          responseToUser: 'Got it. What is the incident date?',
          extractedData: {
            policyNumber: 'MMI-10234',
            callerName: 'Arjun Rao',
            insuredVehicle: {
              make: 'Honda',
              model: 'City',
              registration: 'ka 01 ab 1234',
            },
          },
        },
      ],
      ['My vehicle is a Honda City, registration ka 01 ab 1234.'],
    );

    assert.equal(state.currentClaim.insuredVehicle?.registration, 'KA01AB1234');
    assert.ok(state.collectedFields.includes('insuredVehicle'));
    assert.ok(!state.missingFields.includes('insuredVehicle'));
  });


  it('handles out-of-order fields correctly', async () => {
    const { state } = await playTurns(
      [
        {
          responseToUser: 'Got it. Can you confirm the location of the incident?',
          extractedData: {
            policyNumber: 'MMI-10234',
            callerName: 'Arjun Rao',
            incidentDescription: 'I hit a pole',
            dateOfIncident: '2026-07-30',
          },
        },
      ],
      ['My policy is MMI-10234, name is Arjun Rao. I hit a pole yesterday.'],
    );

    assert.equal(state.currentClaim.incidentDescription, 'I hit a pole');
    assert.equal(state.currentClaim.dateOfIncident, '2026-07-30');
    assert.ok(state.collectedFields.includes('incidentDescription'));
    assert.ok(!state.missingFields.includes('incidentDescription'));
  });

  it('handles field corrections correctly', async () => {
    const { state } = await playTurns(
      [
        {
          responseToUser: 'Got it. What time did it happen?',
          extractedData: {
            policyNumber: 'MMI-10234',
            callerName: 'Arjun Rao',
            dateOfIncident: '2026-07-30',
          },
        },
        {
          responseToUser: 'Understood. What is the location?',
          extractedData: {
            dateOfIncident: '2026-07-29', // Correction
            timeOfIncident: '15:00',
          },
        },
      ],
      [
        'My policy is MMI-10234, name Arjun Rao. It happened on July 30th.',
        'Actually, it was July 29th at 3 PM.',
      ],
    );

    assert.equal(state.currentClaim.dateOfIncident, '2026-07-29');
    assert.equal(state.currentClaim.timeOfIncident, '15:00');
  });

  it('progresses explicitly through FSM states', async () => {
    const extractor = new ScriptedExtractor([
      // Turn 1: user answers safety
      {
        responseToUser: 'Can you confirm your policy number?',
        extractedData: { injuriesReported: false },
      },
      // Turn 2: user gives policy details
      {
        responseToUser: 'Got it. When did the incident happen?',
        extractedData: { policyNumber: 'MMI-10234', callerName: 'Arjun Rao' },
      },
      // Turn 3: user gives incident details, triggers recommendations
      {
        responseToUser: 'Do you need towing?',
        extractedData: { 
          dateOfIncident: '2026-07-30',
          timeOfIncident: '19:00',
          locationOfIncident: 'MG Road, Bengaluru',
          incidentDescription: 'Two cars collided at a junction.',
          insuredVehicle: { make: 'Honda', model: 'City', registration: 'KA01AB1234' },
          policeReportFiled: true,
          policeReportReference: 'POL-123',
          photosAvailable: true,
          vehicleDrivable: false,
        },
      },
      // Turn 4: user answers towing, triggers completion
      {
        responseToUser: 'Your claim has been logged.',
        extractedData: {},
      },
    ]);
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createDependencies(extractor, logs));
    
    let state = manager.start();
    assert.equal(state.currentConversationStep, 'safety_check');
    
    // Turn 1
    let result = await manager.handleUserMessage(state, 'Yes we are safe.');
    state = result.state;
    assert.equal(state.currentConversationStep, 'verification');
    
    // Turn 2
    result = await manager.handleUserMessage(state, 'My policy is MMI-10234, name Arjun Rao.');
    state = result.state;
    assert.equal(state.currentConversationStep, 'collecting_fnol');
    
    // Turn 3
    result = await manager.handleUserMessage(state, 'I hit a pole yesterday at MG road.');
    state = result.state;
    assert.equal(state.currentConversationStep, 'recommending_services');

    // Turn 4
    result = await manager.handleUserMessage(state, 'Yes please arrange towing.');
    state = result.state;
    assert.equal(state.currentConversationStep, 'completed');
  });
});
