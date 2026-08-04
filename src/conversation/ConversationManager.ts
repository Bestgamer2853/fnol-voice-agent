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
import type { LlmProvider } from '../llm/provider.js';
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
import type { UsageMetadata } from '../llm/provider.js';
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
  llmProvider: LlmProvider;
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

function validateClaimPatch(patch: Partial<Claim>, state: ConversationState): { validatedPatch: Partial<Claim>, pendingClarifications: string[] } {
  const validatedPatch: Partial<Claim> = {};
  const pendingClarifications: string[] = [];
  
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

    if (make) vehiclePatch.make = make;
    if (model) vehiclePatch.model = model;
    
    if (registration) {
        const normReg = registration.replace(/[^a-z0-9]/gi, '').toUpperCase();
        if (normReg.length < 4) {
            pendingClarifications.push(`The vehicle registration "${registration}" seems invalid. Can you repeat it?`);
        } else {
            vehiclePatch.registration = normReg;
        }
    }

    if (Object.keys(vehiclePatch).length > 0) {
      validatedPatch.insuredVehicle = vehiclePatch;
    }
  }

  return { validatedPatch, pendingClarifications };
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
    servicesRecommended: false,
  };
}

/**
 * DefaultConversationManager acts as the central Finite State Machine (FSM) orchestrator.
 * It coordinates between the Retell websocket events, the Gemini LLM for extraction, and 
 * the deterministic business rules for policy verification and escalation.
 * 
 * Key Architecture Note: This class enforces a strict separation between 
 * surface-level language generation (handled by the LLM) and business state 
 * transitions (handled here deterministically).
 */
export class DefaultConversationManager implements ConversationManager {
  constructor(private readonly dependencies: ConversationManagerDependencies) {}

  start(): ConversationState {
    return buildInitialState();
  }

  /**
   * Processes a single turn of conversation from the user.
   * 
   * Flow:
   * 1. Check for early exits (if call is already complete/escalated).
   * 2. Send the message to the LLM (ExtractClaimDataService) to extract structured JSON data.
   * 3. Merge the newly extracted fields into the ongoing `ConversationState`.
   * 4. Run deterministic checks (e.g. "did the user report an injury?").
   * 5. Verify the policy if sufficient data is collected.
   * 6. Recommend services or finalize the claim if all required fields are present.
   * 
   * @param state The immutable current state of the conversation.
   * @param message The transcribed text from the user.
   * @param onContentChunk Optional callback for streaming response tokens back to the user.
   * @param abortSignal Allows terminating in-flight LLM calls if the user interrupts.
   */
  async handleUserMessage(
    state: ConversationState,
    message: string,
    onContentChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<ConversationTurnResult> {
    console.log(`\n\n[ConversationManager] ENTERING handleUserMessage`);
    console.log(`[ConversationManager] State step before: ${state.currentConversationStep}`);
    console.log(`[ConversationManager] User message: "${message}"`);
    if (state.currentConversationStep === 'completed' || state.currentConversationStep === 'escalation' || state.currentConversationStep === 'callback_offer') {
      if (state.currentConversationStep === 'escalation') {
        return this.withAssistantAction({ ...state, lastUserMessage: message }, { type: 'escalate', message: 'I understand this is an emergency. Please hang up and dial emergency services immediately.', reason: 'Severe incident or injury reported.' }, {});
      }
      if (state.currentConversationStep === 'callback_offer') {
        return this.withAssistantAction({ ...state, lastUserMessage: message }, { type: 'complete', message: 'A claims agent will call you back shortly. Goodbye.', claim: state.currentClaim }, {});
      }
      if (this.isFinalAck(message)) {
        return this.withAssistantAction(
          { ...state, lastUserMessage: message },
          {
            type: 'complete',
            message: "You're welcome. Thank you for choosing Meridian Motor Insurance. Have a safe day.",
            claim: state.currentClaim,
          },
          {}
        );
      } else {
        return this.withAssistantAction(
          { ...state, lastUserMessage: message },
          {
            type: 'complete',
            message: "Your claim has been submitted. Have a safe day.",
            claim: state.currentClaim,
          },
          {}
        );
      }
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
    
    const extractionStartTime = Date.now();
    const extractionResult = await this.dependencies.extractClaimData.extract({
        userMessage: message,
        state: { 
            ...state, 
            conversationHistory: historyWithUser, 
            currentClaim: updatedClaim, 
            ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}) 
        },
        onContentChunk: onContentChunk,
        ...(abortSignal ? { abortSignal } : {})
    });
    const extractionLatency = Date.now() - extractionStartTime;
    console.log(`[ConversationManager] finishReason: ${extractionResult.finishReason}`);
    
    let accumulatedResponse = extractionResult.responseToUser;
    
    // Removed anti-repetition logic loop
    
    finalExtractionResult = extractionResult;
    let newClarifications: PendingClarification[] = [];
    
    if (extractionResult.debugMetrics && extractionResult.debugMetrics.rawExtractedSlots) {
        const rawSlots = extractionResult.debugMetrics.rawExtractedSlots as any;
        const confidence = typeof rawSlots.confidence === 'number' ? rawSlots.confidence : 1.0;
        
        // Remove confidence before validation
        delete rawSlots.confidence;
        
        const { validatedPatch, pendingClarifications } = validateClaimPatch(rawSlots as Partial<Claim>, state);
        const normalizedPatch = normalizeClaimPatch(validatedPatch);
        
        updatedClaim = mergeClaim(updatedClaim, normalizedPatch);
        
        if (pendingClarifications.length > 0) {
            for (const c of pendingClarifications) {
                newClarifications.push({ field: 'insuredVehicle', prompt: c });
            }
        }
        
        // Print Metrics Block
        const tokens = (extractionResult as any).usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
        console.log(`\n[METRICS] Turn #${state.conversationHistory.length / 2 + 1}`);
        console.log(`[METRICS] Latency: ${extractionLatency}ms`);
        console.log(`[METRICS] PromptTokens: ${tokens.promptTokenCount}, CompletionTokens: ${tokens.candidatesTokenCount}, TotalTokens: ${tokens.totalTokenCount}`);
        console.log(`[METRICS] MissingFields: ${calculateMissingFields(updatedClaim).join(', ')}`);
        console.log(`[METRICS] ExtractedFields: ${JSON.stringify(normalizedPatch)}\n`);
    }

    // --- DETERMINISTIC ESCALATION RULES ---
    // Instead of relying on the LLM to decide if an emergency is happening,
    // we use hardcoded Regex and boolean checks to immediately escalate and override the LLM.
    if (updatedClaim.injuriesReported === true || 
        /whiplash|neck|ambulance|hospital/i.test(updatedClaim.injuryDetails || '') || 
        /major|rollover|fire|fatal/i.test(updatedClaim.incidentDescription || '')) {
        isEscalated = true;
        escalationReason = 'Severe incident or injury reported.';
        state.severity = 'high';
    }

    if (isEscalated) {
        const nextState = this.updateFieldTracking({ ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, currentConversationStep: 'escalation', escalationRequired: true });
        const claimReferenceNumber = updatedClaim.claimReferenceNumber ?? this.dependencies.claimNumberGenerator.generate();
        updatedClaim.claimReferenceNumber = claimReferenceNumber;
        
        await this.dependencies.claimLogger.log({
            claimNumber: claimReferenceNumber,
            summary: `Escalated: ${escalationReason}`,
            timestamp: timestamp(),
            claim: updatedClaim,
            ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
            conversationHistory: historyWithUser,
            escalationRequired: true
        });

        return this.withAssistantAction(
            nextState,
            { type: 'escalate', message: accumulatedResponse.trim() || 'I understand this is an emergency. Please hang up and dial emergency services immediately.', reason: escalationReason },
            finalExtractionResult.debugMetrics
        );
    }

    // --- DETERMINISTIC POLICY VERIFICATION ---
    // If we have both the policy number and caller name, ping the external database mock.
    // If it fails twice, we branch the state machine into a 'callback_offer'.
    if (!verifiedPolicyObj && updatedClaim.policyNumber && updatedClaim.callerName && !callbackOffered) {
        const verifyResult = await this.dependencies.verifyPolicy.verify({
            policyNumber: updatedClaim.policyNumber,
            callerName: updatedClaim.callerName,
        });
        if (verifyResult.verified && verifyResult.policy) {
            verifiedPolicyObj = verifyResult.policy;
        } else {
            verificationAttempts++;
            if (verificationAttempts >= 2) {
                callbackOffered = true;
            }
        }
    }

    if (callbackOffered) {
        const nextState = { ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, currentConversationStep: 'callback_offer', verificationAttempts } as ConversationState;
        const claimReferenceNumber = updatedClaim.claimReferenceNumber ?? this.dependencies.claimNumberGenerator.generate();
        updatedClaim.claimReferenceNumber = claimReferenceNumber;

        await this.dependencies.claimLogger.log({
            claimNumber: claimReferenceNumber,
            summary: 'Callback offered due to failed verification.',
            timestamp: timestamp(),
            claim: updatedClaim,
            ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
            conversationHistory: historyWithUser,
            escalationRequired: false
        });

        return this.withAssistantAction(
            nextState,
            { type: 'complete', message: accumulatedResponse.trim() || 'I apologize, but I am unable to verify your policy details at this time. A claims agent will call you back shortly to assist you. Goodbye.', claim: updatedClaim },
            finalExtractionResult.debugMetrics
        );
    }

    // Deterministic Completion Check
    if (verifiedPolicyObj) {
        const missing = calculateMissingFields(updatedClaim);
        if (missing.length === 0) {
            if (!state.servicesRecommended) {
                const recommendations = await this.dependencies.recommendServices.recommend({ claim: updatedClaim, policy: verifiedPolicyObj });
                if (recommendations.recommendations.length > 0) {
                    updatedClaim.recommendedServices = recommendations.recommendations;
                    const trackedState = this.updateFieldTracking({
                        ...state,
                        currentClaim: updatedClaim,
                        conversationHistory: historyWithUser,
                        verifiedPolicy: verifiedPolicyObj,
                        pendingClarifications: newClarifications,
                        lastUserMessage: message,
                        verificationAttempts,
                        currentConversationStep: 'recommending_services',
                        servicesRecommended: true,
                    });
                    return this.withAssistantAction(trackedState, {
                        type: 'respond',
                        message: accumulatedResponse.trim() || 'Do you need towing or roadside assistance?'
                    }, finalExtractionResult.debugMetrics);
                } else {
                    // No services to recommend, proceed to complete
                    claimCompleted = true;
                }
            } else {
                claimCompleted = true;
            }
        }
    }

    if (claimCompleted) {
        return this.completeClaim(state, updatedClaim, historyWithUser, message, accumulatedResponse.trim(), finalExtractionResult.debugMetrics);
    }

    let nextStep = state.currentConversationStep;

    if (nextStep === 'safety_check') {
        if (!verifiedPolicyObj) {
            nextStep = 'verification';
        } else {
            nextStep = 'collecting_fnol';
        }
    }

    if (nextStep === 'verification' && verifiedPolicyObj) {
        nextStep = 'collecting_fnol';
    }

    if (newClarifications.length > 0) {
        nextStep = 'clarifying';
    } else if (nextStep === 'clarifying' && newClarifications.length === 0) {
        nextStep = verifiedPolicyObj ? 'collecting_fnol' : 'verification';
    }

    const trackedState = this.updateFieldTracking({
      ...state,
      currentClaim: updatedClaim,
      conversationHistory: historyWithUser,
      ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
      pendingClarifications: newClarifications,
      lastUserMessage: message,
      verificationAttempts,
      currentConversationStep: nextStep,
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
    // Trigger persistence & notification asynchronously in background so WebSocket response returns immediately to Retell without network latency hang
    Promise.resolve(
      this.dependencies.claimLogger.log({
        claimNumber: claimReferenceNumber,
        summary: persistedSummary,
        timestamp: timestamp(),
        claim: claimWithSummary,
        verifiedPolicy: state.verifiedPolicy,
        conversationHistory,
        escalationRequired: nextState.escalationRequired,
      })
    ).catch((err: unknown) => {
      console.error(`[ConversationManager] Background claim logging error for ${claimReferenceNumber}:`, err);
    });

    return this.withAssistantAction(nextState, {
      type: 'respond',
      message: responseToUser,
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
        usageMetadata: extractionDebug?.usageMetadata,
        retries: extractionDebug?.retries ?? 0,
        ...(extractionDebug?.ttfbMs !== undefined ? { ttfbMs: extractionDebug.ttfbMs } : {}),
        ...(extractionDebug?.ttftMs !== undefined ? { ttftMs: extractionDebug.ttftMs } : {}),
      }
    };
  }

  private isFinalAck(userMessage: string): boolean {
    const normalized = userMessage.trim().toLowerCase();
    
    if (/\b(what|when|how|where|why|can|could|will|would|is|do|does|have|one more|another)\b/i.test(normalized) || normalized.includes('?')) {
      return false;
    }
    
    const completionPattern = /\b(no|nope|nah|nothing|that's all|thats all|all set|i'm good|im good|thanks|thank you|bye|goodbye|that's it|thats it|nothing else|no thanks|no thank you|everything|all good)\b/i;
    
    return completionPattern.test(normalized);
  }
}

export function createConversationManager(
  dependencies: ConversationManagerDependencies,
): ConversationManager {
  return new DefaultConversationManager(dependencies);
}

export type { ConversationManager };
