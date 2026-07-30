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
    verificationAttempts: 0,
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
    console.log(`\n\n[ConversationManager] ENTERING handleUserMessage`);
    console.log(`[ConversationManager] State step before: ${state.currentConversationStep}`);
    console.log(`[ConversationManager] User message: "${message}"`);
    if (state.currentConversationStep === 'completed') {
      return this.withAssistantAction(
        { ...state, lastUserMessage: message },
        { type: 'complete', message: 'Goodbye, have a great day.', claim: state.currentClaim },
        {}
      );
    }

    const historyWithUser = appendMessage(state.conversationHistory, 'user', message);
    
    let updatedClaim = state.currentClaim;
    let isEscalated = false;
    let escalationReason = '';
    let callbackOffered = false;
    let claimCompleted = false;
    let finalExtractionResult: any = null;
    let verifiedPolicyObj = state.verifiedPolicy;
    let verificationAttempts = state.verificationAttempts || 0;
    
    const toolContext: { assistantMessage: string, toolCalls: any[], toolResults: any[] }[] = [];
    
    let iterations = 0;
    const MAX_TOOL_ITERATIONS = 5;
    let accumulatedResponse = '';
    
    while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        console.log(`\n[ConversationManager] ====== LOOP ITERATION ${iterations} ======`);
        const extractionResult = await this.dependencies.extractClaimData.extract({
            userMessage: message,
            state: { 
                ...state, 
                conversationHistory: historyWithUser, 
                currentClaim: updatedClaim, 
                ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}) 
            },
            onContentChunk: onContentChunk,
            ...(toolContext.length > 0 ? { toolContext } : {})
        });
        console.log(`[ConversationManager] Iteration ${iterations} finishReason: ${extractionResult.finishReason}`);
        console.log(`[ConversationManager] Iteration ${iterations} toolCalls count: ${extractionResult.toolCalls?.length || 0}`);
        
        if (extractionResult.responseToUser) {
            accumulatedResponse += (accumulatedResponse ? ' ' : '') + extractionResult.responseToUser;
        }
        finalExtractionResult = extractionResult;
        
        if (extractionResult.toolCalls && extractionResult.toolCalls.length > 0) {
            const results = [];
            
            for (const call of extractionResult.toolCalls) {
                console.log(`[ConversationManager]   -> Executing tool: ${call.name}`);
                console.log(`[ConversationManager]      Args: ${JSON.stringify(call.args)}`);
                let toolResultStr = "Success";
                
                if (call.name === 'save_claim_data' && call.args) {
                    const patch = validateClaimPatch(call.args as Partial<Claim>);
                    const normalizedPatch = normalizeClaimPatch(patch);
                    updatedClaim = mergeClaim(updatedClaim, normalizedPatch);
                    toolResultStr = JSON.stringify({ success: true, savedFields: Object.keys(normalizedPatch) });
                } else if (call.name === 'escalate_claim' && call.args) {
                    isEscalated = true;
                    escalationReason = (call.args.reason as string) || 'safety_check_failed';
                    toolResultStr = JSON.stringify({ success: true, escalated: true });
                } else if (call.name === 'verify_policy' && call.args) {
                    const verifyResult = await this.dependencies.verifyPolicy.verify({
                        policyNumber: call.args.policyNumber as string,
                        callerName: call.args.callerName as string,
                    });
                    if (verifyResult.verified && verifyResult.policy) {
                        verifiedPolicyObj = verifyResult.policy;
                    } else {
                        verificationAttempts++;
                        if (verificationAttempts >= 2) {
                            callbackOffered = true;
                            toolResultStr = JSON.stringify({ error: 'Maximum verification attempts reached. You MUST apologize and inform the user that a human agent will call them back to assist further. Do NOT ask for policy details again.' });
                        }
                    }
                    if (!callbackOffered) {
                        toolResultStr = JSON.stringify(verifyResult);
                    }
                } else if (call.name === 'complete_claim') {
                    const missing = calculateMissingFields(updatedClaim);
                    if (missing.length === 0) {
                        claimCompleted = true;
                        toolResultStr = JSON.stringify({ success: true, completed: true });
                    } else {
                        toolResultStr = JSON.stringify({ error: `Cannot complete claim. You are still missing the following fields: ${missing.join(', ')}. Ask the user for them.` });
                    }
                }
                
                console.log(`[ConversationManager]      Result: ${toolResultStr}`);
                results.push({ id: call.id, name: call.name, result: toolResultStr });
            }
            
            toolContext.push({
                assistantMessage: extractionResult.responseToUser,
                toolCalls: extractionResult.toolCalls,
                toolResults: results
            });
            
            if (extractionResult.finishReason === 'tool_calls' || extractionResult.toolCalls.length > 0) {
                continue;
            }
        }
        
        break;
    }

    if (isEscalated) {
        return this.withAssistantAction(
            { ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, currentConversationStep: 'escalation' },
            { type: 'escalate', message: accumulatedResponse.trim() || 'I understand this is an emergency. Please hang up and dial emergency services immediately.', reason: escalationReason },
            finalExtractionResult.debugMetrics
        );
    }

    if (callbackOffered) {
        return this.withAssistantAction(
            { ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, currentConversationStep: 'callback_offer', verificationAttempts },
            { type: 'complete', message: accumulatedResponse.trim() || 'I apologize, but I am unable to verify your policy details at this time. A claims agent will call you back shortly to assist you. Goodbye.', claim: updatedClaim },
            finalExtractionResult.debugMetrics
        );
    }

    if (claimCompleted) {
        return this.completeClaim(state, updatedClaim, historyWithUser, message, accumulatedResponse.trim(), finalExtractionResult.debugMetrics);
    }

    const trackedState = this.updateFieldTracking({
      ...state,
      currentClaim: updatedClaim,
      conversationHistory: historyWithUser,
      ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
      pendingClarifications: [],
      lastUserMessage: message,
      verificationAttempts,
    });
    
    console.log(`[ConversationManager] EXITING handleUserMessage normally. Action message: "${accumulatedResponse.trim()}"`);
    return this.withAssistantAction(trackedState, {
       type: 'respond',
       message: accumulatedResponse.trim() || 'I have updated your claim details.'
    }, finalExtractionResult.debugMetrics);
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
