/**
 * @file ConversationManager.ts
 * @description Central Finite State Machine (FSM) and business orchestrator for the FNOL Voice Agent.
 *
 * @responsibilities
 * - Orchestrates the flow between Voice Transcript -> LLM Extraction -> Business Validation.
 * - Enforces state progression (e.g., verifying a policy before collecting accident details).
 * - Implements deterministic overrides for critical insurance logic (e.g., Escalation).
 *
 * @architecture_position
 * Core Domain Layer. It sits between the transport layer (server.ts) and the 
 * external services layer (ExtractClaimData, VerifyPolicy, Google Sheets logger).
 *
 * @interview_talking_points
 * - "Why separate extraction from conversation flow?"
 *   -> Because LLMs are probabilistic text generators, but insurance workflows require 
 *      deterministic compliance checks. By splitting them, we get natural voice interaction
 *      with rigid backend business guarantees.
 */

import {
  REQUIRED_FNOL_FIELDS,
  type TrackableFnolField,
} from '../config/requiredFields.js';
import {
  COMPANY_NAME,
  MAX_VERIFICATION_RETRIES,
  ESCALATION_KEYWORDS,
  HIGH_SEVERITY_KEYWORDS,
  MEDIUM_SEVERITY_KEYWORDS,
} from '../config/constants.js';
import type { ClaimLoggerService } from '../services/claimLogger.js';
import type { ExtractClaimDataService } from '../services/extractClaimData.js';
import type { GenerateSummaryService } from '../services/generateSummary.js';
import type { LlmProvider } from '../llm/provider.js';
import type { RecommendServicesService } from '../services/recommendServices.js';
import type { VerifyPolicyService } from '../services/verifyPolicy.js';
import { normalizeClaimPatch } from '../services/normalizeClaimData.js';
import type { Claim } from '../types/claim.js';
import type { Policy } from '../types/policy.js';
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

function isKeywordNegated(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const keywordIndex = lowerText.indexOf(keyword);
  
  if (keywordIndex === -1) return false;
  
  const beforeKeyword = lowerText.substring(Math.max(0, keywordIndex - 30), keywordIndex);
  
  // If there is a clause separator (comma, period, semicolon) before the keyword, only check text after the separator
  const separatorMatch = /[,;.]\s*([^,;.]*)$/.exec(beforeKeyword);
  const relevantText = separatorMatch ? separatorMatch[1] : beforeKeyword;

  const negationPatterns = [
    'no ', 'not ', 'never ', 'nobody', 'without ', 'none ', 'nothing ', 'zero ',
    'no one', 'nobody\'s', 'everyone is fine', 'everyone is okay', 'not injured',
    'not hurt', 'no injuries', 'no injury', 'never injured'
  ];
  
  return negationPatterns.some(pattern => (relevantText || '').includes(pattern));
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

function servicePrompt(services: string[]): string {
  const hasTowing = services.includes('towing') || services.includes('roadside assistance');
  const hasRental = services.includes('rental car');

  if (hasTowing && hasRental) {
    return 'Would you like us to arrange towing for your vehicle and a rental car for you?';
  }

  if (hasTowing) {
    return 'Would you like us to arrange towing or roadside assistance for your vehicle?';
  }

  if (hasRental) {
    return 'Would you like us to arrange a rental car for you?';
  }

  return 'Do you need any additional assistance with your claim?';
}

function parseServiceChoices(
  pendingServices: string[],
  userMessage: string,
): { decisions: Map<string, boolean>; hasDecision: boolean } {
  const msg = userMessage.toLowerCase();
  const decisions = new Map<string, boolean>();
  const declinedAll = /\b(no thanks|neither|none|don'?t need any|no services|no help)\b/i.test(msg);
  const acceptedAll = /\b(yes|yeah|yep|please|go ahead|arrange (?:them|it|both))\b/i.test(msg)
    && !/\b(no|don'?t|do not)\b/i.test(msg);

  for (const service of pendingServices) {
    if (service === 'towing' || service === 'roadside assistance') {
      if (/\b(no towing|don'?t need towing|no tow truck|no tow|no roadside)\b/i.test(msg)) {
        decisions.set(service, false);
      } else if (/\b(towing|tow truck|tow my car|roadside assistance|yes to towing)\b/i.test(msg)) {
        decisions.set(service, true);
      } else if (declinedAll) {
        decisions.set(service, false);
      } else if (acceptedAll) {
        decisions.set(service, true);
      }
    }

    if (service === 'rental car') {
      if (/\b(no rental|don'?t need a rental|no car rental|don'?t need to rent|no rent)\b/i.test(msg)) {
        decisions.set(service, false);
      } else if (/\b(rental|rent a car|car rental|rent car|need a car|rental car|rent)\b/i.test(msg)) {
        decisions.set(service, true);
      } else if (declinedAll) {
        decisions.set(service, false);
      } else if (acceptedAll) {
        decisions.set(service, true);
      }
    }
  }

  return { decisions, hasDecision: decisions.size > 0 };
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

function buildDeterministicCollectionPrompt(
  missingFields: TrackableFnolField[],
  claim: Claim,
  policy?: Policy,
): string {
  const field = missingFields[0];

  if (!field) {
    return 'Thank you. I have the details I need so far.';
  }

  switch (field) {
    case 'policyNumber':
      return 'Could you please provide your policy number?';
    case 'callerName':
      return 'May I have your full name as it appears on the policy?';
    case 'dateOfIncident':
      return 'What date did the incident happen?';
    case 'timeOfIncident':
      return 'What time did the incident happen?';
    case 'locationOfIncident':
      return 'Where did the incident take place?';
    case 'incidentDescription':
      return 'Could you briefly describe what happened?';
    case 'insuredVehicle':
      if (policy?.vehicle && hasCompleteVehicle(policy.vehicle)) {
        const vehicle = policy.vehicle;
        return `I have your insured vehicle as a ${vehicle.make} ${vehicle.model}, registration ${vehicle.registration}. Is that the vehicle involved in this incident?`;
      }
      return 'Could you confirm the make, model, and registration number of your insured vehicle?';
    case 'injuriesReported':
      return 'Were there any injuries?';
    case 'injuryDetails':
      return 'Could you briefly describe the injuries?';
    case 'policeReportFiled':
      return 'Was a police report filed for this incident?';
    case 'policeReportReference':
      return 'Do you have the police report reference number?';
    case 'photosAvailable':
      return 'Do you have photos of the damage available?';
    case 'vehicleDrivable':
      return 'Is your vehicle still drivable after the incident?';
    case 'otherParties':
      return 'Were any other parties or vehicles involved?';
    default:
      return firstMissingFieldPrompt(missingFields);
  }
}

function extractBriefAcknowledgment(message: string): string | undefined {
  const trimmed = message.trim();
  const sentenceMatch = /^(.{0,80}?[.!])\s/m.exec(trimmed);

  if (!sentenceMatch?.[1]) {
    return undefined;
  }

  const prefix = sentenceMatch[1].trim();
  const questionCount = (prefix.match(/\?/g) ?? []).length;

  if (questionCount > 0 || prefix.length > 90) {
    return undefined;
  }

  return prefix;
}

function resolveCollectionResponse(
  llmResponse: string,
  missingFields: TrackableFnolField[],
  claim: Claim,
  policy: Policy | undefined,
  step: ConversationState['currentConversationStep'],
  pendingClarifications: PendingClarification[],
): string {
  if (pendingClarifications.length > 0) {
    return llmResponse.trim() || firstMissingFieldPrompt(missingFields);
  }

  if (
    step !== 'collecting_fnol'
    && step !== 'verification'
    && step !== 'clarifying'
  ) {
    return llmResponse.trim() || 'Thank you for that information.';
  }

  if (missingFields.length === 0) {
    return llmResponse.trim() || 'Thank you for that information.';
  }

  const deterministicPrompt = buildDeterministicCollectionPrompt(
    missingFields,
    claim,
    policy,
  );
  const acknowledgment = extractBriefAcknowledgment(llmResponse);

  if (acknowledgment) {
    return `${acknowledgment} ${deterministicPrompt}`;
  }

  return deterministicPrompt;
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

  const initialState: ConversationState = {
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
    pendingServiceChoices: [],
  };
  
  return initialState;
}

/**
 * DefaultConversationManager acts as the central Finite State Machine (FSM) orchestrator.
 * It coordinates between the Retell websocket events, the Gemini LLM for extraction, and 
 * the deterministic business rules for policy verification and escalation.
 * 
 * Key Architecture Note: This class enforces a strict separation between 
 * surface-level language generation (handled by the LLM) and business state 
 * transitions (handled here deterministically).
 * 
 * @dependencies
 * - verifyPolicy: Mock database lookup for insurance policies.
 * - extractClaimData: The LLM wrapper for generating JSON slots from raw voice text.
 * - recommendServices: Deterministic logic to offer Towing/Adjuster based on the policy.
 * - claimLogger: Parallel outbox writer for saving the claim.
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
    
    // Post-completion handling: if claim is already completed, allow the user
    // to ask follow-up questions via the LLM, but if they give a final ack
    // (e.g., "thanks", "bye"), end the call cleanly.
    if (state.currentConversationStep === 'completed') {
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
      }
      // Non-final-ack: pass through to LLM so user can ask follow-up questions
    }
    
    // Callback offer handling - end call if verification failed
    if (state.currentConversationStep === 'callback_offer') {
      return this.withAssistantAction({ ...state, lastUserMessage: message }, { type: 'complete', message: 'A claims agent will call you back shortly. Goodbye.', claim: state.currentClaim }, {});
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
    finalExtractionResult = extractionResult;
    
    if (extractionResult.finishReason === 'FALLBACK_EXHAUSTED') {
        console.warn(`[ConversationManager] FALLBACK_EXHAUSTED detected. Generating emergency claim logging.`);
        const claimReferenceNumber = updatedClaim.claimReferenceNumber ?? this.dependencies.claimNumberGenerator.generate();
        updatedClaim.claimReferenceNumber = claimReferenceNumber;
        
        // Preserve the caller's in-progress conversation if the provider is unavailable.
        void Promise.resolve(this.dependencies.claimLogger.log({
                claimNumber: claimReferenceNumber,
                summary: `Connection failed: FALLBACK_EXHAUSTED. Saving current progress.`,
                timestamp: timestamp(),
                claim: updatedClaim,
                ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
                conversationHistory: historyWithUser,
                escalationRequired: false
            })).catch((err: unknown) => {
            console.error(`[ConversationManager] Emergency claim logging error for ${claimReferenceNumber}:`, err);
        });

        // Keep conversation in current state but respond with error message
        // Don't complete the call - let it continue for recovery
        const nextState = this.updateFieldTracking({ 
            ...state, 
            currentClaim: updatedClaim, 
            conversationHistory: historyWithUser,
            currentConversationStep: state.currentConversationStep
        });
        return this.withAssistantAction(
            nextState,
            { type: 'respond', message: accumulatedResponse },
            finalExtractionResult.debugMetrics
        );
    }
    
    let newClarifications: PendingClarification[] = [];
    
    if (extractionResult.debugMetrics && extractionResult.debugMetrics.rawExtractedSlots) {
        const rawSlots = extractionResult.debugMetrics.rawExtractedSlots as any;
        const confidence = typeof rawSlots.confidence === 'number' ? rawSlots.confidence : 1.0;
        
        // Remove confidence before validation
        delete rawSlots.confidence;
        
        // ----------------------------------------
        // STEP 4: FSM STATE MERGE & VALIDATION
        // We take the newly extracted slots from the LLM, run regex validations
        // (e.g. stripping bad characters from license plates), and merge them
        // into the global session state.
        // ----------------------------------------
        const { validatedPatch, pendingClarifications } = validateClaimPatch(rawSlots as Partial<Claim>, state);
        const normalizedPatch = normalizeClaimPatch(validatedPatch);
        
        updatedClaim = mergeClaim(updatedClaim, normalizedPatch);

        if (
          verifiedPolicyObj?.vehicle
          && hasCompleteVehicle(verifiedPolicyObj.vehicle)
          && !hasCompleteVehicle(updatedClaim.insuredVehicle)
          && /\b(yes|yeah|yep|correct|that'?s right|that is correct)\b/i.test(message)
        ) {
          updatedClaim = mergeClaim(updatedClaim, {
            insuredVehicle: verifiedPolicyObj.vehicle,
          });
        }
        
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
    // ⭐ INTERVIEW HOTSPOT: Deterministic Escalation
    // Interviewer: "Why don't you just ask the LLM to classify if it's an emergency?"
    // Answer: "Because LLMs can hallucinate or fail to recognize nuanced emergencies. 
    // By using regex on the output stream deterministically, we guarantee compliance 
    // and safety overrides immediately, regardless of what the LLM 'thinks'."
    const escalationText = [
      updatedClaim.injuryDetails || '',
      updatedClaim.incidentDescription || '',
      message,
    ].join(' ').toLowerCase();

    const matchedEscalationKeyword = ESCALATION_KEYWORDS.find(kw => escalationText.includes(kw));

    // Only escalate if keyword is not negated (e.g., "no one is hurt" should not escalate)
    const keywordNegated = matchedEscalationKeyword && isKeywordNegated(escalationText, matchedEscalationKeyword);

    let turnSeverity = state.severity;
    let turnEscalationRequired = state.escalationRequired;
    let turnEscalationReason = state.escalationReason;

    if (updatedClaim.injuriesReported === true || 
        (matchedEscalationKeyword && !keywordNegated)) {
        isEscalated = true;
        turnEscalationRequired = true;
        turnEscalationReason = matchedEscalationKeyword 
          ? `Escalation keyword detected: "${matchedEscalationKeyword}".`
          : 'Severe incident or injury reported.';

        // Determine severity: Escalated claims default to high severity
        turnSeverity = 'high';
    }

    // Assign medium severity for injury-adjacent keywords that don't trigger full escalation
    if (!isEscalated && !turnSeverity) {
      const isMediumSeverity = MEDIUM_SEVERITY_KEYWORDS.some(kw => 
        escalationText.includes(kw.toLowerCase()) && !isKeywordNegated(escalationText, kw.toLowerCase())
      );
      if (isMediumSeverity) {
        turnSeverity = 'medium';
      }
    }

    state = {
      ...state,
      ...(turnSeverity ? { severity: turnSeverity } : {}),
      escalationRequired: turnEscalationRequired,
      ...(turnEscalationReason ? { escalationReason: turnEscalationReason } : {}),
    };

    if (isEscalated) {
        console.log(`[ConversationManager] Escalation flagged: ${turnEscalationReason}. Continuing data collection.`);
        const claimReferenceNumber = updatedClaim.claimReferenceNumber ?? this.dependencies.claimNumberGenerator.generate();
        updatedClaim.claimReferenceNumber = claimReferenceNumber;

        void Promise.resolve(this.dependencies.claimLogger.log({
          claimNumber: claimReferenceNumber,
          summary: `Escalated: ${turnEscalationReason}`,
          timestamp: timestamp(),
          claim: updatedClaim,
          ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
          conversationHistory: historyWithUser,
          escalationRequired: true,
          severity: turnSeverity,
        })).catch((err: unknown) => {
          console.error(`[ConversationManager] Escalation claim logging error for ${claimReferenceNumber}:`, err);
        });
    }

    // --- DETERMINISTIC POLICY VERIFICATION ---
    // ⭐ INTERVIEW HOTSPOT: Business Rule Enforcement
    // If we have both the policy number and caller name, ping the external database mock.
    // We do NOT let the LLM verify policies. We do it here in the Node.js backend.
    // If it fails twice, we branch the state machine into a 'callback_offer' (terminal state).
    if (!verifiedPolicyObj && updatedClaim.policyNumber && updatedClaim.callerName && !callbackOffered) {
        const verifyResult = await this.dependencies.verifyPolicy.verify({
            policyNumber: updatedClaim.policyNumber,
            callerName: updatedClaim.callerName,
        });
        if (verifyResult.verified && verifyResult.policy) {
            verifiedPolicyObj = verifyResult.policy;
            if (hasCompleteVehicle(verifyResult.policy.vehicle)) {
              updatedClaim = mergeClaim(updatedClaim, {
                insuredVehicle: verifyResult.policy.vehicle,
              });
            }
        } else {
            verificationAttempts++;
            if (verificationAttempts >= 2) {
                callbackOffered = true;
            } else {
                // Attempt 1 failed: Override pre-verification LLM response to prevent asking for FNOL details
                const failedPolicy = updatedClaim.policyNumber;
                const failedName = updatedClaim.callerName;
                accumulatedResponse = `I'm sorry, I was unable to verify policy number ${failedPolicy} for ${failedName}. Could you please check and provide your policy number and full name again?`;

                // Reset policyNumber and callerName on claim patch so they are re-prompted
                delete updatedClaim.policyNumber;
                delete updatedClaim.callerName;
            }
        }
    }

    if (callbackOffered) {
        const nextState = { ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, currentConversationStep: 'callback_offer', verificationAttempts } as ConversationState;
        const claimReferenceNumber = updatedClaim.claimReferenceNumber ?? this.dependencies.claimNumberGenerator.generate();
        updatedClaim.claimReferenceNumber = claimReferenceNumber;

        void Promise.resolve(this.dependencies.claimLogger.log({
                claimNumber: claimReferenceNumber,
                summary: 'Callback offered due to failed verification.',
                timestamp: timestamp(),
                claim: updatedClaim,
                ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
                conversationHistory: historyWithUser,
                escalationRequired: false
        })).catch((err: unknown) => {
            console.error(`[ConversationManager] Callback offer claim logging error for ${claimReferenceNumber}:`, err);
        });

        const callbackMsg = 'I apologize, but I am unable to verify your policy details at this time. A claims agent will call you back shortly to assist you. Goodbye.';
        return this.withAssistantAction(
            nextState,
            { type: 'complete', message: callbackMsg, claim: updatedClaim },
            finalExtractionResult.debugMetrics
        );
    }

    // ----------------------------------------
    // DETERMINISTIC COMPLETION & SERVICE RECOMMENDATION
    // ----------------------------------------
    if (verifiedPolicyObj) {
        const missing = calculateMissingFields(updatedClaim);
        if (missing.length === 0) {
            // Once all required fields are collected (calculated via `REQUIRED_FNOL_FIELDS`),
            // we use the policy object to recommend services deterministically.
            if (!state.servicesRecommended) {
                const recommendations = await this.dependencies.recommendServices.recommend({ claim: updatedClaim, policy: verifiedPolicyObj });
                if (recommendations.recommendations.length > 0) {
                    updatedClaim.recommendedServices = recommendations.recommendations;
                    const recList = recommendations.recommendations;
                    const pendingServiceChoices = recList.filter((service) =>
                      service === 'towing' || service === 'roadside assistance' || service === 'rental car',
                    );
                    const prompt = servicePrompt(pendingServiceChoices);

                    const rawResponse = accumulatedResponse.trim();
                    // The deterministic question must include rental whenever it is offered.
                    // An LLM asking only about towing must not suppress the rental question.
                    const responseMessage = rawResponse && !/towing|roadside|rental|rent a car/i.test(rawResponse)
                        ? `${rawResponse} ${prompt}`
                        : prompt;

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
                        pendingServiceChoices,
                    });
                    return this.withAssistantAction(trackedState, {
                        type: 'respond',
                        message: responseMessage
                    }, finalExtractionResult.debugMetrics);
                } else {
                    claimCompleted = true;
                }
            } else {
                const currentServices = state.currentClaim.recommendedServices ?? [];
                const pendingServiceChoices = state.pendingServiceChoices ?? [];
                const { decisions, hasDecision } = parseServiceChoices(pendingServiceChoices, message);

                if (!hasDecision && pendingServiceChoices.length > 0) {
                    const trackedState = this.updateFieldTracking({
                      ...state,
                      currentClaim: updatedClaim,
                      conversationHistory: historyWithUser,
                      verifiedPolicy: verifiedPolicyObj,
                      pendingClarifications: newClarifications,
                      lastUserMessage: message,
                      verificationAttempts,
                      currentConversationStep: 'recommending_services',
                      pendingServiceChoices,
                    });
                    return this.withAssistantAction(trackedState, {
                      type: 'respond',
                      message: servicePrompt(pendingServiceChoices),
                    }, finalExtractionResult.debugMetrics);
                }

                if (decisions.has('towing') || decisions.has('roadside assistance')) {
                    const towingDecision = decisions.get('towing') ?? decisions.get('roadside assistance');
                    if (towingDecision !== undefined) {
                        updatedClaim.towingRequested = towingDecision;
                    }
                }
                if (decisions.has('rental car')) {
                    const rentalDecision = decisions.get('rental car');
                    if (rentalDecision !== undefined) {
                        updatedClaim.rentalRequested = rentalDecision;
                    }
                }

                const remainingServiceChoices = pendingServiceChoices.filter((service) => !decisions.has(service));
                if (remainingServiceChoices.length > 0) {
                    const trackedState = this.updateFieldTracking({
                      ...state,
                      currentClaim: updatedClaim,
                      conversationHistory: historyWithUser,
                      verifiedPolicy: verifiedPolicyObj,
                      pendingClarifications: newClarifications,
                      lastUserMessage: message,
                      verificationAttempts,
                      currentConversationStep: 'recommending_services',
                      pendingServiceChoices: remainingServiceChoices,
                    });
                    return this.withAssistantAction(trackedState, {
                      type: 'respond',
                      message: servicePrompt(remainingServiceChoices),
                    }, finalExtractionResult.debugMetrics);
                }

                updatedClaim.recommendedServices = currentServices.filter((service) => {
                  if (service === 'towing' || service === 'roadside assistance') {
                    return updatedClaim.towingRequested === true;
                  }
                  if (service === 'rental car') {
                    return updatedClaim.rentalRequested === true;
                  }
                  return true;
                });
                claimCompleted = true;
            }
        }
    }

    if (claimCompleted) {
        return this.completeClaim(
          verifiedPolicyObj ? { ...state, verifiedPolicy: verifiedPolicyObj } : state,
          updatedClaim,
          historyWithUser,
          message,
          accumulatedResponse.trim(),
          finalExtractionResult.debugMetrics,
        );
    }

    let nextStep = state.currentConversationStep;

    if (state.escalationRequired || isEscalated) {
        nextStep = 'escalation';
    } else if (nextStep === 'safety_check') {
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

    const responseMessage = resolveCollectionResponse(
      accumulatedResponse,
      trackedState.missingFields,
      trackedState.currentClaim,
      verifiedPolicyObj,
      trackedState.currentConversationStep,
      newClarifications,
    );
    
    console.log(`[ConversationManager] EXITING handleUserMessage normally. Action message: "${responseMessage}"`);
    const isEscalation = trackedState.escalationRequired;
    return this.withAssistantAction(trackedState, {
       type: isEscalation ? 'escalate' : 'respond',
       message: responseMessage,
       ...(isEscalation ? { reason: trackedState.escalationReason || 'Escalation required' } : {}),
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
      pendingServiceChoices: [],
    });
    
    // Completion is only committed after the durable logger resolves. Retell may
    // hang up immediately after a final acknowledgement, so detached persistence
    // could otherwise lose a completed FNOL record.
    void Promise.resolve(this.dependencies.claimLogger.log({
      claimNumber: claimReferenceNumber,
      summary: persistedSummary,
      timestamp: timestamp(),
      claim: claimWithSummary,
      verifiedPolicy: state.verifiedPolicy,
      conversationHistory,
      escalationRequired: nextState.escalationRequired,
    })).catch((err: unknown) => {
      console.error(`[ConversationManager] Background claim logging error for ${claimReferenceNumber}:`, err);
    });

    // If escalation is required, add escalation message to response
    let finalMessage = responseToUser;
    if (nextState.escalationRequired) {
      const escalationMsg = nextState.escalationReason 
        ? ` I've noted that this requires immediate attention due to: ${nextState.escalationReason} A claims specialist will contact you shortly.`
        : ' I\'ve noted that this requires immediate attention. A claims specialist will contact you shortly.';
      finalMessage = responseToUser + escalationMsg;
    }

    return this.withAssistantAction(nextState, {
      type: nextState.escalationRequired ? 'escalate' : 'respond',
      message: finalMessage,
      reason: nextState.escalationReason || 'Escalation required',
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
    const normalized = userMessage.trim().toLowerCase().replace(/['.!,-]/g, '');
    
    if (normalized.length > 60) {
      return false;
    }

    if (/\b(what|when|how|where|why|can|could|will|would|is|do|does|have|one more|another|need|forgot|change|correct)\b/i.test(normalized) || userMessage.includes('?')) {
      return false;
    }

    const exactCompletionPatterns = [
      'no', 'nope', 'nah', 'nothing', 'thats all', 'that is all', 'all set',
      'im good', 'i am good', 'thanks', 'thank you', 'bye', 'goodbye',
      'thats it', 'that is it', 'nothing else', 'no thanks', 'no thank you',
      'everything', 'all good', 'no further questions', 'im done', 'i am done',
      'no thats everything', 'no that is everything', 'thats everything', 'that is everything',
      'no thats all', 'no that is all', 'no thats it', 'no that is it', 'no nothing else'
    ];

    if (exactCompletionPatterns.includes(normalized)) {
      return true;
    }

    const shortCompletionRegex = /^(no|nope|nah|thanks|thank you|bye|goodbye|thats all|thats it|all good|no thanks|no thats everything|thats everything)( very much| a lot)?$/i;
    return shortCompletionRegex.test(normalized);
  }
}

export function createConversationManager(
  dependencies: ConversationManagerDependencies,
): ConversationManager {
  return new DefaultConversationManager(dependencies);
}

export type { ConversationManager };
