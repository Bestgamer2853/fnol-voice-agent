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
  rentalCarIncluded: true,
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
            rentalCarIncluded: verifiedPolicy.rentalCarIncluded,
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
        if (input.policy.rentalCarIncluded && (input.claim.vehicleDrivable === false || input.policy.coverageType === 'Comprehensive')) {
          recommendations.push('rental car');
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
          responseToUser: 'Your claim has been logged under CLM-20260731-0001. Is there anything else I can help you with today?',
          extractedData: {},
        },
        {
          responseToUser: "You're welcome. Thank you for choosing Meridian Motor Insurance. Have a safe day.",
          extractedData: {},
        },
      ],
      ['All details in one message.', 'Yes, please arrange towing and a rental car.', "No, that's everything."],
    );

    assert.deepEqual(actions, ['respond', 'respond', 'complete']);
    assert.equal(state.currentConversationStep, 'completed');
    assert.equal(state.currentClaim.claimReferenceNumber, 'CLM-20260731-0001');
    assert.deepEqual(state.currentClaim.recommendedServices, ['towing', 'rental car', 'adjuster callback']);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.claimNumber, 'CLM-20260731-0001');
    assert.equal(extractor.inputs.length, 2);
  });

  it('asks caller about towing and rental car services explicitly when required fields are complete', async () => {
    const completeClaim: Partial<Claim> = {
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
      dateOfIncident: '2026-07-30',
      timeOfIncident: '19:00',
      locationOfIncident: 'MG Road, Bengaluru',
      incidentDescription: 'Car hit a pole',
      insuredVehicle: { make: 'Honda', model: 'City', registration: 'KA01AB1234' },
      injuriesReported: false,
      policeReportFiled: false,
      photosAvailable: true,
      vehicleDrivable: false,
    };

    const extractor = new ScriptedExtractor([
      {
        // LLM response without explicit service question
        responseToUser: 'I have logged all your accident details.',
        extractedData: completeClaim,
      },
      {
        responseToUser: 'I have added towing and a rental car reservation to your claim file.',
        extractedData: {},
      },
    ]);

    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createDependencies(extractor, logs));
    let state = manager.start();

    // Turn 1: Caller provides all details
    const result1 = await manager.handleUserMessage(state, 'All claim details provided.');
    state = result1.state;

    // Assert that towing and rental car question was explicitly appended/asked
    assert.equal(result1.action.type, 'respond');
    assert.equal(state.currentConversationStep, 'recommending_services');
    assert.ok(result1.action.message.includes('Would you like us to arrange towing for your vehicle and a rental car for you?'));

    // Turn 2: Caller responds to towing and rental car question
    const result2 = await manager.handleUserMessage(state, 'Yes please, I need towing and a rental car.');
    state = result2.state;

    assert.equal(result2.action.type, 'respond');
    assert.equal(state.currentConversationStep, 'completed');
    assert.ok(state.currentClaim.recommendedServices?.includes('towing'));
    assert.ok(state.currentClaim.recommendedServices?.includes('rental car'));
  });

  it('correctly records rental car preference when caller declines towing', async () => {
    const completeClaim: Partial<Claim> = {
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
      dateOfIncident: '2026-07-30',
      timeOfIncident: '19:00',
      locationOfIncident: 'MG Road, Bengaluru',
      incidentDescription: 'Car hit a pole',
      insuredVehicle: { make: 'Honda', model: 'City', registration: 'KA01AB1234' },
      injuriesReported: false,
      policeReportFiled: false,
      photosAvailable: true,
      vehicleDrivable: false,
    };

    const extractor = new ScriptedExtractor([
      { responseToUser: 'All details recorded.', extractedData: completeClaim },
      { responseToUser: 'Understood. Rental car has been arranged.', extractedData: {} },
    ]);

    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createDependencies(extractor, logs));
    let state = manager.start();

    // Turn 1: Details collected
    const res1 = await manager.handleUserMessage(state, 'Details sent.');
    state = res1.state;
    assert.equal(state.currentConversationStep, 'recommending_services');

    // Turn 2: Caller chooses rental car but explicitly declines towing
    const res2 = await manager.handleUserMessage(state, 'I need a rental car, but no towing needed.');
    state = res2.state;

    assert.equal(state.currentConversationStep, 'completed');
    assert.ok(state.currentClaim.recommendedServices?.includes('rental car'));
    assert.ok(!state.currentClaim.recommendedServices?.includes('towing'));
    assert.equal(logs.length, 1);
    assert.ok(logs[0]?.claim.recommendedServices?.includes('rental car'));
    assert.ok(!logs[0]?.claim.recommendedServices?.includes('towing'));
  });

  it('does not complete or persist until every offered towing/rental choice is explicit', async () => {
    const completeClaim: Partial<Claim> = {
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
      dateOfIncident: '2026-07-30',
      timeOfIncident: '19:00',
      locationOfIncident: 'MG Road, Bengaluru',
      incidentDescription: 'Car hit a pole',
      insuredVehicle: { make: 'Honda', model: 'City', registration: 'KA01AB1234' },
      injuriesReported: false,
      policeReportFiled: false,
      photosAvailable: true,
      vehicleDrivable: false,
    };
    const extractor = new ScriptedExtractor([
      { responseToUser: 'Do you need towing?', extractedData: completeClaim },
      { responseToUser: 'Okay.', extractedData: {} },
      { responseToUser: 'Your claim has been logged.', extractedData: {} },
    ]);
    const logs: ClaimLogRecord[] = [];
    const manager = createConversationManager(createDependencies(extractor, logs));
    let state = manager.start();

    const offer = await manager.handleUserMessage(state, 'Details sent.');
    state = offer.state;
    assert.ok(offer.action.message.includes('rental car'));

    const towingOnly = await manager.handleUserMessage(state, 'No towing needed.');
    state = towingOnly.state;
    assert.equal(state.currentConversationStep, 'recommending_services');
    assert.deepEqual(state.pendingServiceChoices, ['rental car']);
    assert.equal(logs.length, 0);
    assert.ok(towingOnly.action.message.includes('rental car'));

    const rental = await manager.handleUserMessage(state, 'Yes, I need a rental car.');
    assert.equal(rental.state.currentConversationStep, 'completed');
    assert.equal(rental.state.currentClaim.towingRequested, false);
    assert.equal(rental.state.currentClaim.rentalRequested, true);
    assert.equal(logs.length, 1);
  });

  it('waits for durable claim persistence before reporting a claim as completed', async () => {
    const completeClaim: Partial<Claim> = {
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
      dateOfIncident: '2026-07-30',
      timeOfIncident: '19:00',
      locationOfIncident: 'MG Road, Bengaluru',
      incidentDescription: 'Car hit a pole',
      insuredVehicle: { make: 'Honda', model: 'City', registration: 'KA01AB1234' },
      injuriesReported: false,
      policeReportFiled: false,
      photosAvailable: false,
      vehicleDrivable: true,
    };
    const extractor = new ScriptedExtractor([
      { responseToUser: 'Your claim has been logged.', extractedData: completeClaim },
    ]);
    const logs: ClaimLogRecord[] = [];
    let releasePersistence: (() => void) | undefined;
    const persistenceGate = new Promise<void>((resolve) => { releasePersistence = resolve; });
    const dependencies = createDependencies(extractor, logs);
    dependencies.recommendServices = { async recommend() { return { recommendations: [] }; } };
    dependencies.claimLogger = {
      async log(record) {
        await persistenceGate;
        logs.push(record);
      },
    };
    const manager = createConversationManager(dependencies);
    let settled = false;
    const pendingResult = manager.handleUserMessage(manager.start(), 'All claim details provided.').then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(logs.length, 0);

    releasePersistence?.();
    const result = await pendingResult;
    assert.equal(result.state.currentConversationStep, 'completed');
    assert.equal(logs.length, 1);
  });

  it('handles conversational call termination variants correctly', async () => {
    const completeClaim: Partial<Claim> = {
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
      dateOfIncident: '2026-07-30',
      timeOfIncident: '19:00',
      locationOfIncident: 'MG Road, Bengaluru',
      incidentDescription: 'Two cars collided.',
      insuredVehicle: { make: 'Honda', model: 'City', registration: 'KA01AB1234' },
      injuriesReported: false,
      policeReportFiled: true,
      policeReportReference: 'POL-123',
      photosAvailable: true,
      vehicleDrivable: true,
    };

    // Variant A: "Thanks."
    const extractorA = new ScriptedExtractor([
      { responseToUser: 'Recommend services.', extractedData: completeClaim },
      { responseToUser: 'Claim logged. Anything else?', extractedData: {} },
      { responseToUser: 'Closing statement.', extractedData: {} },
    ]);
    const managerA = createConversationManager(createDependencies(extractorA, []));
    let stateA = managerA.start();
    const actionsA: string[] = [];
    for (const msg of ['Details provided.', 'No towing needed and I need a rental car.', 'Thanks.']) {
      const res = await managerA.handleUserMessage(stateA, msg);
      stateA = res.state;
      console.error(`[DEBUG TURN] msg: "${msg}", stepAfter: "${stateA.currentConversationStep}", actionType: "${res.action.type}"`);
      actionsA.push(res.action.type);
    }
    assert.deepEqual(actionsA, ['respond', 'respond', 'complete']);

    // Variant B: "Bye."
    const testBye = await playTurns(
      [
        { responseToUser: 'Recommend services.', extractedData: completeClaim },
        { responseToUser: 'Claim logged. Anything else?', extractedData: {} },
        { responseToUser: 'Closing statement.', extractedData: {} },
      ],
      ['Details provided.', 'No towing needed and I need a rental car.', 'Bye.'],
    );
    assert.deepEqual(testBye.actions, ['respond', 'respond', 'complete']);

    // Variant C: "Actually I have one more question..."
    const testQuestion = await playTurns(
      [
        { responseToUser: 'Recommend services.', extractedData: completeClaim },
        { responseToUser: 'Claim logged. Anything else?', extractedData: {} },
        { responseToUser: 'Yes, repairs usually take 3-5 business days. Anything else?', extractedData: {} },
      ],
      ['Details provided.', 'No towing needed and I need a rental car.', 'Actually I have one more question about repairs...'],
    );
    assert.deepEqual(testQuestion.actions, ['respond', 'respond', 'respond']);
    assert.equal(testQuestion.state.currentConversationStep, 'completed');
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
