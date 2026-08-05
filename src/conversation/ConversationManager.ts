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

function parseServiceChoices(initialServices: string[] | undefined, userMessage: string): string[] {
  const msg = userMessage.toLowerCase();
  const current = new Set(initialServices ?? []);

  // Check explicit decline of towing
  if (/\b(no towing|don'?t need towing|no tow truck|no tow)\b/i.test(msg)) {
    current.delete('towing');
    current.delete('roadside assistance');
  } else if (/\b(towing|tow truck|tow my car|yes to towing)\b/i.test(msg)) {
    current.add('towing');
  }

  // Check explicit decline of rental car
  if (/\b(no rental|don'?t need a rental|no car rental|don'?t need to rent|no rent)\b/i.test(msg)) {
    current.delete('rental car');
  } else if (/\b(rental|rent a car|car rental|rent car|need a car|rental car|rent)\b/i.test(msg)) {
    current.add('rental car');
  }

  // Check for complete decline of all services
  if (/\b(no thanks|neither|none|don'?t need any|no services|no help)\b/i.test(msg)) {
    return [];
  }

  return Array.from(current);
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
    if (state.currentConversationStep === 'escalation' || state.currentConversationStep === 'callback_offer') {
      if (state.currentConversationStep === 'escalation') {
        return this.withAssistantAction({ ...state, lastUserMessage: message }, { type: 'escalate', message: 'I understand this is an emergency. Please hang up and dial emergency services immediately.', reason: 'Severe incident or injury reported.' }, {});
      }
      if (state.currentConversationStep === 'callback_offer') {
        return this.withAssistantAction({ ...state, lastUserMessage: message }, { type: 'complete', message: 'A claims agent will call you back shortly. Goodbye.', claim: state.currentClaim }, {});
      }
    }

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
        
        await this.dependencies.claimLogger.log({
            claimNumber: claimReferenceNumber,
            summary: `Connection failed: FALLBACK_EXHAUSTED. Saving current progress.`,
            timestamp: timestamp(),
            claim: updatedClaim,
            ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
            conversationHistory: historyWithUser,
            escalationRequired: false
        });

        const nextState = this.updateFieldTracking({ ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser });
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

    if (updatedClaim.injuriesReported === true || 
        matchedEscalationKeyword ||
        /major|rollover|fire|fatal/i.test(updatedClaim.incidentDescription || '')) {
        isEscalated = true;
        escalationReason = matchedEscalationKeyword 
          ? `Escalation keyword detected: "${matchedEscalationKeyword}".`
          : 'Severe incident or injury reported.';

        // Determine severity: HIGH takes precedence over MEDIUM
        const isHighSeverity = HIGH_SEVERITY_KEYWORDS.some(kw => escalationText.includes(kw));
        state.severity = isHighSeverity ? 'high' : 'high';
    }

    // Assign medium severity for injury-adjacent keywords that don't trigger full escalation
    if (!isEscalated && !state.severity) {
      const isMediumSeverity = MEDIUM_SEVERITY_KEYWORDS.some(kw => escalationText.includes(kw.toLowerCase()));
      if (isMediumSeverity) {
        state.severity = 'medium';
      }
    }

    if (isEscalated) {
        const nextState = this.updateFieldTracking({ ...state, currentClaim: updatedClaim, conversationHistory: historyWithUser, currentConversationStep: 'escalation', escalationRequired: true });
        const claimReferenceNumber = updatedClaim.claimReferenceNumber ?? this.dependencies.claimNumberGenerator.generate();
        updatedClaim.claimReferenceNumber = claimReferenceNumber;
        
        Promise.resolve(
            this.dependencies.claimLogger.log({
                claimNumber: claimReferenceNumber,
                summary: `Escalated: ${escalationReason}`,
                timestamp: timestamp(),
                claim: updatedClaim,
                ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
                conversationHistory: historyWithUser,
                escalationRequired: true
            })
        ).catch((err: unknown) => {
            console.error(`[ConversationManager] Escalation claim logging error for ${claimReferenceNumber}:`, err);
        });

        return this.withAssistantAction(
            nextState,
            { type: 'escalate', message: accumulatedResponse.trim() || 'I understand this is an emergency. Please hang up and dial emergency services immediately.', reason: escalationReason },
            finalExtractionResult.debugMetrics
        );
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

        Promise.resolve(
            this.dependencies.claimLogger.log({
                claimNumber: claimReferenceNumber,
                summary: 'Callback offered due to failed verification.',
                timestamp: timestamp(),
                claim: updatedClaim,
                ...(verifiedPolicyObj ? { verifiedPolicy: verifiedPolicyObj } : {}),
                conversationHistory: historyWithUser,
                escalationRequired: false
            })
        ).catch((err: unknown) => {
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
                    const hasTowing = recList.includes('towing') || recList.includes('roadside assistance');
                    const hasRental = recList.includes('rental car');
                    
                    let servicePrompt = '';
                    if (hasTowing && hasRental) {
                        servicePrompt = 'Would you like us to arrange towing for your vehicle and a rental car for you?';
                    } else if (hasTowing) {
                        servicePrompt = 'Would you like us to arrange towing or roadside assistance for your vehicle?';
                    } else if (hasRental) {
                        servicePrompt = 'Would you like us to arrange a rental car for you?';
                    } else {
                        servicePrompt = 'Do you need any additional assistance with your claim?';
                    }

                    const rawResponse = accumulatedResponse.trim();
                    const alreadyAsked = /towing|roadside|rental car|rent a car/i.test(rawResponse);
                    const responseMessage = alreadyAsked || !rawResponse
                        ? (rawResponse || servicePrompt)
                        : `${rawResponse} ${servicePrompt}`;

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
                        message: responseMessage
                    }, finalExtractionResult.debugMetrics);
                } else {
                    claimCompleted = true;
                }
            } else {
                const currentServices = updatedClaim.recommendedServices ?? state.currentClaim.recommendedServices;
                const parsed = parseServiceChoices(currentServices, message);
                updatedClaim.recommendedServices = parsed;
                if (parsed.includes('towing') || parsed.includes('roadside assistance')) {
                    updatedClaim.towingRequested = true;
                } else if (/\b(no towing|don'?t need towing|no tow truck|no tow)\b/i.test(message)) {
                    updatedClaim.towingRequested = false;
                }
                if (parsed.includes('rental car')) {
                    updatedClaim.rentalRequested = true;
                } else if (/\b(no rental|don'?t need a rental|no car rental|don'?t need to rent|no rent)\b/i.test(message)) {
                    updatedClaim.rentalRequested = false;
                }
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
    
    // ⭐ PRODUCTION NOTE: Async Background Persistence
    // The call to `claimLogger.log` involves network IO (Google Sheets).
    // If we `await` it here, the user is left in silence on the phone for 1-2 seconds.
    // By triggering it as a detached Promise, we instantly return the spoken response
    // to Retell, cutting TTS latency dramatically, while Sheets saves in the background.
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
