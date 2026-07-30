import 'dotenv/config';
import {
  createConversationManager,
  type ConversationManagerDependencies,
} from '../conversation/ConversationManager.js';
import type { ConversationState } from '../conversation/ConversationState.js';
import { createPromptBuilder } from '../conversation/PromptBuilder.js';
import { createDetectContradictionsService } from '../services/detectContradictions.js';
import { createDetectSeverityService } from '../services/detectSeverity.js';
import { createExtractClaimDataService } from '../services/extractClaimData.js';
import { createRecommendServicesService } from '../services/recommendServices.js';
import { createVerifyPolicyService } from '../services/verifyPolicy.js';

function mockExtractionResponse(message: string): string {
  if (message.includes('My policy is MMI-10234')) {
    return JSON.stringify({
      policyNumber: 'MMI-10234',
      callerName: 'Arjun Rao',
    });
  }

  if (message.includes('hit from behind')) {
    return JSON.stringify({
      timeOfIncident: 'morning',
      locationOfIncident: 'MG Road',
      incidentDescription:
        "My car was hit from behind this morning near MG Road and it isn't drivable.",
      vehicleDrivable: false,
    });
  }

  if (message.includes('happened on 2026-07-29')) {
    return JSON.stringify({
      dateOfIncident: '2026-07-29',
      injuriesReported: false,
      policeReportFiled: false,
      photosAvailable: true,
    });
  }

  if (message.includes('rear bumper')) {
    return JSON.stringify({
      incidentDescription: 'Rear bumper impact with one other car involved.',
      otherParties: 'One other car involved',
    });
  }

  return '{}';
}

const extractionGeminiClient = {
  generateAssistantResponse(input: { userPrompt: string }) {
    return Promise.resolve({
      assistantResponse: mockExtractionResponse(input.userPrompt),
    });
  },
};

const responseGeminiClient = {
  generateAssistantResponse() {
    return Promise.resolve({
      assistantResponse: 'Demo assistant language response.',
    });
  },
};

const dependencies: ConversationManagerDependencies = {
  verifyPolicy: createVerifyPolicyService(),
  detectSeverity: createDetectSeverityService(),
  detectContradictions: createDetectContradictionsService(),
  extractClaimData: createExtractClaimDataService({
    geminiClient: extractionGeminiClient,
  }),
  recommendServices: createRecommendServicesService(),
  generateSummary: {
    generate(input) {
      return {
        summary: `Demo summary for ${input.claim.claimReferenceNumber}.`,
        severity: input.state.severity ?? 'low',
      };
    },
  },
  claimLogger: {
    log() {
      return undefined;
    },
  },
  promptBuilder: createPromptBuilder(),
  geminiClient: responseGeminiClient,
  claimNumberGenerator: {
    generate() {
      return 'CLM-NL-DEMO-0001';
    },
  },
};

function printComparison(
  label: string,
  naturalLanguage: string,
  extractedFields: unknown,
  state: ConversationState,
): void {
  console.log(`\n${label}`);
  console.log(`Natural language: ${naturalLanguage}`);
  console.log('Extracted fields:');
  console.log(JSON.stringify(extractedFields, null, 2));
  console.log('Updated ConversationState:');
  console.log(
    JSON.stringify(
      {
        step: state.currentConversationStep,
        currentClaim: state.currentClaim,
        collectedFields: state.collectedFields,
        missingFields: state.missingFields,
        severity: state.severity ?? null,
        escalationRequired: state.escalationRequired,
      },
      null,
      2,
    ),
  );
}

const manager = createConversationManager(dependencies);
let state = manager.start();

const messages = [
  'My policy is MMI-10234 and my name is Arjun Rao.',
  "My car was hit from behind this morning near MG Road and it isn't drivable.",
  'It happened on 2026-07-29. Nobody was injured, no police report was filed, and I have photos.',
  'There was rear bumper damage and one other car was involved.',
];

for (const [index, message] of messages.entries()) {
  const extractedFields = await dependencies.extractClaimData.extract({
    userMessage: message,
    state,
  });
  const result = await manager.handleUserMessage(state, message);
  state = result.state;

  printComparison(`Scenario ${index + 1}`, message, extractedFields, state);
}
