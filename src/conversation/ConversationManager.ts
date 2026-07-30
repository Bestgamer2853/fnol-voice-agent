import {
  REQUIRED_FNOL_FIELDS,
  type TrackableFnolField,
} from '../config/requiredFields.js';
import {
  COMPANY_NAME,
  MAX_VERIFICATION_RETRIES,
} from '../config/constants.js';
import type { ClaimLoggerService } from '../services/claimLogger.js';
import type { DetectContradictionsService } from '../services/detectContradictions.js';
import type { DetectSeverityService } from '../services/detectSeverity.js';
import type { ExtractClaimDataService } from '../services/extractClaimData.js';
import type { GenerateSummaryService } from '../services/generateSummary.js';
import type { GeminiClient } from '../services/geminiClient.js';
import type { RecommendServicesService } from '../services/recommendServices.js';
import type { VerifyPolicyService } from '../services/verifyPolicy.js';
import type { Claim } from '../types/claim.js';
import type { Vehicle } from '../types/common.js';
import type { ClaimNumberGenerator } from '../utils/claimNumber.js';
import type {
  ConversationAction,
  ConversationManager,
  ConversationTurnResult,
} from './actions.js';
import type { ConversationState } from './ConversationState.js';
import type { PromptBuilder } from './PromptBuilder.js';
import { EmpathyEngine } from './modules/EmpathyEngine.js';
import { TransitionManager } from './modules/TransitionManager.js';
import { FollowUpGenerator } from './modules/FollowUpGenerator.js';
import { SummaryGenerator } from './modules/SummaryGenerator.js';
import type {
  Contradiction,
  ConversationMessage,
  PendingClarification,
} from './types.js';

export interface ConversationManagerDependencies {
  verifyPolicy: VerifyPolicyService;
  detectSeverity: DetectSeverityService;
  detectContradictions: DetectContradictionsService;
  extractClaimData: ExtractClaimDataService;
  recommendServices: RecommendServicesService;
  generateSummary: GenerateSummaryService;
  claimLogger: ClaimLoggerService;
  promptBuilder: PromptBuilder;
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

function buildConfirmationMessage(input: {
  claimReferenceNumber: string;
  summary: string;
  escalationRequired: boolean;
  recommendedServices: readonly string[];
}): string {
  const nextSteps = input.escalationRequired
    ? 'An adjuster will urgently review the claim and contact the policyholder with next steps.'
    : 'The claims team will review the logged details and contact the policyholder with next steps.';
  const services =
    input.recommendedServices.length > 0
      ? ` Recommended services: ${input.recommendedServices.join(', ')}.`
      : '';

  return [
    `Claim ${input.claimReferenceNumber} has been completed.`,
    '',
    'Summary:',
    input.summary,
    '',
    `Next steps: ${nextSteps}${services}`,
  ].join('\n');
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
  ): Promise<ConversationTurnResult> {
    const extractedClaimPatch = isDebugMessage(message)
      ? parseDebugMessage(message).claimPatch
      : await this.dependencies.extractClaimData.extract({
          userMessage: message,
          state,
        });
    const parsedMessage: ParsedMessage = {
      claimPatch: validateClaimPatch(extractedClaimPatch),
      confirmationRequested: isConfirmationRequested(message),
    };
    const historyWithUser = appendMessage(
      state.conversationHistory,
      'user',
      message,
    );

    if (state.currentConversationStep === 'completed') {
      return this.withAssistantAction(
        {
          ...state,
          conversationHistory: historyWithUser,
          lastUserMessage: message,
        },
        {
          type: 'respond',
          message: 'This claim conversation is already completed.',
        },
      );
    }

    const updatedClaim = mergeClaim(state.currentClaim, parsedMessage.claimPatch);

    if (!state.verifiedPolicy) {
      if (state.currentConversationStep === 'safety_check') {
          const isSafe = /\b(yes|safe|fine|okay|we are|i am|no injuries|everyone is ok|nobody is hurt)\b/i.test(message) && !/\b(no|not safe|hurt|injured|ambulance|hospital|bleeding)\b/i.test(message);
          const isHurt = /\b(no|not safe|hurt|injured|ambulance|hospital|bleeding|pain)\b/i.test(message);
          
          if (isHurt || !isSafe) {
              return this.withAssistantAction(
                  { ...state, conversationHistory: historyWithUser, currentConversationStep: 'escalation' },
                  { type: 'escalate', message: 'I understand this is an emergency. Please hang up and dial emergency services immediately. An adjuster will review this urgently.', reason: 'safety_check_failed' }
              );
          }
          
          const nextState = this.updateFieldTracking({
              ...state,
              conversationHistory: historyWithUser,
              currentConversationStep: 'verification',
              lastUserMessage: message,
          });
          
          return this.withAssistantAction(nextState, {
              type: 'respond',
              message: 'I am glad to hear everyone is safe. Please provide your policy number and caller name so we can get started.'
          });
      }

      return this.handleVerification(state, updatedClaim, historyWithUser, message);
    }

    if (
      parsedMessage.confirmationRequested &&
      state.currentConversationStep === 'recommending_services'
    ) {
      return this.completeClaim(state, updatedClaim, historyWithUser, message);
    }

    if (state.currentConversationStep === 'reviewing_summary') {
        const isConfirmed = /\b(yes|correct|right|good|sound good|confirm|looks good)\b/i.test(message);
        if (isConfirmed) {
            return this.recommendServices(this.updateFieldTracking({
               ...state,
               currentClaim: updatedClaim,
               conversationHistory: historyWithUser,
               lastUserMessage: message
            }));
        } else {
            return this.withAssistantAction({
                ...state,
                conversationHistory: historyWithUser,
                currentConversationStep: 'collecting_fnol'
            }, {
                type: 'respond',
                message: 'I apologize. What part of the claim needs to be corrected?'
            });
        }
    }

    const contradictionResult = await this.dependencies.detectContradictions.detect({
      previousClaim: state.currentClaim,
      updatedClaim,
    });
    
    let contradictionPrefix = "";
    if (contradictionResult.contradictions.length > 0) {
       contradictionPrefix = "Thanks for clarifying. ";
    }

    if (
      state.currentConversationStep === 'escalation' &&
      state.missingFields.length === 0
    ) {
      return this.recommendServices(
        this.updateFieldTracking({
          ...state,
          currentClaim: updatedClaim,
          conversationHistory: historyWithUser,
          lastUserMessage: message,
        }),
      );
    }

    const severityResult = await this.dependencies.detectSeverity.detect({
      claim: updatedClaim,
    });
    const trackedState = this.updateFieldTracking({
      ...state,
      currentClaim: updatedClaim,
      conversationHistory: historyWithUser,
      currentConversationStep: 'collecting_fnol',
      severity: severityResult.severity,
      escalationRequired: severityResult.escalationRequired,
      pendingClarifications: [],
      lastUserMessage: message,
    });

    if (trackedState.missingFields.length > 0) {
      const empathyEngine = new EmpathyEngine();
      const { phrase: empathyPhrase, updatedPhrasesUsed } = empathyEngine.generateEmpathy(trackedState, message);
      
      const transitionManager = new TransitionManager();
      const transitionPhrase = transitionManager.generateTransition(trackedState);
      
      const followUpGen = new FollowUpGenerator();
      const followUp = followUpGen.generateFollowUp(trackedState);

      const nextMessage = contradictionPrefix + (empathyPhrase ? empathyPhrase + " " : "") + transitionPhrase + (followUp ? followUp : firstMissingFieldPrompt(trackedState.missingFields));

      return this.withAssistantAction({
        ...trackedState,
        empathyPhrasesUsed: updatedPhrasesUsed
      }, {
        type: 'respond',
        message: nextMessage,
      });
    }

    if (severityResult.escalationRequired) {
      return this.withAssistantAction(
        {
          ...trackedState,
          currentConversationStep: 'escalation',
        },
        {
          type: 'escalate',
          message: 'This claim has been flagged for urgent adjuster review.',
          reason: severityResult.reasons.join(' '),
        },
      );
    }

    const summaryGen = new SummaryGenerator();
    return this.withAssistantAction({
       ...trackedState,
       currentConversationStep: 'reviewing_summary'
    }, {
       type: 'respond',
       message: summaryGen.generatePreSubmissionSummary(trackedState)
    });
  }

  private async handleVerification(
    state: ConversationState,
    updatedClaim: Claim,
    conversationHistory: ConversationMessage[],
    message: string,
  ): Promise<ConversationTurnResult> {
    const nextState = this.updateFieldTracking({
      ...state,
      currentClaim: updatedClaim,
      conversationHistory,
      currentConversationStep: 'verification',
      lastUserMessage: message,
    });

    const policyNumber = updatedClaim.policyNumber;
    const callerName = updatedClaim.callerName;

    if (!hasText(policyNumber) || !hasText(callerName)) {
      return this.withAssistantAction(nextState, {
        type: 'request_clarification',
        message: 'Please provide both policyNumber and callerName.',
      });
    }

    const verificationResult = await this.dependencies.verifyPolicy.verify({
      policyNumber,
      callerName,
    });

    if (!verificationResult.verified) {
      const retryCount = state.retryCount + 1;
      const failedState = this.updateFieldTracking({
        ...nextState,
        retryCount,
      });

      if (retryCount >= MAX_VERIFICATION_RETRIES) {
        return this.withAssistantAction(
          {
            ...failedState,
            currentConversationStep: 'callback_offer',
          },
          {
            type: 'offer_callback',
            message: 'I could not verify the policy. I can arrange a callback from the claims team.',
          },
        );
      }

      return this.withAssistantAction(failedState, {
        type: 'request_clarification',
        message: verificationResult.message,
      });
    }

    const verifiedClaim = mergeClaim(updatedClaim, {
      policyNumber: verificationResult.policy.policyNumber,
      callerName: verificationResult.policy.policyholderName,
      insuredVehicle: verificationResult.policy.vehicle,
    });
    const verifiedState = this.updateFieldTracking({
      ...nextState,
      currentClaim: verifiedClaim,
      verifiedPolicy: verificationResult.policy,
      retryCount: 0,
      currentConversationStep: 'collecting_fnol',
    });

    return this.withAssistantAction(verifiedState, {
      type: 'respond',
      message: firstMissingFieldPrompt(verifiedState.missingFields),
    });
  }

  private async recommendServices(
    state: ConversationState,
  ): Promise<ConversationTurnResult> {
    if (!state.verifiedPolicy) {
      return this.withAssistantAction(state, {
        type: 'request_clarification',
        message: 'Please verify the policy before service recommendations.',
      });
    }

    const recommendationResult = await this.dependencies.recommendServices.recommend({
      claim: state.currentClaim,
      policy: state.verifiedPolicy,
    });
    const claimWithRecommendations: Claim = {
      ...state.currentClaim,
      recommendedServices: recommendationResult.recommendations,
    };
    const nextState = this.updateFieldTracking({
      ...state,
      currentClaim: claimWithRecommendations,
      currentConversationStep: 'recommending_services',
    });

    return this.withAssistantAction(nextState, {
      type: 'recommend_services',
      message: 'Recommended services are ready. Reply with confirm=true to complete the claim.',
      services: recommendationResult.recommendations,
    });
  }

  private async completeClaim(
    state: ConversationState,
    updatedClaim: Claim,
    conversationHistory: ConversationMessage[],
    message: string,
  ): Promise<ConversationTurnResult> {
    if (!state.verifiedPolicy) {
      return this.withAssistantAction(state, {
        type: 'request_clarification',
        message: 'Please verify the policy before completing the claim.',
      });
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
    const confirmationMessage = buildConfirmationMessage({
      claimReferenceNumber,
      summary: persistedSummary,
      escalationRequired: nextState.escalationRequired,
      recommendedServices: claimWithSummary.recommendedServices ?? [],
    });

    await this.dependencies.claimLogger.log({
      claimNumber: claimReferenceNumber,
      summary: persistedSummary,
      timestamp: timestamp(),
      claim: claimWithSummary,
      verifiedPolicy: state.verifiedPolicy,
      conversationHistory,
      severity: nextState.severity ?? summaryResult.severity,
      escalationRequired: nextState.escalationRequired,
    });

    return this.withAssistantAction(nextState, {
      type: 'complete',
      message: confirmationMessage,
      claim: claimWithSummary,
    });
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
  ): Promise<ConversationTurnResult> {
    const renderedAction = await this.renderAssistantAction(state, action);
    const nextHistory = appendMessage(
      state.conversationHistory,
      'assistant',
      renderedAction.message,
    );

    return {
      state: {
        ...state,
        conversationHistory: nextHistory,
        lastAssistantMessage: renderedAction.message,
      },
      action: renderedAction,
    };
  }

  private async renderAssistantAction(
    state: ConversationState,
    action: ConversationAction,
  ): Promise<ConversationAction> {
    const systemPrompt = this.dependencies.promptBuilder.buildSystemPrompt(
      state,
      action,
    );
    const conversationContext =
      this.dependencies.promptBuilder.buildConversationContext(state);
    const userPrompt = this.dependencies.promptBuilder.buildUserPrompt(
      state,
      action,
    );
    const response = await this.dependencies.geminiClient.generateAssistantResponse({
      systemPrompt,
      conversationContext,
      userPrompt,
    });
    const assistantMessage =
      response.errorMessage && action.message.trim().length > 0
        ? action.message
        : response.assistantResponse;

    return {
      ...action,
      message: assistantMessage,
    };
  }
}

export function createConversationManager(
  dependencies: ConversationManagerDependencies,
): ConversationManager {
  return new DefaultConversationManager(dependencies);
}

export type { ConversationManager };
