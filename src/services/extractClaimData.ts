import type { ConversationState } from '../conversation/ConversationState.js';
import type { ConversationStep } from '../conversation/types.js';
import type { Claim } from '../types/claim.js';
import type { Vehicle } from '../types/common.js';
import type { GeminiClient } from './geminiClient.js';

export interface ExtractClaimDataInput {
  userMessage: string;
  state: ConversationState;
}

export interface ExtractClaimDataResult {
  acknowledgement: string;
  updatedClaim: Partial<Claim>;
  missingFields: string[];
  conversationStage: ConversationStep;
  nextQuestion: string;
  conversationAnalysis: string;
  debugMetrics: {
    rawExtractedSlots: unknown;
    geminiPrompt: string;
    geminiResponse: string;
  };
}

export interface ExtractClaimDataService {
  extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult>;
}

interface ExtractClaimDataServiceOptions {
  geminiClient: GeminiClient;
}

type ExtractableTextField =
  | 'policyNumber'
  | 'callerName'
  | 'dateOfIncident'
  | 'timeOfIncident'
  | 'locationOfIncident'
  | 'incidentDescription'
  | 'otherParties'
  | 'injuryDetails'
  | 'policeReportReference';

type ExtractableBooleanField =
  | 'injuriesReported'
  | 'policeReportFiled'
  | 'photosAvailable'
  | 'vehicleDrivable';

const TEXT_FIELDS = [
  'policyNumber',
  'callerName',
  'dateOfIncident',
  'timeOfIncident',
  'locationOfIncident',
  'incidentDescription',
  'otherParties',
  'injuryDetails',
  'policeReportReference',
] as const satisfies readonly ExtractableTextField[];

const BOOLEAN_FIELDS = [
  'injuriesReported',
  'policeReportFiled',
  'photosAvailable',
  'vehicleDrivable',
] as const satisfies readonly ExtractableBooleanField[];

const VEHICLE_FIELDS = ['make', 'model', 'registration'] as const satisfies readonly (keyof Vehicle)[];
const POLICY_NUMBER_PATTERN = /\b[A-Z]{2,5}-\d{4,8}\b/i;
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/;
const TIME_PATTERN = /\b(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?\b/i;

function extractJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidate = fencedMatch?.[1] ?? trimmed;
  const startIndex = candidate.indexOf('{');
  const endIndex = candidate.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {};
  }

  try {
    return JSON.parse(candidate.slice(startIndex, endIndex + 1)) as unknown;
  } catch {
    return {};
  }
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];

  return typeof value === 'boolean' ? value : undefined;
}

function sanitizeExtractedClaimPatch(value: unknown): Partial<Claim> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const claimPatch: Partial<Claim> = {};

  for (const field of TEXT_FIELDS) {
    const extractedValue = readString(record, field);

    if (extractedValue) {
      claimPatch[field] = extractedValue;
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    const extractedValue = readBoolean(record, field);

    if (extractedValue !== undefined) {
      claimPatch[field] = extractedValue;
    }
  }

  const vehicle = record.insuredVehicle;

  if (typeof vehicle === 'object' && vehicle !== null) {
    const vehicleRecord = vehicle as Record<string, unknown>;
    const vehiclePatch: Vehicle = {};

    for (const field of VEHICLE_FIELDS) {
      const extractedValue = readString(vehicleRecord, field);

      if (extractedValue) {
        vehiclePatch[field] = extractedValue;
      }
    }

    if (Object.keys(vehiclePatch).length > 0) {
      claimPatch.insuredVehicle = vehiclePatch;
    }
  }

  return claimPatch;
}

function buildExtractionContext(state: ConversationState): string {
  const historyStr = state.conversationHistory
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n');

  return [
    `conversationStep: ${state.currentConversationStep}`,
    `missingFields: ${state.missingFields.join(', ') || 'none'}`,
    `knownPolicyNumber: ${state.currentClaim.policyNumber ?? 'unknown'}`,
    `knownCallerName: ${state.currentClaim.callerName ?? 'unknown'}`,
    `knownDateOfIncident: ${state.currentClaim.dateOfIncident ?? 'unknown'}`,
    `knownTimeOfIncident: ${state.currentClaim.timeOfIncident ?? 'unknown'}`,
    `knownLocationOfIncident: ${state.currentClaim.locationOfIncident ?? 'unknown'}`,
    `knownVehicleDrivable: ${String(state.currentClaim.vehicleDrivable ?? 'unknown')}`,
    `knownInjuriesReported: ${String(state.currentClaim.injuriesReported ?? 'unknown')}`,
    `knownPoliceReportFiled: ${String(state.currentClaim.policeReportFiled ?? 'unknown')}`,
    `knownPhotosAvailable: ${String(state.currentClaim.photosAvailable ?? 'unknown')}`,
    `\nCONVERSATION HISTORY:\n${historyStr}`,
  ].join('\n');
}

function sentenceCaseName(value: string): string {
  return value
    .trim()
    .replace(/[.!,;:]$/g, '')
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function extractCallerName(message: string): string | undefined {
  const patterns = [
    /\bmy name is\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i,
    /\bi am\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i,
    /\bthis is\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(message);

    if (match?.[1]) {
      return sentenceCaseName(match[1]);
    }
  }

  return undefined;
}

function extractLocation(message: string): string | undefined {
  const match = /\b(?:near|at|on|in)\s+([A-Z][A-Za-z0-9\s,.'-]*?(?:Road|Street|Avenue|Highway|Junction|Bengaluru|Bangalore|Chennai|Mumbai|Delhi|Pune|Hyderabad|Kolkata|Gurugram|Noida)\b(?:,\s*[A-Z][A-Za-z\s.'-]+)?)/i.exec(message);

  return match?.[1]?.trim().replace(/[.!,;:]$/g, '');
}

function extractIncidentDescription(message: string): string | undefined {
  const normalized = message.trim();

  if (
    /\b(accident|collision|collided|crash|crashed|hit|damage|damaged|bumper|rolled over|rollover|rear[- ]?ended)\b/i.test(
      normalized,
    )
  ) {
    return normalized;
  }

  return undefined;
}

function extractTimeOfIncident(message: string): string | undefined {
  const explicitTime = /\b(?:at|around|about)\s+((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?)\b/i.exec(message)?.[1];

  if (explicitTime) {
    return explicitTime.trim();
  }

  const clockTime = TIME_PATTERN.exec(message)?.[0];

  if (clockTime) {
    return clockTime.trim();
  }

  const dayPart = /\b(morning|afternoon|evening|night|noon|midnight)\b/i.exec(message)?.[1];

  return dayPart?.toLowerCase();
}

function extractFallbackClaimPatch(message: string): Partial<Claim> {
  const patch: Partial<Claim> = {};
  const policyNumber = POLICY_NUMBER_PATTERN.exec(message)?.[0]?.toUpperCase();
  const callerName = extractCallerName(message);
  const dateOfIncident = ISO_DATE_PATTERN.exec(message)?.[0];
  const timeOfIncident = extractTimeOfIncident(message);
  const locationOfIncident = extractLocation(message);
  const incidentDescription = extractIncidentDescription(message);

  if (policyNumber) {
    patch.policyNumber = policyNumber;
  }

  if (callerName) {
    patch.callerName = callerName;
  }

  if (dateOfIncident) {
    patch.dateOfIncident = dateOfIncident;
  }

  if (timeOfIncident) {
    patch.timeOfIncident = timeOfIncident;
  }

  if (locationOfIncident) {
    patch.locationOfIncident = locationOfIncident;
  }

  if (incidentDescription) {
    patch.incidentDescription = incidentDescription;
  }

  if (/\b(no one|nobody|no injuries|not injured|without injuries)\b/i.test(message)) {
    patch.injuriesReported = false;
  } else if (/\b(injur|hurt|ambulance|hospital|medical)\b/i.test(message)) {
    patch.injuriesReported = true;
  }

  if (/\b(no police report|police report was not|no report was filed)\b/i.test(message)) {
    patch.policeReportFiled = false;
  } else if (/\b(police report|police came|reported to police|fir)\b/i.test(message)) {
    patch.policeReportFiled = true;
  }

  if (/\b(no photos|no pictures|without photos)\b/i.test(message)) {
    patch.photosAvailable = false;
  } else if (/\b(photos|pictures|images)\b/i.test(message)) {
    patch.photosAvailable = true;
  }

  if (/\b(not drivable|not driveable|isn't drivable|cannot be driven|can't drive|towed)\b/i.test(message)) {
    patch.vehicleDrivable = false;
  } else if (/\b(drivable|driveable|can drive|still drives)\b/i.test(message)) {
    patch.vehicleDrivable = true;
  }

  if (/\b(other car|other driver|third party|another vehicle|one other)\b/i.test(message)) {
    patch.otherParties = 'Other party involved';
  }

  return sanitizeExtractedClaimPatch(patch);
}

function getFallbackResult(message: string, state: ConversationState): ExtractClaimDataResult {
  let nextQuestion = 'Could you tell me more about what happened?';
  if (state.missingFields.length > 0) {
    const firstField = state.missingFields[0];
    if (firstField) {
      const field = firstField.replace(/([A-Z])/g, ' $1').toLowerCase();
      nextQuestion = `I didn't quite catch that. Could you please provide the ${field}?`;
    }
  }
  
  return {
    acknowledgement: '',
    updatedClaim: extractFallbackClaimPatch(message),
    missingFields: state.missingFields,
    conversationStage: state.currentConversationStep,
    nextQuestion,
    conversationAnalysis: 'Fallback triggered due to LLM error or empty response',
    debugMetrics: {
      rawExtractedSlots: {},
      geminiPrompt: '',
      geminiResponse: '',
    }
  };
}

export class GeminiExtractClaimDataService implements ExtractClaimDataService {
  constructor(private readonly options: ExtractClaimDataServiceOptions) {}

  async extract(input: ExtractClaimDataInput): Promise<ExtractClaimDataResult> {
    const systemPrompt = [
      'You are an expert conversational AI agent for FNOL motor insurance claims.',
      'You must drive the conversation natively, handling safety checks, empathy, and data extraction.',
      'Return ONLY a JSON object with these exact keys:',
      '  - acknowledgement: string (Acknowledge user input, show empathy if needed, or leave empty)',
      '  - extractedSlots: object (Keys are field names. Values are objects: { "value": any, "confidence": number } where confidence is 0.0 to 1.0)',
      '  - missingFields: string[] (List of remaining fields you still need to collect)',
      '  - conversationStage: string (Current stage: safety_check, verification, collecting_fnol, escalation, completed)',
      '  - nextQuestion: string (The natural next question to ask the user)',
      '  - conversationAnalysis: string (Internal reasoning on what the user said and why you chose the next question)',
      '',
      'IMPORTANT RULES:',
      '1. Never ask for information already present in the transcript or existing state.',
      '2. Robustly normalize ASR imperfections (e.g. "em em eye one zero" -> "MMI-10", "twenty three" -> 23).',
      '3. If the user mentions injury or safety issues, dynamically transition or escalate if severe.',
      '4. If you assign a confidence below 0.7 to any extracted slot, your nextQuestion MUST be a natural confirmation of that specific value instead of moving on.',
      '5. Allowed extractedSlots keys: policyNumber, callerName, dateOfIncident, timeOfIncident, locationOfIncident, incidentDescription, otherParties, injuryDetails, policeReportReference, injuriesReported, policeReportFiled, photosAvailable, vehicleDrivable, insuredVehicle.',
      '6. Use booleans only for true/false fields.',
      '7. insuredVehicle may contain make, model, registration.',
    ].join('\n');
    const conversationContext = buildExtractionContext(input.state);
    const userPrompt = [
      'Analyze the user message and the conversation history.',
      'Generate the appropriate conversational response and extract any claim data.',
      '',
      `User message: ${input.userMessage}`,
    ].join('\n');

    const result = await this.options.geminiClient.generateAssistantResponse({
      systemPrompt,
      conversationContext,
      userPrompt,
      responseMimeType: 'application/json',
    });

    if (result.errorMessage) {
      console.error('[Gemini Extract Error]', result.errorMessage);
      return getFallbackResult(input.userMessage, input.state);
    }

    const parsed = extractJsonObject(result.assistantResponse);
    if (typeof parsed !== 'object' || parsed === null) {
      console.error('[Gemini Parse Error]', result.assistantResponse);
      return getFallbackResult(input.userMessage, input.state);
    }

    const record = parsed as Record<string, unknown>;
    
    const extractedSlots = record.extractedSlots;
    const highConfidenceFields: Record<string, unknown> = {};
    
    if (typeof extractedSlots === 'object' && extractedSlots !== null) {
      for (const [key, slotObj] of Object.entries(extractedSlots)) {
        if (typeof slotObj === 'object' && slotObj !== null) {
          const slot = slotObj as Record<string, unknown>;
          const confidence = typeof slot.confidence === 'number' ? slot.confidence : 0;
          if (confidence >= 0.7 && slot.value !== undefined) {
             highConfidenceFields[key] = slot.value;
          }
        }
      }
    }

    const finalResult: ExtractClaimDataResult = {
      acknowledgement: typeof record.acknowledgement === 'string' ? record.acknowledgement : '',
      updatedClaim: sanitizeExtractedClaimPatch(highConfidenceFields),
      missingFields: Array.isArray(record.missingFields) ? record.missingFields.map(String) : [],
      conversationStage: typeof record.conversationStage === 'string' ? record.conversationStage as ConversationStep : input.state.currentConversationStep,
      nextQuestion: typeof record.nextQuestion === 'string' ? record.nextQuestion : 'What else can you tell me?',
      conversationAnalysis: typeof record.conversationAnalysis === 'string' ? record.conversationAnalysis : '',
      debugMetrics: {
        rawExtractedSlots: extractedSlots,
        geminiPrompt: systemPrompt + '\n' + conversationContext + '\n' + userPrompt,
        geminiResponse: result.assistantResponse,
      }
    };

    return finalResult;
  }
}

export function createExtractClaimDataService(
  options: ExtractClaimDataServiceOptions,
): ExtractClaimDataService {
  return new GeminiExtractClaimDataService(options);
}
