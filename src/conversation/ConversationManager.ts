import {
  REQUIRED_FNOL_FIELDS,
  type TrackableFnolField,
} from '../config/requiredFields.js';
import {
  COMPANY_NAME,
  MAX_VERIFICATION_RETRIES,
} from '../config/constants.js';
import type { ClaimLoggerService } from '../services/claimLogger.js';
import type { ExtractClaimDataService } from '../services/extractClaimData.js';
import type { GenerateSummaryService } from '../services/generateSummary.js';
import type { GeminiClient } from '../services/geminiClient.js';
import type { RecommendServicesService } from '../services/recommendServices.js';
import type { VerifyPolicyService } from '../services/verifyPolicy.js';
import { normalizeClaimPatch } from '../services/normalizeClaimData.js';
import type { Claim } from '../types/claim.js';
import type { Vehicle } from '../types/common.js';
import type { ClaimNumberGenerator } from '../utils/claimNumber.js';
import type {
  ConversationAction,
  ConversationManager,
  ConversationTurnResult,
} from './actions.js';
import type { ConversationState } from './ConversationState.js';


import type {
  Contradiction,
  ConversationMessage,
  PendingClarification,
} from './types.js';

export interface ConversationManagerDependencies {
  verifyPolicy: VerifyPolicyService;
  extractClaimData: ExtractClaimDataService;
  recommendServices: RecommendServicesService;
  generateSummary: GenerateSummaryService;
  claimLogger: ClaimLoggerService;
  geminiClient: GeminiClient;
  claimNumberGenerator: ClaimNumberGenerator;
}

type ParsedMessage = {
  claimPatch: Partial<Claim>;
  confirmationRequested: boolean;
};

type BooleanClaimField =
  | 'injuriesReported'
  | 'policeReportFiled'
  | 'photosAvailable'
  | 'vehicleDrivable';

const BOOLEAN_FIELD_KEYS: Record<string, BooleanClaimField> = {
  injuriesreported: 'injuriesReported',
  injuries: 'injuriesReported',
  policereportfiled: 'policeReportFiled',
  policereport: 'policeReportFiled',
  photosavailable: 'photosAvailable',
  photos: 'photosAvailable',
  vehicledrivable: 'vehicleDrivable',
  drivable: 'vehicleDrivable',
};

const TEXT_FIELD_KEYS: Record<string, keyof Pick<
  Claim,
  | 'policyNumber'
  | 'callerName'
  | 'dateOfIncident'
  | 'timeOfIncident'
  | 'locationOfIncident'
  | 'incidentDescription'
  | 'otherParties'
  | 'injuryDetails'
  | 'policeReportReference'
>> = {
  policynumber: 'policyNumber',
  policy: 'policyNumber',
  callername: 'callerName',
  name: 'callerName',
  dateofincident: 'dateOfIncident',
  date: 'dateOfIncident',
  timeofincident: 'timeOfIncident',
  time: 'timeOfIncident',
  locationofincident: 'locationOfIncident',
  location: 'locationOfIncident',
  incidentdescription: 'incidentDescription',
  description: 'incidentDescription',
  otherparties: 'otherParties',
  injurydetails: 'injuryDetails',
  policereportreference: 'policeReportReference',
  policereference: 'policeReportReference',
};

const VEHICLE_FIELD_KEYS: Record<string, keyof Vehicle> = {
  vehiclemake: 'make',
  make: 'make',
  vehiclemodel: 'model',
  model: 'model',
  vehicleregistration: 'registration',
  registration: 'registration',
};

const FIELD_LABELS: Record<TrackableFnolField, string> = {
  policyNumber: 'policy number',
  callerName: 'caller name',
  dateOfIncident: 'incident date',
  timeOfIncident: 'incident time',
  locationOfIncident: 'incident location',
  incidentDescription: 'incident description',
  insuredVehicle: 'insured vehicle details',
  injuriesReported: 'injury status',
  policeReportFiled: 'police report status',
  photosAvailable: 'photo availability',
  vehicleDrivable: 'vehicle drivable status',
  injuryDetails: 'injury details',
  policeReportReference: 'police report reference',
  otherParties: 'other parties involved',
};

function timestamp(): string {
  return new Date().toISOString();
}

function appendMessage(
  history: ConversationMessage[],
  role: ConversationMessage['role'],
  content: string,
): ConversationMessage[] {
  return [
    ...history,
    {
      role,
      content,
      timestamp: timestamp(),
    },
  ];
}

function normalizeKey(key: string): string {
  return key.trim().replace(/[\s_.-]/g, '').toLowerCase();
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();

  if (['true', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseDebugMessage(message: string): ParsedMessage {
  const claimPatch: Partial<Claim> = {};
  let confirmationRequested = false;

  for (const segment of message.split(/[;\n]/)) {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const rawKey = segment.slice(0, separatorIndex);
    const rawValue = segment.slice(separatorIndex + 1).trim();
    const normalizedKey = normalizeKey(rawKey);

    if (normalizedKey === 'confirm' || normalizedKey === 'confirmed') {
      confirmationRequested = parseBoolean(rawValue) === true;
      continue;
    }

    const booleanField = BOOLEAN_FIELD_KEYS[normalizedKey];
    if (booleanField) {
      const parsedBoolean = parseBoolean(rawValue);

      if (parsedBoolean !== undefined) {
        claimPatch[booleanField] = parsedBoolean;
      }

      continue;
    }

    const textField = TEXT_FIELD_KEYS[normalizedKey];
    if (textField && rawValue.length > 0) {
      claimPatch[textField] = rawValue;
      continue;
    }

    const vehicleField = VEHICLE_FIELD_KEYS[normalizedKey];
    if (vehicleField && rawValue.length > 0) {
      claimPatch.insuredVehicle = {
        ...claimPatch.insuredVehicle,
        [vehicleField]: rawValue,
      };
    }
  }

  return {
    claimPatch,
    confirmationRequested,
  };
}

function isDebugMessage(message: string): boolean {
  return message
    .split(/[;\n]/)
    .some((segment) => segment.includes('='));
}

function isConfirmationRequested(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  if (parseDebugMessage(message).confirmationRequested) {
    return true;
  }

  if (/\b(confirm|confirmed|submit|complete|go ahead)\b/i.test(normalized)) {
    return true;
  }

  return [
    'confirm',
    'confirmed',
    'yes confirm',
    'yes, confirm',
    'please confirm',
    'submit',
    'submit it',
    'complete',
    'complete it',
    'go ahead',
  ].includes(normalized);
}

function mergeVehicle(
  currentVehicle: Vehicle | undefined,
  patchVehicle: Vehicle | undefined,
): Vehicle | undefined {
  if (!currentVehicle && !patchVehicle) {
    return undefined;
  }

  return {
    ...currentVehicle,
    ...patchVehicle,
  };
}

function mergeClaim(currentClaim: Claim, patch: Partial<Claim>): Claim {
  const merged: Claim = {
    ...currentClaim,
    ...patch,
  };
  const mergedVehicle = mergeVehicle(currentClaim.insuredVehicle, patch.insuredVehicle);

  if (mergedVehicle) {
    merged.insuredVehicle = mergedVehicle;
  }

  return merged;
}

function sanitizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function validateClaimPatch(patch: Partial<Claim>): Partial<Claim> {
  const validatedPatch: Partial<Claim> = {};
  const textFields = [
    'policyNumber',
    'callerName',
    'dateOfIncident',
    'timeOfIncident',
    'locationOfIncident',
    'incidentDescription',
    'otherParties',
    'injuryDetails',
    'policeReportReference',
  ] as const;
  const booleanFields = [
    'injuriesReported',
    'policeReportFiled',
    'photosAvailable',
    'vehicleDrivable',
  ] as const;

  for (const field of textFields) {
    const value = sanitizeText(patch[field]);

    if (value) {
      validatedPatch[field] = value;
    }
  }

  for (const field of booleanFields) {
    const value = sanitizeBoolean(patch[field]);

    if (value !== undefined) {
      validatedPatch[field] = value;
    }
  }

  if (patch.insuredVehicle) {
    const vehiclePatch: Vehicle = {};
    const make = sanitizeText(patch.insuredVehicle.make);
    const model = sanitizeText(patch.insuredVehicle.model);
    const registration = sanitizeText(patch.insuredVehicle.registration);

    if (make) {
      vehiclePatch.make = make;
    }

    if (model) {
      vehiclePatch.model = model;
    }

    if (registration) {
      vehiclePatch.registration = registration;
    }

    if (Object.keys(vehiclePatch).length > 0) {
      validatedPatch.insuredVehicle = vehiclePatch;
    }
  }

  return validatedPatch;
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCompleteVehicle(value: Vehicle | undefined): boolean {
  return Boolean(
    hasText(value?.make) &&
      hasText(value?.model) &&
      hasText(value?.registration),
  );
}

function isFieldCollected(claim: Claim, field: TrackableFnolField): boolean {
  switch (field) {
    case 'policyNumber':
    case 'callerName':
    case 'dateOfIncident':
    case 'timeOfIncident':
    case 'locationOfIncident':
    case 'incidentDescription':
    case 'injuryDetails':
    case 'policeReportReference':
    case 'otherParties':
      return hasText(claim[field]);
    case 'insuredVehicle':
      return hasCompleteVehicle(claim.insuredVehicle);
    case 'injuriesReported':
    case 'policeReportFiled':
    case 'photosAvailable':
    case 'vehicleDrivable':
      return typeof claim[field] === 'boolean';
  }
}

function fieldsToTrack(claim: Claim): TrackableFnolField[] {
  const fields: TrackableFnolField[] = [...REQUIRED_FNOL_FIELDS];

  if (claim.injuriesReported === true) {
    fields.push('injuryDetails');
  }

  if (claim.policeReportFiled === true) {
    fields.push('policeReportReference');
  }

  if (isFieldCollected(claim, 'otherParties')) {
    fields.push('otherParties');
  }

  return fields;
}

function calculateCollectedFields(claim: Claim): TrackableFnolField[] {
  return fieldsToTrack(claim).filter((field) => isFieldCollected(claim, field));
}

function calculateMissingFields(claim: Claim): TrackableFnolField[] {
  return fieldsToTrack(claim).filter((field) => !isFieldCollected(claim, field));
}

function firstMissingFieldPrompt(fields: TrackableFnolField[]): string {
  const [firstField] = fields;

  if (!firstField) {
    return 'I have the required claim details.';
  }

  return `Please provide the ${FIELD_LABELS[firstField]}.`;
}

function toConversationContradiction(contradiction: {
  field: TrackableFnolField;
  description: string;
  priorValue: string;
  newValue: string;
}): Contradiction {
  return {
    field: contradiction.field,
    description: contradiction.description,
    priorValue: contradiction.priorValue,
    newValue: contradiction.newValue,
  };
}

function toPendingClarification(
  contradiction: Contradiction,
): PendingClarification {
  return {
    field: contradiction.field,
    prompt: contradiction.description,
  };
}



function buildInitialState(): ConversationState {
  const initialClaim: Claim = {};
  const greeting = `Hello, thank you for calling ${COMPANY_NAME}. I'm sorry to hear you've had an accident. I'll help you report your claim today. Before we begin, are you and everyone else currently safe?`;

  return {
    currentClaim: initialClaim,
    conversationHistory: appendMessage([], 'assistant', greeting),
    collectedFields: [],
    missingFields: calculateMissingFields(initialClaim),
    retryCount: 0,
    escalationRequired: false,
    currentConversationStep: 'safety_check',
    contradictions: [],
    followUpQuestions: [],
    pendingClarifications: [],
    lastAssistantMessage: greeting,
    empathyPhrasesUsed: [],
  };
}

export class DefaultConversationManager implements ConversationManager {
  constructor(private readonly dependencies: ConversationManagerDependencies) {}

  start(): ConversationState {
    return buildInitialState();
  }

  async handleUserMessage(
    state: ConversationState,
    message: string,
    onContentChunk?: (chunk: string) => void,
  ): Promise<ConversationTurnResult> {
    if (state.currentConversationStep === 'completed') {
      return this.withAssistantAction(
        {
          ...state,
          conversationHistory: appendMessage(state.conversationHistory, 'user', message),
          lastUserMessage: message,
        },
        {
          type: 'respond',
          message: 'This claim conversation is already completed.',
        },
      );
    }

    const historyWithUser = appendMessage(state.conversationHistory, 'user', message);
    
    const extractionResult = await this.dependencies.extractClaimData.extract({
      userMessage: message,
      state: { ...state, conversationHistory: historyWithUser },
      onContentChunk,
    });

    let updatedClaim = state.currentClaim;
    let isEscalated = false;
    let escalationReason = '';
    let policyVerificationTriggered = false;
    let policyNumberToVerify = '';
    let callerNameToVerify = '';
    let claimCompleted = false;

    if (extractionResult.toolCalls) {
       for (const call of extractionResult.toolCalls) {
           if (call.name === 'save_claim_data' && call.args) {
               const patch = validateClaimPatch(call.args as Partial<Claim>);
               const normalizedPatch = normalizeClaimPatch(patch);
               updatedClaim = mergeClaim(updatedClaim, normalizedPatch);
           } else if (call.name === 'escalate_claim' && call.args) {
               isEscalated = true;
               escalationReason = (call.args.reason as string) || 'safety_check_failed';
           } else if (call.name === 'verify_policy' && call.args) {
               policyVerificationTriggered = true;
               policyNumberToVerify = call.args.policyNumber as string;
               callerNameToVerify = call.args.callerName as string;
           } else if (call.name === 'complete_claim') {
               claimCompleted = true;
           }
       }
    }

    if (isEscalated) {
        return this.withAssistantAction(
            { ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, currentConversationStep: 'escalation' },
            { type: 'escalate', message: extractionResult.responseToUser || 'I understand this is an emergency. Please hang up and dial emergency services immediately.', reason: escalationReason },
            extractionResult.debugMetrics
        );
    }

    if (policyVerificationTriggered && !state.verifiedPolicy) {
        const verifyResult = await this.dependencies.verifyPolicy.verify({
            policyNumber: policyNumberToVerify,
            callerName: callerNameToVerify,
        });

        if (verifyResult.verified && verifyResult.policy) {
            const nextState = this.updateFieldTracking({
              ...state,
              currentClaim: updatedClaim,
              conversationHistory: historyWithUser,
              verifiedPolicy: verifyResult.policy,
              lastUserMessage: message,
            });

            return this.withAssistantAction(
                nextState,
                { type: 'respond', message: extractionResult.responseToUser || "I've verified your policy. Please go ahead and describe the incident." },
                extractionResult.debugMetrics
            );
        } else {
            const systemNote = `[System Note]: Policy Verification Failed - Reason: ${verifyResult.message}. Gently inform the user and ask them to clarify.`;
            const fallbackExtraction = await this.dependencies.extractClaimData.extract({
                userMessage: message + '\n\n' + systemNote,
                state: { ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser },
                onContentChunk
            });

            return this.withAssistantAction(
                { ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, lastUserMessage: message },
                { type: 'request_clarification', message: fallbackExtraction.responseToUser || "I was unable to verify that policy number. Could you please double-check and repeat the policy number and your name?" },
                fallbackExtraction.debugMetrics
            );
        }
    }

    if (claimCompleted) {
        return this.completeClaim(state, updatedClaim, historyWithUser, message, extractionResult.responseToUser, extractionResult.debugMetrics);
    }

    const trackedState = this.updateFieldTracking({
      ...state,
      currentClaim: updatedClaim,
      conversationHistory: historyWithUser,
      pendingClarifications: [],
      lastUserMessage: message,
    });
    return this.withAssistantAction(trackedState, {
       type: 'respond',
       message: extractionResult.responseToUser || 'I have updated your claim details.'
    }, extractionResult.debugMetrics);
  }

  private async completeClaim(
    state: ConversationState,
    updatedClaim: Claim,
    conversationHistory: ConversationMessage[],
    message: string,
    responseToUser: string,
    extractionDebug?: any
  ): Promise<ConversationTurnResult> {
    if (!state.verifiedPolicy) {
      return this.withAssistantAction(state, {
        type: 'request_clarification',
        message: 'Please verify the policy before completing the claim.',
      }, extractionDebug);
    }

    const claimReferenceNumber =
      updatedClaim.claimReferenceNumber ??
      this.dependencies.claimNumberGenerator.generate();
    const completedClaim: Claim = {
      ...updatedClaim,
      claimReferenceNumber,
    };

    if (state.severity) {
      completedClaim.severityClassification = state.severity;
    }

    const summaryResult = await this.dependencies.generateSummary.generate({
      claim: completedClaim,
      verifiedPolicy: state.verifiedPolicy,
      state: {
        ...state,
        currentClaim: completedClaim,
      },
    });
    const persistedSummary = summaryResult.llmSummary ?? summaryResult.summary;
    const claimWithSummary: Claim = {
      ...completedClaim,
      callSummary: persistedSummary,
    };
    const nextState = this.updateFieldTracking({
      ...state,
      currentClaim: claimWithSummary,
      conversationHistory,
      currentConversationStep: 'completed',
      lastUserMessage: message,
    });
    await this.dependencies.claimLogger.log({
      claimNumber: claimReferenceNumber,
      summary: persistedSummary,
      timestamp: timestamp(),
      claim: claimWithSummary,
      verifiedPolicy: state.verifiedPolicy,
      conversationHistory,
      escalationRequired: nextState.escalationRequired,
    });

    return this.withAssistantAction(nextState, {
      type: 'complete',
      message: responseToUser,
      claim: claimWithSummary,
    }, extractionDebug);
  }

  private updateFieldTracking(state: ConversationState): ConversationState {
    return {
      ...state,
      collectedFields: calculateCollectedFields(state.currentClaim),
      missingFields: calculateMissingFields(state.currentClaim),
    };
  }

  private async withAssistantAction(
    state: ConversationState,
    action: ConversationAction,
    extractionDebug?: any
  ): Promise<ConversationTurnResult> {
    const nextHistory = appendMessage(
      state.conversationHistory,
      'assistant',
      action.message,
    );

    return {
      state: {
        ...state,
        conversationHistory: nextHistory,
        lastAssistantMessage: action.message,
      },
      action: action,
      debugMetrics: {
        rawExtractedSlots: extractionDebug?.rawExtractedSlots ?? {},
        geminiPrompt: extractionDebug?.geminiPrompt ?? '',
        geminiResponse: extractionDebug?.geminiResponse ?? '',
      }
    };
  }
}

export function createConversationManager(
  dependencies: ConversationManagerDependencies,
): ConversationManager {
  return new DefaultConversationManager(dependencies);
}

export type { ConversationManager };
