import 'dotenv/config';
import {
  createConversationManager,
  type ConversationManagerDependencies,
} from '../conversation/ConversationManager.js';
import type { ConversationState } from '../conversation/ConversationState.js';
import type { ConversationTurnResult } from '../conversation/actions.js';
import { createPromptBuilder } from '../conversation/PromptBuilder.js';
import { createDetectContradictionsService } from '../services/detectContradictions.js';
import { createDetectSeverityService } from '../services/detectSeverity.js';
import { createGeminiService } from '../services/geminiClient.js';
import { createRecommendServicesService } from '../services/recommendServices.js';
import { createVerifyPolicyService } from '../services/verifyPolicy.js';

const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

const dependencies: ConversationManagerDependencies = {
  verifyPolicy: createVerifyPolicyService(),
  detectSeverity: createDetectSeverityService(),
  detectContradictions: createDetectContradictionsService(),
  extractClaimData: {
    extract() {
      return Promise.resolve({
        acknowledgement: '',
        updatedClaim: {},
        missingFields: [],
        conversationStage: 'collecting_fnol',
        nextQuestion: '',
        conversationAnalysis: 'mock'
      });
    },
  },
  recommendServices: createRecommendServicesService(),
  generateSummary: {
    generate() {
      return {
        summary: 'Summary generation is outside Sprint 4.',
        severity: 'low',
      };
    },
  },
  claimLogger: {
    log() {
      return undefined;
    },
  },
  promptBuilder: createPromptBuilder(),
  geminiClient: createGeminiService(),
  claimNumberGenerator: {
    generate() {
      return 'CLM-GEMINI-DEMO-0001';
    },
  },
};

function printState(label: string, state: ConversationState): void {
  console.log(`\n${label}`);
  console.log(
    JSON.stringify(
      {
        step: state.currentConversationStep,
        collectedFields: state.collectedFields,
        missingFields: state.missingFields,
        pendingClarifications: state.pendingClarifications,
        contradictions: state.contradictions,
        severity: state.severity ?? null,
        escalationRequired: state.escalationRequired,
        recommendations: state.currentClaim.recommendedServices ?? [],
      },
      null,
      2,
    ),
  );
}

function printTurn(result: ConversationTurnResult): void {
  console.log(`\nAction: ${result.action.type}`);
  console.log(`Gemini response: ${result.action.message}`);

  if (result.action.type === 'recommend_services') {
    console.log(`Structured services: ${result.action.services.join(', ') || 'none'}`);
  }

  if (result.action.type === 'complete') {
    console.log(`Structured claim number: ${result.action.claim.claimReferenceNumber}`);
  }
}

if (!geminiConfigured) {
  console.log(
    'GEMINI_API_KEY is not set. The Gemini service will use graceful fallback text while preserving structured state.',
  );
}

const manager = createConversationManager(dependencies);
let state = manager.start();

printState('Start', state);
console.log(`Initial assistant: ${state.lastAssistantMessage ?? ''}`);

const messages = [
  'policyNumber=MMI-10234; callerName=Arjun Rao',
  [
    'dateOfIncident=2026-07-29',
    'timeOfIncident=09:30',
    'locationOfIncident=MG Road, Bengaluru',
    'incidentDescription=The car rolled over after a collision and an ambulance came',
  ].join('; '),
  [
    'injuriesReported=true',
    'injuryDetails=Caller reports neck stiffness',
    'policeReportFiled=true',
    'policeReportReference=POL-777',
    'photosAvailable=true',
    'vehicleDrivable=false',
    'otherParties=One other driver involved',
  ].join('; '),
  'continue=true',
  'confirm=true',
];

for (const [index, message] of messages.entries()) {
  console.log(`\nUser ${index + 1}: ${message}`);
  const result = await manager.handleUserMessage(state, message);
  state = result.state;
  printTurn(result);
  printState(`Structured ConversationState after user ${index + 1}`, state);
}
